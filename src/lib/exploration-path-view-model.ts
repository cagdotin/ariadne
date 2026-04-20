/**
 * Path view model for the Exploration left pane.
 *
 * Derives a turn-by-turn action sequence directly from SessionGraphPayload,
 * bypassing the exploration adapter. Pure functions, no DOM/React.
 */

import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";
import { classify_tool_action } from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

export type ActionKind =
	| "search"
	| "file_read"
	| "doc_read"
	| "file_edit"
	| "file_write"
	| "opaque";

export interface PathAction {
	tool_node_id: string;
	action_kind: ActionKind;
	label: string;
	target_node_id: string | null;
	target_label: string | null;
	precedes_edit: boolean;
	is_revisit: boolean;
	is_error: boolean;
}

export interface TurnSummary {
	searches: number;
	reads: number;
	edits: number;
	writes: number;
	opaque: number;
}

export interface PathTurn {
	turn_index: number;
	user_message: string;
	user_prompt_node_id: string;
	turn_node_id: string | null;
	actions: PathAction[];
	summary: TurnSummary;
}

export interface PathSelectionTarget {
	turn_index: number;
	row_kind: "turn" | "action";
	action_tool_node_id: string | null;
}

// ── Classification ──────────────────────────────────────────────────────────

/** Map shared ToolCategory → path-specific ActionKind. */
function classify_tool(tool_node: GraphNode): ActionKind {
	if (tool_node.kind === "search_query") return "search";

	const tool_name = (tool_node.metadata?.tool_name as string) ?? "";
	const file_path = (tool_node.metadata?.file_path as string) ?? undefined;
	const category = classify_tool_action(tool_name, file_path);

	switch (category) {
		case "search":
			return "search";
		case "read":
			return "file_read";
		case "doc_read":
			return "doc_read";
		case "edit":
			return "file_edit";
		case "write":
			return "file_write";
		default:
			return "opaque";
	}
}

function get_tool_index(tool_node: GraphNode | undefined): number {
	const tool_index = tool_node?.metadata?.tool_index;
	return typeof tool_index === "number" ? tool_index : Number.MAX_SAFE_INTEGER;
}

// ── Main derivation ─────────────────────────────────────────────────────────

/**
 * Derive the path turn sequence from a SessionGraphPayload.
 */
export function compute_path_turns(graph: SessionGraphPayload): PathTurn[] {
	const node_map = new Map<string, GraphNode>();
	for (const n of graph.nodes) node_map.set(n.id, n);

	// Track which file IDs have been seen across turns for revisit detection
	const seen_file_ids = new Set<string>();

	// Pre-compute edited target IDs for precedes_edit detection
	const edited_targets = new Set<string>();
	for (const e of graph.edges) {
		if (e.kind === "edited" || e.kind === "wrote") {
			edited_targets.add(e.target_id);
		}
	}

	// Find user_prompt nodes sorted by turn_index
	const user_prompts = graph.nodes
		.filter((n) => n.kind === "user_prompt")
		.sort((a, b) => {
			const ai = (a.metadata?.turn_index as number) ?? 0;
			const bi = (b.metadata?.turn_index as number) ?? 0;
			return ai - bi;
		});

	const result: PathTurn[] = [];

	for (const user_node of user_prompts) {
		const turn_index =
			(user_node.metadata?.turn_index as number) ?? result.length;
		const user_message =
			(user_node.metadata?.text as string) ??
			user_node.label.replace(/^User:\s*/, "");

		// Find matching assistant_turn
		const turn_node = graph.nodes.find(
			(n) =>
				n.kind === "assistant_turn" &&
				(n.metadata?.turn_index as number) === turn_index,
		);

		const actions: PathAction[] = [];

		if (turn_node) {
			// Get tool edges in explicit invocation order
			const tool_edges = graph.edges
				.filter(
					(e) => e.source_id === turn_node.id && e.kind === "invoked_tool",
				)
				.sort((left, right) => {
					const left_tool = node_map.get(left.target_id);
					const right_tool = node_map.get(right.target_id);
					return get_tool_index(left_tool) - get_tool_index(right_tool);
				});

			// Collect all actions with their targets
			const action_entries: Array<{
				tool_node: GraphNode;
				file_edge: GraphEdge | undefined;
			}> = [];

			for (const te of tool_edges) {
				const tool_node = node_map.get(te.target_id);
				if (!tool_node) continue;

				const file_edge = graph.edges.find(
					(e) =>
						e.source_id === tool_node.id &&
						(e.kind === "read" || e.kind === "edited" || e.kind === "wrote"),
				);

				action_entries.push({ tool_node, file_edge });
			}

			// Build a set of targets edited in this turn for precedes_edit
			const edited_in_turn = new Set<string>();
			for (const { tool_node, file_edge } of action_entries) {
				const kind = classify_tool(tool_node);
				if ((kind === "file_edit" || kind === "file_write") && file_edge) {
					edited_in_turn.add(file_edge.target_id);
				}
			}

			for (const { tool_node, file_edge } of action_entries) {
				const action_kind = classify_tool(tool_node);
				const target_node_id = file_edge?.target_id ?? null;
				const target_node = target_node_id
					? node_map.get(target_node_id)
					: null;

				const is_revisit =
					target_node_id !== null && seen_file_ids.has(target_node_id);
				const precedes_edit =
					action_kind === "file_read" &&
					target_node_id !== null &&
					edited_in_turn.has(target_node_id);

				actions.push({
					tool_node_id: tool_node.id,
					action_kind,
					label: tool_node.label,
					target_node_id,
					target_label: target_node?.label ?? null,
					precedes_edit,
					is_revisit,
					is_error: false,
				});

				if (target_node_id) seen_file_ids.add(target_node_id);
			}
		}

		const summary: TurnSummary = {
			searches: actions.filter((a) => a.action_kind === "search").length,
			reads: actions.filter(
				(a) => a.action_kind === "file_read" || a.action_kind === "doc_read",
			).length,
			edits: actions.filter((a) => a.action_kind === "file_edit").length,
			writes: actions.filter((a) => a.action_kind === "file_write").length,
			opaque: actions.filter((a) => a.action_kind === "opaque").length,
		};

		result.push({
			turn_index,
			user_message,
			user_prompt_node_id: user_node.id,
			turn_node_id: turn_node?.id ?? null,
			actions,
			summary,
		});
	}

	return result;
}

/**
 * Resolve which left-pane row should represent the current shared selection.
 *
 * The path pane is organized by turns and action rows rather than by arbitrary
 * graph nodes, so some selected graph nodes map to their nearest owning row.
 */
export function resolve_path_selection_target(
	selected_node_id: string | null,
	path_turns: PathTurn[],
): PathSelectionTarget | null {
	if (!selected_node_id) return null;

	for (const turn of path_turns) {
		if (
			selected_node_id === turn.user_prompt_node_id ||
			selected_node_id === turn.turn_node_id
		) {
			return {
				turn_index: turn.turn_index,
				row_kind: "turn",
				action_tool_node_id: null,
			};
		}
	}

	for (const turn of path_turns) {
		for (const action of turn.actions) {
			if (selected_node_id === action.tool_node_id) {
				return {
					turn_index: turn.turn_index,
					row_kind: "action",
					action_tool_node_id: action.tool_node_id,
				};
			}
		}
	}

	for (const turn of path_turns) {
		for (const action of turn.actions) {
			if (selected_node_id === action.target_node_id) {
				return {
					turn_index: turn.turn_index,
					row_kind: "action",
					action_tool_node_id: action.tool_node_id,
				};
			}
		}
	}

	return null;
}
