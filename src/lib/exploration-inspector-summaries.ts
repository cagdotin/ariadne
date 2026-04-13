/**
 * Inspector summary derivation from SessionGraphPayload.
 *
 * Pure functions that compute context-specific summary data
 * for the inspector pane based on what kind of node is selected.
 *
 * Uses pre-built edge indexes for O(1) lookups instead of
 * scanning all edges per query.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

export type NodeSummary =
	| TurnSummary
	| FileSummary
	| InstructionSummary;

export interface ArrivalPath {
	action: string; // "read" | "edited" | "wrote"
	tool_node_id: string;
	tool_label: string;
	turn_node_id: string | null;
	turn_index: number | null;
	user_prompt_node_id: string | null;
	user_message: string | null;
}

export interface TurnSummary {
	kind: "turn";
	searches: number;
	files_explored: number;
	docs_explored: number;
	edits: number;
	writes: number;
}

export interface FileSummary {
	kind: "file";
	reads: number;
	edits: number;
	writes: number;
	upstream_docs: number;
	upstream_instructions: number;
	first_seen_turn: number | null;
	is_explored: boolean;
}

export interface InstructionSummary {
	kind: "instruction";
	availability: string;
	downstream_files: number;
	downstream_edits: number;
}

// ── Edge indexes ─────────────────────────────────────────────────────────────

interface EdgeIndex {
	by_source: Map<string, GraphEdge[]>;
	by_target: Map<string, GraphEdge[]>;
	node_map: Map<string, GraphNode>;
}

/** Max hops when tracing arrival paths to prevent runaway on malformed graphs. */
const MAX_ARRIVAL_DEPTH = 5;

function build_edge_index(graph: SessionGraphPayload): EdgeIndex {
	const by_source = new Map<string, GraphEdge[]>();
	const by_target = new Map<string, GraphEdge[]>();
	const node_map = new Map<string, GraphNode>();

	for (const edge of graph.edges) {
		let src = by_source.get(edge.source_id);
		if (!src) {
			src = [];
			by_source.set(edge.source_id, src);
		}
		src.push(edge);

		let tgt = by_target.get(edge.target_id);
		if (!tgt) {
			tgt = [];
			by_target.set(edge.target_id, tgt);
		}
		tgt.push(edge);
	}

	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	return { by_source, by_target, node_map };
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute a contextual summary for a selected graph node.
 */
export function compute_node_summary(
	node_id: string,
	graph: SessionGraphPayload,
): NodeSummary | null {
	const idx = build_edge_index(graph);
	const node = idx.node_map.get(node_id);
	if (!node) return null;

	if (node.kind === "assistant_turn") {
		return compute_turn_summary(node_id, idx);
	}

	if (
		node.kind === "source_file" ||
		node.kind === "doc_file" ||
		node.kind === "doc_section"
	) {
		return compute_file_summary(node_id, idx);
	}

	if (
		node.kind === "instruction_source" ||
		node.kind === "agents_doc" ||
		node.kind === "system_prompt" ||
		node.kind === "developer_prompt"
	) {
		return compute_instruction_summary(node_id, idx);
	}

	return null;
}

// ── Turn summary ────────────────────────────────────────────────────────────

function compute_turn_summary(
	turn_id: string,
	idx: EdgeIndex,
): TurnSummary {
	let searches = 0;
	let edits = 0;
	let writes = 0;
	const explored_files = new Set<string>();
	const explored_docs = new Set<string>();

	const tool_edges = (idx.by_source.get(turn_id) ?? []).filter(
		(e) => e.kind === "invoked_tool",
	);

	for (const te of tool_edges) {
		const tool = idx.node_map.get(te.target_id);
		if (!tool) continue;

		if (tool.kind === "search_query") {
			searches++;
			continue;
		}

		const file_edges = (idx.by_source.get(tool.id) ?? []).filter(
			(e) => e.kind === "read" || e.kind === "edited" || e.kind === "wrote",
		);

		for (const fe of file_edges) {
			const target = idx.node_map.get(fe.target_id);
			if (!target) continue;

			if (target.kind === "doc_file" || target.kind === "doc_section") {
				explored_docs.add(fe.target_id);
			} else {
				explored_files.add(fe.target_id);
			}

			if (fe.kind === "edited") edits++;
			if (fe.kind === "wrote") writes++;
		}
	}

	return {
		kind: "turn",
		searches,
		files_explored: explored_files.size,
		docs_explored: explored_docs.size,
		edits,
		writes,
	};
}

// ── File summary ────────────────────────────────────────────────────────────

function compute_file_summary(
	file_id: string,
	idx: EdgeIndex,
): FileSummary {
	let reads = 0;
	let edits = 0;
	let writes = 0;
	let upstream_docs = 0;
	let upstream_instructions = 0;

	const file_node = idx.node_map.get(file_id);
	const is_explored = file_node?.availability === "available_observed";

	const incoming = idx.by_target.get(file_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind === "read") reads++;
		if (edge.kind === "edited") edits++;
		if (edge.kind === "wrote") writes++;

		const source = idx.node_map.get(edge.source_id);
		if (source) {
			if (source.kind === "doc_file" || source.kind === "doc_section") {
				upstream_docs++;
			}
			if (source.kind === "instruction_source" || source.kind === "agents_doc") {
				upstream_instructions++;
			}
		}
	}

	// Find first seen turn
	let first_seen_turn: number | null = null;
	for (const edge of incoming) {
		if (edge.kind !== "read" && edge.kind !== "edited" && edge.kind !== "wrote")
			continue;

		const tool = idx.node_map.get(edge.source_id);
		if (!tool) continue;

		// Walk up to find the turn
		const turn_edges = (idx.by_target.get(tool.id) ?? []).filter(
			(e) => e.kind === "invoked_tool",
		);
		for (const turn_edge of turn_edges) {
			const turn = idx.node_map.get(turn_edge.source_id);
			if (turn?.kind === "assistant_turn") {
				const ti = (turn.metadata?.turn_index as number) ?? null;
				if (ti !== null && (first_seen_turn === null || ti < first_seen_turn)) {
					first_seen_turn = ti;
				}
			}
		}
	}

	return {
		kind: "file",
		reads,
		edits,
		writes,
		upstream_docs,
		upstream_instructions,
		first_seen_turn,
		is_explored,
	};
}

// ── Instruction summary ─────────────────────────────────────────────────────

function compute_instruction_summary(
	instruction_id: string,
	idx: EdgeIndex,
): InstructionSummary {
	const node = idx.node_map.get(instruction_id);
	let downstream_files = 0;
	let downstream_edits = 0;

	const outgoing = idx.by_source.get(instruction_id) ?? [];

	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (!target) continue;

		if (target.kind === "source_file") {
			downstream_files++;
			const was_edited = (idx.by_target.get(target.id) ?? []).some(
				(e) => e.kind === "edited" || e.kind === "wrote",
			);
			if (was_edited) downstream_edits++;
		}
	}

	return {
		kind: "instruction",
		availability: node?.availability ?? "unknown",
		downstream_files,
		downstream_edits,
	};
}

// ── Arrival paths ───────────────────────────────────────────────────────────

/**
 * Compute the full arrival paths for a node: traces back through
 * tool_call → assistant_turn → user_prompt to show how each
 * read/edit/write of this node was initiated.
 *
 * Returns one entry per tool interaction, sorted by turn index.
 * Uses edge indexes for O(1) lookups and a depth guard to prevent
 * runaway traversal on malformed graphs.
 */
export function compute_arrival_paths(
	node_id: string,
	graph: SessionGraphPayload,
): ArrivalPath[] {
	const idx = build_edge_index(graph);
	const paths: ArrivalPath[] = [];

	const incoming = idx.by_target.get(node_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind !== "read" && edge.kind !== "edited" && edge.kind !== "wrote")
			continue;

		const tool = idx.node_map.get(edge.source_id);
		if (!tool) continue;

		// Walk up with depth guard: find the turn that invoked this tool
		let turn_node_id: string | null = null;
		let turn_index: number | null = null;
		let user_prompt_node_id: string | null = null;
		let user_message: string | null = null;

		let current_id = tool.id;
		let depth = 0;

		while (depth < MAX_ARRIVAL_DEPTH) {
			const parent_edges = (idx.by_target.get(current_id) ?? []).filter(
				(e) => e.kind === "invoked_tool",
			);
			if (parent_edges.length === 0) break;

			const turn = idx.node_map.get(parent_edges[0].source_id);
			if (turn?.kind === "assistant_turn") {
				turn_node_id = turn.id;
				turn_index = (turn.metadata?.turn_index as number) ?? null;

				// Find the user_prompt for this turn
				if (turn_index !== null) {
					const user_prompt = graph.nodes.find(
						(n) =>
							n.kind === "user_prompt" &&
							(n.metadata?.turn_index as number) === turn_index,
					);
					if (user_prompt) {
						user_prompt_node_id = user_prompt.id;
						user_message =
							(user_prompt.metadata?.text as string) ??
							user_prompt.label.replace(/^User:\s*/, "");
					}
				}
				break;
			}

			current_id = parent_edges[0].source_id;
			depth++;
		}

		paths.push({
			action: edge.kind,
			tool_node_id: tool.id,
			tool_label: tool.label,
			turn_node_id,
			turn_index,
			user_prompt_node_id,
			user_message,
		});
	}

	// Sort by turn index
	paths.sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0));

	return paths;
}
