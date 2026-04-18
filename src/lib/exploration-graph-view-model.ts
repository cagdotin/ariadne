/**
 * Graph-native view model for the Exploration visualization.
 *
 * Pure functions that derive presentation state from SessionGraphPayload.
 * These are renderer-side helpers — no DOM, no React, fully testable.
 */

import type {
	AvailabilityState,
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

export type LaneId =
	| "framing"
	| "prompts"
	| "discovery"
	| "docs"
	| "files"
	| "outputs"
	| "context";

export type StylingState = "observed" | "ambient" | "inferred" | "unavailable";

export type FocusMode = "path" | "influence" | "neighborhood";

export interface MapNode {
	node: GraphNode;
	lane: LaneId;
	is_edited: boolean;
}

export interface MapEdge {
	source_id: string;
	target_id: string;
	kind: GraphEdge["kind"];
	availability: AvailabilityState;
}

export interface SelectionSubgraph {
	highlighted_node_ids: Set<string>;
	highlighted_edge_keys: Set<string>;
}

export interface GraphSummary {
	turns: number;
	searches: number;
	docs_read: number;
	files_read: number;
	files_edited: number;
	framing_sources: number;
	unavailable_framing: number;
}

export type ConnectorEmphasis = "primary" | "secondary";

export interface RouteConnector {
	source_id: string;
	target_id: string;
	kind: GraphEdge["kind"];
	emphasis: ConnectorEmphasis;
	styling: StylingState;
}

export interface VisibilityOptions {
	show_ambient?: boolean;
	show_inferred?: boolean;
	show_unexplored?: boolean;
	only_selected_subgraph?: boolean;
	only_edited_path?: boolean;
	/** Required when only_selected_subgraph is true */
	highlighted_node_ids?: Set<string>;
	/**
	 * When true, the map defaults to artifact lanes only (docs, files,
	 * outputs, context). Narrative lanes (framing, prompts, discovery)
	 * are hidden unless they appear in `scaffolding_node_ids`.
	 */
	artifact_first?: boolean;
	/**
	 * Node IDs to reintroduce from narrative lanes even when
	 * artifact_first is true (selection-driven scaffolding).
	 */
	scaffolding_node_ids?: Set<string>;
	/**
	 * When set, only nodes in this set pass the temporal filter.
	 * Used for built-so-far and arrival-path views.
	 */
	temporally_visible_node_ids?: Set<string>;
}

// ── Lane ordering (for rendering) ───────────────────────────────────────────

export const lane_order: LaneId[] = [
	"framing",
	"prompts",
	"discovery",
	"docs",
	"files",
	"outputs",
	"context",
];

export const lane_labels: Record<LaneId, string> = {
	framing: "Framing",
	prompts: "Prompts",
	discovery: "Discovery",
	docs: "Docs",
	files: "Files Read",
	outputs: "Outputs",
	context: "Context",
};

// ── Lane assignment ─────────────────────────────────────────────────────────

/** Lanes hidden by default when artifact_first is true. */
const narrative_lanes = new Set<LaneId>(["framing", "prompts", "discovery"]);

const framing_kinds = new Set<string>([
	"session_framing",
	"runtime_context",
	"system_prompt",
	"developer_prompt",
	"agents_doc",
	"instruction_source",
]);

const prompt_kinds = new Set<string>(["user_prompt", "assistant_turn"]);
const discovery_kinds = new Set<string>(["search_query", "tool_call"]);
const doc_kinds = new Set<string>(["doc_file", "doc_section"]);

/**
 * Assign each graph node to a semantic lane for the layered context map.
 */
export function assign_lanes(
	graph: SessionGraphPayload,
): Map<string, LaneId> {
	const lanes = new Map<string, LaneId>();

	// Pre-compute which file IDs have been edited/written
	const edited_file_ids = new Set<string>();
	const adjacent_file_ids = new Set<string>();

	for (const edge of graph.edges) {
		if (edge.kind === "edited" || edge.kind === "wrote") {
			edited_file_ids.add(edge.target_id);
		}
		if (edge.kind === "adjacent_unexplored") {
			adjacent_file_ids.add(edge.target_id);
		}
	}

	for (const node of graph.nodes) {
		if (node.kind === "session") {
			// session node is excluded from map, but assign for completeness
			lanes.set(node.id, "framing");
			continue;
		}

		if (framing_kinds.has(node.kind)) {
			lanes.set(node.id, "framing");
		} else if (prompt_kinds.has(node.kind)) {
			lanes.set(node.id, "prompts");
		} else if (discovery_kinds.has(node.kind)) {
			lanes.set(node.id, "discovery");
		} else if (doc_kinds.has(node.kind)) {
			lanes.set(node.id, "docs");
		} else if (node.kind === "source_file" || node.kind === "directory") {
			if (adjacent_file_ids.has(node.id)) {
				lanes.set(node.id, "context");
			} else if (edited_file_ids.has(node.id)) {
				lanes.set(node.id, "outputs");
			} else {
				lanes.set(node.id, "files");
			}
		} else {
			lanes.set(node.id, "context");
		}
	}

	return lanes;
}

// ── Map nodes ───────────────────────────────────────────────────────────────

/**
 * Compute the set of nodes visible in the context map.
 * Excludes the top-level session node.
 * Respects all VisibilityOptions filters.
 */
export function compute_map_nodes(
	graph: SessionGraphPayload,
	lanes: Map<string, LaneId>,
	options: VisibilityOptions = {},
): MapNode[] {
	const {
		show_ambient = true,
		show_inferred = true,
		show_unexplored = true,
		only_selected_subgraph = false,
		only_edited_path = false,
		highlighted_node_ids,
		artifact_first = false,
		scaffolding_node_ids,
		temporally_visible_node_ids,
	} = options;

	const edited_file_ids = new Set<string>();
	const adjacent_file_ids = new Set<string>();
	for (const edge of graph.edges) {
		if (edge.kind === "edited" || edge.kind === "wrote") {
			edited_file_ids.add(edge.target_id);
		}
		if (edge.kind === "adjacent_unexplored") {
			adjacent_file_ids.add(edge.target_id);
		}
	}

	// Pre-compute edited path node IDs if needed
	let edited_path_ids: Set<string> | null = null;
	if (only_edited_path) {
		edited_path_ids = compute_edited_path_ids(graph);
	}

	return graph.nodes
		.filter((n) => n.kind !== "session")
		.filter((n) => show_ambient || n.availability !== "available_ambient")
		.filter((n) => show_inferred || n.availability !== "derived_inferred")
		.filter((n) => show_unexplored || !adjacent_file_ids.has(n.id))
		.filter((n) => !only_selected_subgraph || !highlighted_node_ids || highlighted_node_ids.has(n.id))
		.filter((n) => !only_edited_path || !edited_path_ids || edited_path_ids.has(n.id))
		.filter((n) => !temporally_visible_node_ids || temporally_visible_node_ids.has(n.id))
		.filter((n) => {
			if (!artifact_first) return true;
			const lane = lanes.get(n.id) ?? "context";
			if (!narrative_lanes.has(lane)) return true;
			// Allow scaffolding nodes through even in artifact-first mode
			return scaffolding_node_ids?.has(n.id) ?? false;
		})
		.map((node) => ({
			node,
			lane: lanes.get(node.id) ?? "context",
			is_edited: edited_file_ids.has(node.id),
		}));
}

/**
 * Compute the set of node IDs on the path to any edited file.
 * Traces: edited_file ← tool ← turn (via edited/wrote, invoked_tool edges).
 */
function compute_edited_path_ids(graph: SessionGraphPayload): Set<string> {
	const result = new Set<string>();

	// Find edited file IDs
	const edited_file_ids = new Set<string>();
	for (const edge of graph.edges) {
		if (edge.kind === "edited" || edge.kind === "wrote") {
			edited_file_ids.add(edge.target_id);
		}
	}

	// Add edited files
	for (const id of edited_file_ids) {
		result.add(id);
	}

	// Build incoming index
	const by_target = new Map<string, GraphEdge[]>();
	for (const edge of graph.edges) {
		let arr = by_target.get(edge.target_id);
		if (!arr) { arr = []; by_target.set(edge.target_id, arr); }
		arr.push(edge);
	}

	// Trace upstream from each edited file
	for (const file_id of edited_file_ids) {
		const incoming = by_target.get(file_id) ?? [];
		for (const edge of incoming) {
			if (edge.kind === "edited" || edge.kind === "wrote" || edge.kind === "read") {
				result.add(edge.source_id); // tool_call
				// Find turn that invoked this tool
				const tool_incoming = by_target.get(edge.source_id) ?? [];
				for (const te of tool_incoming) {
					if (te.kind === "invoked_tool") {
						result.add(te.source_id); // turn
					}
				}
			}
		}
	}

	return result;
}

// ── Map edges ───────────────────────────────────────────────────────────────

/**
 * Compute edges for the context map, filtered to only those
 * connecting visible map nodes.
 */
export function compute_map_edges(
	graph: SessionGraphPayload,
	map_nodes: MapNode[],
	options: VisibilityOptions = {},
): MapEdge[] {
	const { show_ambient = true } = options;
	const visible_ids = new Set(map_nodes.map((n) => n.node.id));

	return graph.edges
		.filter(
			(e) => visible_ids.has(e.source_id) && visible_ids.has(e.target_id),
		)
		.filter((e) => show_ambient || e.availability !== "available_ambient")
		.map((e) => ({
			source_id: e.source_id,
			target_id: e.target_id,
			kind: e.kind,
			availability: e.availability,
		}));
}

// ── Styling state ───────────────────────────────────────────────────────────

/**
 * Map availability state to a visual styling category.
 */
export function compute_styling_state(
	availability: AvailabilityState | string,
): StylingState {
	switch (availability) {
		case "available_observed":
			return "observed";
		case "available_ambient":
			return "ambient";
		case "derived_inferred":
			return "inferred";
		default:
			return "unavailable";
	}
}

// ── Selection subgraph ──────────────────────────────────────────────────────

/**
 * Selection subgraph computation uses two BFS walks (upstream + downstream)
 * from the selected node, filtered by edge kind based on focus mode:
 *
 * - **Path mode** answers "what happened before/after this node?"
 *   Follows the temporal/invocation chain: user_prompt → assistant_turn →
 *   tool_call → file (via prompted, invoked_tool, read/edited/wrote edges).
 *   This is the default mode — it shows the execution sequence.
 *
 * - **Influence mode** answers "what shaped this?" / "what did it affect?"
 *   Follows causal/structural edges: framing constraints, doc imports,
 *   file imports, and adjacency. Useful for understanding why a file was
 *   reached or what an instruction influenced.
 *
 * The edge-kind sets below control which edges each BFS is allowed to
 * traverse. Adding a new edge kind to the graph schema requires deciding
 * which mode(s) it belongs to.
 */

/**
 * Edge kinds followed in Path mode.
 * Traces the temporal invocation chain: prompt→turn→tool→file.
 */
const path_edge_kinds = new Set<string>([
	"prompted",
	"invoked_tool",
	"searched_for",
	"discovered",
	"read",
	"edited",
	"wrote",
]);

/**
 * Edge kinds followed in Influence mode.
 * Traces causal/structural relationships: what caused or was affected.
 */
const influence_edge_kinds = new Set<string>([
	"framed_by",
	"constrained_by",
	"influenced_by",
	"read",
	"edited",
	"wrote",
	"linked_to",
	"imports",
	"belongs_to",
	"invoked_tool",
	"adjacent_unexplored",
]);

/**
 * Given a selected node ID and focus mode, compute the upstream and
 * downstream subgraph that should be highlighted.
 *
 * - **path**: follows temporal/invocation edges to answer
 *   "what happened before/after this?"
 * - **influence**: follows causal/structural edges to answer
 *   "how did the agent arrive here?" / "what did this influence?"
 */
export function compute_selection_subgraph(
	selected_node_id: string | null,
	graph: SessionGraphPayload,
	mode: FocusMode = "path",
): SelectionSubgraph {
	if (!selected_node_id) {
		return {
			highlighted_node_ids: new Set(),
			highlighted_edge_keys: new Set(),
		};
	}

	const highlighted_node_ids = new Set<string>();
	const highlighted_edge_keys = new Set<string>();

	highlighted_node_ids.add(selected_node_id);

	const edge_key = (e: GraphEdge) =>
		`${e.source_id}->${e.target_id}:${e.kind}`;

	// Neighborhood mode: one-hop only, all edge kinds
	if (mode === "neighborhood") {
		for (const edge of graph.edges) {
			if (edge.source_id === selected_node_id) {
				highlighted_node_ids.add(edge.target_id);
				highlighted_edge_keys.add(edge_key(edge));
			}
			if (edge.target_id === selected_node_id) {
				highlighted_node_ids.add(edge.source_id);
				highlighted_edge_keys.add(edge_key(edge));
			}
		}
		return { highlighted_node_ids, highlighted_edge_keys };
	}

	// Path and Influence: full BFS with mode-specific edge filtering
	const allowed_edges =
		mode === "influence" ? influence_edge_kinds : path_edge_kinds;

	// Build adjacency from edges, filtered by mode
	const outgoing = new Map<string, GraphEdge[]>();
	const incoming = new Map<string, GraphEdge[]>();

	for (const edge of graph.edges) {
		if (!allowed_edges.has(edge.kind)) continue;
		if (!outgoing.has(edge.source_id)) outgoing.set(edge.source_id, []);
		outgoing.get(edge.source_id)!.push(edge);
		if (!incoming.has(edge.target_id)) incoming.set(edge.target_id, []);
		incoming.get(edge.target_id)!.push(edge);
	}

	// Walk upstream (incoming edges) — BFS
	const upstream_queue = [selected_node_id];
	const visited_up = new Set<string>([selected_node_id]);
	while (upstream_queue.length > 0) {
		const current = upstream_queue.shift()!;
		const in_edges = incoming.get(current) ?? [];
		for (const e of in_edges) {
			highlighted_edge_keys.add(edge_key(e));
			if (!visited_up.has(e.source_id)) {
				visited_up.add(e.source_id);
				highlighted_node_ids.add(e.source_id);
				upstream_queue.push(e.source_id);
			}
		}
	}

	// Walk downstream (outgoing edges) — BFS
	const downstream_queue = [selected_node_id];
	const visited_down = new Set<string>([selected_node_id]);
	while (downstream_queue.length > 0) {
		const current = downstream_queue.shift()!;
		const out_edges = outgoing.get(current) ?? [];
		for (const e of out_edges) {
			highlighted_edge_keys.add(edge_key(e));
			if (!visited_down.has(e.target_id)) {
				visited_down.add(e.target_id);
				highlighted_node_ids.add(e.target_id);
				downstream_queue.push(e.target_id);
			}
		}
	}

	return { highlighted_node_ids, highlighted_edge_keys };
}

// ── Route connectors ────────────────────────────────────────────────────────

/**
 * Compute visible connectors for the context map with emphasis levels.
 *
 * - **primary**: edge is part of the current selection subgraph
 * - **secondary**: edge is visible but not part of the selection
 *
 * Respects ambient visibility. Excludes edges involving the session node.
 */
export function compute_route_connectors(
	graph: SessionGraphPayload,
	selection_subgraph: SelectionSubgraph,
	options: VisibilityOptions = {},
): RouteConnector[] {
	const { show_ambient = true } = options;
	const has_selection = selection_subgraph.highlighted_node_ids.size > 0;

	// Build node lookup for filtering
	const node_map = new Map<string, GraphNode>();
	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	const connectors: RouteConnector[] = [];

	for (const edge of graph.edges) {
		const source = node_map.get(edge.source_id);
		const target = node_map.get(edge.target_id);
		if (!source || !target) continue;

		// Exclude session node edges from connectors
		if (source.kind === "session" || target.kind === "session") continue;

		// Respect ambient visibility
		if (!show_ambient) {
			if (
				source.availability === "available_ambient" ||
				target.availability === "available_ambient"
			) continue;
			if (edge.availability === "available_ambient") continue;
		}

		const edge_key = `${edge.source_id}->${edge.target_id}:${edge.kind}`;
		const emphasis: ConnectorEmphasis =
			has_selection && selection_subgraph.highlighted_edge_keys.has(edge_key)
				? "primary"
				: "secondary";

		connectors.push({
			source_id: edge.source_id,
			target_id: edge.target_id,
			kind: edge.kind,
			emphasis,
			styling: compute_styling_state(edge.availability),
		});
	}

	return connectors;
}

// ── Graph summary ───────────────────────────────────────────────────────────

/**
 * Compute session-level summary counts from the graph.
 */
export function compute_graph_summary(
	graph: SessionGraphPayload,
): GraphSummary {
	let turns = 0;
	let searches = 0;
	let framing_sources = 0;
	let unavailable_framing = 0;

	const read_file_ids = new Set<string>();
	const read_doc_ids = new Set<string>();
	const edited_file_ids = new Set<string>();

	// Count edges for read/edit/write
	for (const edge of graph.edges) {
		if (edge.kind === "read") {
			const target = graph.nodes.find((n) => n.id === edge.target_id);
			if (target) {
				if (target.kind === "doc_file" || target.kind === "doc_section") {
					read_doc_ids.add(edge.target_id);
				} else {
					read_file_ids.add(edge.target_id);
				}
			}
		}
		if (edge.kind === "edited" || edge.kind === "wrote") {
			edited_file_ids.add(edge.target_id);
		}
	}

	// Find framing node to count its children
	const framing_node = graph.nodes.find((n) => n.kind === "session_framing");
	if (framing_node) {
		const framing_child_ids = new Set(
			graph.edges
				.filter(
					(e) =>
						e.source_id === framing_node.id,
				)
				.map((e) => e.target_id),
		);

		for (const child_id of framing_child_ids) {
			const child = graph.nodes.find((n) => n.id === child_id);
			if (child) {
				framing_sources++;
				if (
					child.availability === "unavailable" ||
					child.availability === "unknown"
				) {
					unavailable_framing++;
				}
			}
		}
	}

	for (const node of graph.nodes) {
		if (node.kind === "assistant_turn") turns++;
		if (node.kind === "search_query") searches++;
	}

	return {
		turns,
		searches,
		docs_read: read_doc_ids.size,
		files_read: read_file_ids.size,
		files_edited: edited_file_ids.size,
		framing_sources,
		unavailable_framing,
	};
}
