/**
 * Temporal view model for Exploration.
 *
 * Pure helpers that derive temporal ordering, cutoff visibility,
 * and arrival-path contributor sets from SessionGraphPayload.
 * No DOM, no React, fully testable.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Comparable temporal position within a session.
 * Ordered by turn_index first, then tool_index within a turn.
 * Use tool_index = Infinity for end-of-turn cutoffs.
 */
export interface TemporalOrder {
	turn_index: number;
	tool_index: number;
}

/**
 * The kind of temporal view currently active.
 */
export type TemporalLens =
	| { kind: "full_session" }
	| { kind: "built_so_far"; cutoff: TemporalOrder; selected_turn_index: number }
	| { kind: "arrival_path"; target_node_id: string; target_label: string };

// ── Node kinds that always pass temporal filtering ──────────────────────────

const always_visible_kinds = new Set<string>([
	"session",
	"session_framing",
	"runtime_context",
	"system_prompt",
	"developer_prompt",
	"agents_doc",
	"instruction_source",
]);

/** Node kinds that carry turn_index directly. */
const temporal_node_kinds = new Set<string>([
	"user_prompt",
	"assistant_turn",
	"tool_call",
	"search_query",
]);

/** Edge kinds that represent a tool interacting with an artifact. */
const tool_artifact_edge_kinds = new Set<string>([
	"read",
	"edited",
	"wrote",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function compare_temporal(a: TemporalOrder, b: TemporalOrder): number {
	if (a.turn_index !== b.turn_index) return a.turn_index - b.turn_index;
	if (a.tool_index === b.tool_index) return 0;
	return a.tool_index < b.tool_index ? -1 : 1;
}

function is_at_or_before(order: TemporalOrder, cutoff: TemporalOrder): boolean {
	return compare_temporal(order, cutoff) <= 0;
}

interface EdgeIndex {
	by_source: Map<string, GraphEdge[]>;
	by_target: Map<string, GraphEdge[]>;
	node_map: Map<string, GraphNode>;
}

function build_edge_index(graph: SessionGraphPayload): EdgeIndex {
	const by_source = new Map<string, GraphEdge[]>();
	const by_target = new Map<string, GraphEdge[]>();
	const node_map = new Map<string, GraphNode>();

	for (const edge of graph.edges) {
		let src = by_source.get(edge.source_id);
		if (!src) { src = []; by_source.set(edge.source_id, src); }
		src.push(edge);

		let tgt = by_target.get(edge.target_id);
		if (!tgt) { tgt = []; by_target.set(edge.target_id, tgt); }
		tgt.push(edge);
	}

	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	return { by_source, by_target, node_map };
}

// ── get_node_temporal_order ─────────────────────────────────────────────────

/**
 * Derive the temporal order for a graph node.
 *
 * - For temporal nodes (user_prompt, assistant_turn, tool_call, search_query):
 *   uses metadata.turn_index and metadata.tool_index directly.
 * - For artifact nodes (source_file, doc_file, doc_section, directory):
 *   derives first-seen from the earliest incoming tool edge.
 * - For adjacent unexplored nodes: derives from the earliest explored anchor.
 * - Returns null for framing/session nodes (no temporal position).
 */
export function get_node_temporal_order(
	node_id: string,
	graph: SessionGraphPayload,
): TemporalOrder | null {
	const idx = build_edge_index(graph);
	return get_node_order_internal(node_id, idx);
}

function get_node_order_internal(
	node_id: string,
	idx: EdgeIndex,
): TemporalOrder | null {
	const node = idx.node_map.get(node_id);
	if (!node) return null;

	// Always-visible nodes have no temporal position
	if (always_visible_kinds.has(node.kind)) return null;

	// Temporal nodes: read turn_index and tool_index directly
	if (temporal_node_kinds.has(node.kind)) {
		const turn_index = node.metadata?.turn_index;
		if (typeof turn_index !== "number") return null;

		const tool_index = node.metadata?.tool_index;
		return {
			turn_index,
			tool_index: typeof tool_index === "number" ? tool_index : Infinity,
		};
	}

	// Artifact nodes: derive from earliest incoming tool edge
	return derive_artifact_first_seen(node_id, idx);
}

/**
 * Derive the first-seen temporal order for an artifact node
 * by finding the earliest tool that interacted with it.
 */
function derive_artifact_first_seen(
	node_id: string,
	idx: EdgeIndex,
): TemporalOrder | null {
	const incoming = idx.by_target.get(node_id) ?? [];
	let earliest: TemporalOrder | null = null;

	for (const edge of incoming) {
		if (tool_artifact_edge_kinds.has(edge.kind)) {
			// Source is a tool_call — get its temporal order
			const tool_order = get_tool_order(edge.source_id, idx);
			if (tool_order && (!earliest || compare_temporal(tool_order, earliest) < 0)) {
				earliest = tool_order;
			}
		}
	}

	// If no direct tool edges, check if this is an adjacent_unexplored node
	// and derive from its explored anchor
	if (!earliest) {
		for (const edge of incoming) {
			if (edge.kind === "adjacent_unexplored") {
				const anchor_order = derive_artifact_first_seen(edge.source_id, idx);
				if (anchor_order && (!earliest || compare_temporal(anchor_order, earliest) < 0)) {
					earliest = anchor_order;
				}
			}
		}
	}

	return earliest;
}

/**
 * Get the temporal order for a tool node by reading its metadata directly.
 */
function get_tool_order(
	tool_id: string,
	idx: EdgeIndex,
): TemporalOrder | null {
	const tool = idx.node_map.get(tool_id);
	if (!tool) return null;

	// Try direct metadata first
	const turn_index = tool.metadata?.turn_index;
	if (typeof turn_index === "number") {
		const tool_index = tool.metadata?.tool_index;
		return {
			turn_index,
			tool_index: typeof tool_index === "number" ? tool_index : Infinity,
		};
	}

	// If tool doesn't have turn_index, walk up to find the owning turn
	const incoming = idx.by_target.get(tool_id) ?? [];
	for (const edge of incoming) {
		if (edge.kind === "invoked_tool") {
			const turn = idx.node_map.get(edge.source_id);
			if (turn?.kind === "assistant_turn") {
				const ti = turn.metadata?.turn_index;
				if (typeof ti === "number") {
					return { turn_index: ti, tool_index: Infinity };
				}
			}
		}
	}

	return null;
}

// ── get_selection_cutoff ────────────────────────────────────────────────────

/**
 * Derive the temporal cutoff for a selected node.
 *
 * - user_prompt / assistant_turn: cutoff at end of that turn (tool_index = Infinity)
 * - tool_call / search_query: cutoff at that specific tool position
 * - artifact / framing nodes: returns null (these produce arrival views, not cutoffs)
 */
export function get_selection_cutoff(
	selected_node_id: string,
	graph: SessionGraphPayload,
): TemporalOrder | null {
	const node = graph.nodes.find((n) => n.id === selected_node_id);
	if (!node) return null;

	if (!temporal_node_kinds.has(node.kind)) return null;

	const turn_index = node.metadata?.turn_index;
	if (typeof turn_index !== "number") return null;

	// For user_prompt and assistant_turn: end-of-turn cutoff
	if (node.kind === "user_prompt" || node.kind === "assistant_turn") {
		return { turn_index, tool_index: Infinity };
	}

	// For tool_call and search_query: tool-level cutoff
	const tool_index = node.metadata?.tool_index;
	return {
		turn_index,
		tool_index: typeof tool_index === "number" ? tool_index : Infinity,
	};
}

// ── compute_temporally_visible_nodes ────────────────────────────────────────

/**
 * Compute the set of node IDs visible at a given temporal cutoff.
 *
 * - If cutoff is null, returns all node IDs (full session view).
 * - Framing/session nodes are always visible.
 * - Temporal and artifact nodes are included only if their order <= cutoff.
 */
export function compute_temporally_visible_nodes(
	graph: SessionGraphPayload,
	cutoff: TemporalOrder | null,
): Set<string> {
	if (!cutoff) {
		return new Set(graph.nodes.map((n) => n.id));
	}

	const idx = build_edge_index(graph);
	const visible = new Set<string>();

	for (const node of graph.nodes) {
		// Framing nodes are always visible
		if (always_visible_kinds.has(node.kind)) {
			visible.add(node.id);
			continue;
		}

		const order = get_node_order_internal(node.id, idx);
		if (order && is_at_or_before(order, cutoff)) {
			visible.add(node.id);
		}
	}

	return visible;
}

// ── compute_arrival_contributors ────────────────────────────────────────────

/** Edge kinds to follow upstream when building arrival contributor sets. */
const arrival_upstream_edge_kinds = new Set<string>([
	"read",
	"edited",
	"wrote",
	"invoked_tool",
	"prompted",
	"influenced_by",
	"linked_to",
	"constrained_by",
	"discovered",
	"searched_for",
]);

/**
 * Compute the set of node IDs that materially contributed to reaching
 * the selected artifact node.
 *
 * Walks upstream from the artifact through tool→turn→prompt chains,
 * and includes influencing docs/instructions. Also includes sibling
 * tool actions from contributing turns to provide context.
 *
 * Returns an empty set for nonexistent nodes.
 */
export function compute_arrival_contributors(
	artifact_node_id: string,
	graph: SessionGraphPayload,
): Set<string> {
	const idx = build_edge_index(graph);
	const node = idx.node_map.get(artifact_node_id);
	if (!node) return new Set();

	const contributors = new Set<string>();
	contributors.add(artifact_node_id);

	// Phase 1: Walk upstream from the artifact through tool edges
	const incoming = idx.by_target.get(artifact_node_id) ?? [];
	const contributing_turn_ids = new Set<string>();

	for (const edge of incoming) {
		if (!arrival_upstream_edge_kinds.has(edge.kind)) continue;

		const source = idx.node_map.get(edge.source_id);
		if (!source) continue;

		contributors.add(source.id);

		// If source is a tool, trace up to the turn and prompt
		if (source.kind === "tool_call" || source.kind === "search_query") {
			trace_tool_upstream(source.id, idx, contributors, contributing_turn_ids);
		}

		// If source is a doc or instruction, include it
		if (source.kind === "doc_file" || source.kind === "doc_section" ||
			source.kind === "instruction_source" || source.kind === "agents_doc") {
			contributors.add(source.id);
		}
	}

	// Phase 2: Include sibling tool actions from contributing turns
	// This provides context (e.g., "the search that happened in the same turn")
	for (const turn_id of contributing_turn_ids) {
		const turn_outgoing = idx.by_source.get(turn_id) ?? [];
		for (const edge of turn_outgoing) {
			if (edge.kind === "invoked_tool") {
				contributors.add(edge.target_id);
			}
		}
	}

	// Phase 3: Include user_prompts for contributing turns
	for (const turn_id of contributing_turn_ids) {
		const turn_node = idx.node_map.get(turn_id);
		if (turn_node?.kind === "assistant_turn") {
			const turn_index = turn_node.metadata?.turn_index;
			if (typeof turn_index === "number") {
				for (const n of graph.nodes) {
					if (n.kind === "user_prompt" &&
						(n.metadata?.turn_index as number) === turn_index) {
						contributors.add(n.id);
					}
				}
			}
		}
	}

	return contributors;
}

/**
 * Trace upstream from a tool node to its owning turn and prompt.
 */
function trace_tool_upstream(
	tool_id: string,
	idx: EdgeIndex,
	contributors: Set<string>,
	contributing_turn_ids: Set<string>,
): void {
	const incoming = idx.by_target.get(tool_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind === "invoked_tool") {
			const turn = idx.node_map.get(edge.source_id);
			if (turn?.kind === "assistant_turn") {
				contributors.add(turn.id);
				contributing_turn_ids.add(turn.id);
			}
		}
	}
}

// ── Temporal lens derivation ────────────────────────────────────────────────

/**
 * Determine the active temporal lens based on the current selection.
 */
export function derive_temporal_lens(
	selected_node_id: string | null,
	graph: SessionGraphPayload,
): TemporalLens {
	if (!selected_node_id) {
		return { kind: "full_session" };
	}

	const node = graph.nodes.find((n) => n.id === selected_node_id);
	if (!node) return { kind: "full_session" };

	// Temporal nodes produce built-so-far cutoffs
	if (temporal_node_kinds.has(node.kind)) {
		const cutoff = get_selection_cutoff(selected_node_id, graph);
		if (cutoff) {
			return {
				kind: "built_so_far",
				cutoff,
				selected_turn_index: cutoff.turn_index,
			};
		}
	}

	// Artifact nodes produce arrival-path views
	const artifact_kinds = new Set(["source_file", "doc_file", "doc_section", "directory"]);
	if (artifact_kinds.has(node.kind)) {
		return {
			kind: "arrival_path",
			target_node_id: selected_node_id,
			target_label: node.label,
		};
	}

	return { kind: "full_session" };
}
