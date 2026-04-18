/**
 * Insight graph view model for the Exploration Graph mode.
 *
 * Pure functions that derive selection-centered explanation subgraphs
 * from SessionGraphPayload. Classifies nodes and edges into roles:
 * primary_path, supporting, structural_ref, downstream.
 *
 * No DOM, no React, fully testable.
 */

import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

export type InsightRole =
	| "primary_path"
	| "supporting"
	| "structural_ref"
	| "downstream";

export interface InsightNode {
	id: string;
	node: GraphNode;
	role: InsightRole;
}

export interface InsightEdge {
	source_id: string;
	target_id: string;
	kind: GraphEdge["kind"];
	role: InsightRole;
}

export interface InsightSubgraph {
	focal_node_id: string | null;
	nodes: InsightNode[];
	edges: InsightEdge[];
}

export interface InsightOptions {
	temporally_visible_node_ids?: Set<string>;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Edge kinds that form the temporal/invocation spine. */
const path_edge_kinds = new Set<string>([
	"prompted",
	"invoked_tool",
	"searched_for",
	"discovered",
	"read",
	"edited",
	"wrote",
]);

/** Edge kinds that indicate supporting/influence relationships. */
const influence_edge_kinds = new Set<string>([
	"influenced_by",
	"constrained_by",
	"linked_to",
]);

/** Edge kinds that represent structural repo relationships. */
const structural_edge_kinds = new Set<string>([
	"imports",
	"linked_to",
	"belongs_to",
]);

/** Node kinds that should be suppressed from insight graphs. */
const suppressed_node_kinds = new Set<string>([
	"session",
	"session_framing",
	"runtime_context",
]);

/** Node kinds that represent turns/prompts (temporal spine). */
const temporal_node_kinds = new Set<string>([
	"user_prompt",
	"assistant_turn",
	"tool_call",
	"search_query",
]);

/** Node kinds that represent artifacts. */
const artifact_node_kinds = new Set<string>([
	"source_file",
	"doc_file",
	"doc_section",
	"directory",
]);

// ── Edge index ──────────────────────────────────────────────────────────────

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
 * Compute a selection-centered insight subgraph.
 *
 * The result classifies every included node and edge into a role:
 * - primary_path: the strongest route explaining the selection
 * - supporting: important nodes that influenced the path
 * - structural_ref: repo-structural references among explored artifacts
 * - downstream: effects caused by the selection
 */
export function compute_insight_subgraph(
	selected_node_id: string | null,
	graph: SessionGraphPayload,
	options: InsightOptions = {},
): InsightSubgraph {
	if (!selected_node_id) {
		return { focal_node_id: null, nodes: [], edges: [] };
	}

	const idx = build_edge_index(graph);
	const node = idx.node_map.get(selected_node_id);
	if (!node) {
		return { focal_node_id: null, nodes: [], edges: [] };
	}

	const { temporally_visible_node_ids } = options;

	// Helpers for temporal/suppression filtering
	const is_visible = (id: string): boolean => {
		if (temporally_visible_node_ids && !temporally_visible_node_ids.has(id))
			return false;
		const n = idx.node_map.get(id);
		if (!n) return false;
		if (suppressed_node_kinds.has(n.kind)) return false;
		return true;
	};

	// Accumulate nodes and edges with roles
	const node_roles = new Map<string, InsightRole>();
	const edge_list: InsightEdge[] = [];
	const seen_edges = new Set<string>();

	const add_node = (id: string, role: InsightRole) => {
		if (!is_visible(id)) return;
		const existing = node_roles.get(id);
		if (!existing || role_priority(role) > role_priority(existing)) {
			node_roles.set(id, role);
		}
	};

	const add_edge = (
		source_id: string,
		target_id: string,
		kind: string,
		role: InsightRole,
	) => {
		const key = `${source_id}->${target_id}:${kind}`;
		if (seen_edges.has(key)) return;
		if (!is_visible(source_id) || !is_visible(target_id)) return;
		seen_edges.add(key);
		edge_list.push({
			source_id,
			target_id,
			kind: kind as GraphEdge["kind"],
			role,
		});
	};

	// Start with the focal node
	add_node(selected_node_id, "primary_path");

	if (temporal_node_kinds.has(node.kind)) {
		// Selected a turn/prompt/tool — show downstream path
		derive_turn_insight(selected_node_id, idx, add_node, add_edge, is_visible);
	} else if (artifact_node_kinds.has(node.kind)) {
		// Selected a file/doc — show arrival path + downstream
		derive_artifact_insight(
			selected_node_id,
			idx,
			add_node,
			add_edge,
			is_visible,
		);
	} else {
		// Instruction/framing node — show downstream influence
		derive_instruction_insight(
			selected_node_id,
			idx,
			add_node,
			add_edge,
			is_visible,
		);
	}

	// Phase: Add structural references among already-included nodes
	add_structural_references(node_roles, idx, add_node, add_edge, is_visible);

	// Build final output
	const nodes: InsightNode[] = [];
	for (const [id, role] of node_roles) {
		const n = idx.node_map.get(id);
		if (n) {
			nodes.push({ id, node: n, role });
		}
	}

	return {
		focal_node_id: selected_node_id,
		nodes,
		edges: edge_list,
	};
}

// ── Role priority ───────────────────────────────────────────────────────────

function role_priority(role: InsightRole): number {
	switch (role) {
		case "primary_path":
			return 4;
		case "supporting":
			return 3;
		case "downstream":
			return 2;
		case "structural_ref":
			return 1;
	}
}

// ── Turn/prompt insight ─────────────────────────────────────────────────────

function derive_turn_insight(
	selected_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	_is_visible: (id: string) => boolean,
): void {
	const node = idx.node_map.get(selected_id);
	if (!node) return;

	// Resolve the assistant_turn that owns the tools.
	// If user_prompt is selected, follow prompted → assistant_turn.
	// If assistant_turn is selected, use it directly.
	let assistant_turn_id: string | null = null;

	if (node.kind === "user_prompt") {
		// Follow prompted edge to assistant_turn
		const outgoing = idx.by_source.get(selected_id) ?? [];
		for (const edge of outgoing) {
			if (edge.kind === "prompted") {
				const target = idx.node_map.get(edge.target_id);
				if (target?.kind === "assistant_turn") {
					assistant_turn_id = edge.target_id;
					add_node(assistant_turn_id, "primary_path");
					add_edge(selected_id, assistant_turn_id, edge.kind, "primary_path");
					break;
				}
			}
		}
	} else if (node.kind === "assistant_turn") {
		assistant_turn_id = selected_id;
		// Find the user_prompt for this turn
		const turn_index = node.metadata?.turn_index;
		if (typeof turn_index === "number") {
			for (const [id, n] of idx.node_map) {
				if (
					n.kind === "user_prompt" &&
					(n.metadata?.turn_index as number) === turn_index
				) {
					add_node(id, "primary_path");
					break;
				}
			}
		}
	} else {
		// tool_call or search_query — treat as mini-turn, derive from self
		assistant_turn_id = selected_id;
	}

	if (!assistant_turn_id) return;

	// Walk downstream from assistant_turn: invoked tools, then their artifacts
	const outgoing = idx.by_source.get(assistant_turn_id) ?? [];
	for (const edge of outgoing) {
		if (edge.kind === "invoked_tool") {
			add_node(edge.target_id, "primary_path");
			add_edge(assistant_turn_id, edge.target_id, edge.kind, "primary_path");

			// Tool's downstream artifacts
			const tool_out = idx.by_source.get(edge.target_id) ?? [];
			for (const te of tool_out) {
				if (path_edge_kinds.has(te.kind)) {
					add_node(te.target_id, "primary_path");
					add_edge(edge.target_id, te.target_id, te.kind, "primary_path");
				}
			}
		}
	}
}

// ── Artifact insight ────────────────────────────────────────────────────────

function derive_artifact_insight(
	artifact_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	is_visible: (id: string) => boolean,
): void {
	// Phase 1: Trace upstream primary path (tool→turn→prompt)
	const incoming = idx.by_target.get(artifact_id) ?? [];
	const contributing_turn_ids = new Set<string>();

	for (const edge of incoming) {
		if (!path_edge_kinds.has(edge.kind)) continue;

		const source = idx.node_map.get(edge.source_id);
		if (!source) continue;

		// Tool that accessed this artifact
		add_node(edge.source_id, "primary_path");
		add_edge(edge.source_id, artifact_id, edge.kind, "primary_path");

		// Trace tool → turn → prompt
		if (source.kind === "tool_call" || source.kind === "search_query") {
			trace_tool_to_turn(
				edge.source_id,
				idx,
				add_node,
				add_edge,
				contributing_turn_ids,
			);
		}
	}

	// Phase 2: Add user_prompts for contributing turns
	for (const turn_id of contributing_turn_ids) {
		const turn_node = idx.node_map.get(turn_id);
		if (turn_node?.kind === "assistant_turn") {
			const ti = turn_node.metadata?.turn_index;
			if (typeof ti === "number") {
				for (const [id, n] of idx.node_map) {
					if (
						n.kind === "user_prompt" &&
						(n.metadata?.turn_index as number) === ti
					) {
						add_node(id, "primary_path");
						break;
					}
				}
			}
		}
	}

	// Phase 3: Supporting contributors (influence/constraint edges)
	for (const edge of incoming) {
		if (influence_edge_kinds.has(edge.kind)) {
			add_node(edge.source_id, "supporting");
			add_edge(edge.source_id, artifact_id, edge.kind, "supporting");
		}
	}

	// Phase 4: Downstream effects — tools that read this artifact
	// then produced other artifacts
	derive_downstream_effects(artifact_id, idx, add_node, add_edge, is_visible);
}

// ── Instruction insight ─────────────────────────────────────────────────────

function derive_instruction_insight(
	instruction_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	_is_visible: (id: string) => boolean,
): void {
	const outgoing = idx.by_source.get(instruction_id) ?? [];

	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (!target) continue;

		if (influence_edge_kinds.has(edge.kind) || edge.kind === "influenced_by") {
			add_node(edge.target_id, "downstream");
			add_edge(instruction_id, edge.target_id, edge.kind, "downstream");
		}
	}
}

// ── Downstream effects ──────────────────────────────────────────────────────

function derive_downstream_effects(
	artifact_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	_is_visible: (id: string) => boolean,
): void {
	// Find tools that accessed this artifact (artifact is target)
	// — tools that read it may have also produced other outputs
	const incoming = idx.by_target.get(artifact_id) ?? [];

	const reading_tool_ids = new Set<string>();
	for (const edge of incoming) {
		if (edge.kind === "read") {
			reading_tool_ids.add(edge.source_id);
		}
	}

	// For each tool that read this artifact, find its other outputs
	for (const tool_id of reading_tool_ids) {
		const tool_out = idx.by_source.get(tool_id) ?? [];
		for (const edge of tool_out) {
			if (
				(edge.kind === "edited" || edge.kind === "wrote") &&
				edge.target_id !== artifact_id
			) {
				add_node(edge.target_id, "downstream");
				add_edge(tool_id, edge.target_id, edge.kind, "downstream");
				add_node(tool_id, "downstream");
			}
		}

		// Also check sibling tools in the same turn for edits
		const tool_node = idx.node_map.get(tool_id);
		if (tool_node) {
			const turn_edges = idx.by_target.get(tool_id) ?? [];
			for (const te of turn_edges) {
				if (te.kind === "invoked_tool") {
					// Found the owning turn — check other tools for edits
					const turn_tools = idx.by_source.get(te.source_id) ?? [];
					for (const sibling_edge of turn_tools) {
						if (
							sibling_edge.kind === "invoked_tool" &&
							sibling_edge.target_id !== tool_id
						) {
							const sibling_out =
								idx.by_source.get(sibling_edge.target_id) ?? [];
							for (const so of sibling_out) {
								if (
									(so.kind === "edited" || so.kind === "wrote") &&
									so.target_id !== artifact_id
								) {
									add_node(so.target_id, "downstream");
									add_edge(
										sibling_edge.target_id,
										so.target_id,
										so.kind,
										"downstream",
									);
								}
							}
						}
					}
				}
			}
		}
	}
}

// ── Trace tool → turn ───────────────────────────────────────────────────────

function trace_tool_to_turn(
	tool_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	contributing_turn_ids: Set<string>,
): void {
	const incoming = idx.by_target.get(tool_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind === "invoked_tool") {
			const turn = idx.node_map.get(edge.source_id);
			if (turn?.kind === "assistant_turn") {
				add_node(turn.id, "primary_path");
				add_edge(turn.id, tool_id, edge.kind, "primary_path");
				contributing_turn_ids.add(turn.id);
			}
		}
	}
}

// ── Structural references ───────────────────────────────────────────────────

function add_structural_references(
	node_roles: Map<string, InsightRole>,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	is_visible: (id: string) => boolean,
): void {
	// Snapshot current node set before iterating (we may add nodes)
	const current_ids = [...node_roles.keys()];

	for (const id of current_ids) {
		const outgoing = idx.by_source.get(id) ?? [];
		for (const edge of outgoing) {
			if (!structural_edge_kinds.has(edge.kind)) continue;

			// Both endpoints must be visible and the target must either
			// already be in the graph or be a visible artifact
			const target_node = idx.node_map.get(edge.target_id);
			if (!target_node) continue;
			if (!is_visible(edge.target_id)) continue;

			// Only add structural refs to artifact nodes
			if (!artifact_node_kinds.has(target_node.kind)) continue;

			// Don't add if this edge was already added with a higher-priority role
			add_node(edge.target_id, "structural_ref");
			add_edge(id, edge.target_id, edge.kind, "structural_ref");
		}

		// Also check incoming structural edges
		const incoming = idx.by_target.get(id) ?? [];
		for (const edge of incoming) {
			if (!structural_edge_kinds.has(edge.kind)) continue;

			const source_node = idx.node_map.get(edge.source_id);
			if (!source_node) continue;
			if (!is_visible(edge.source_id)) continue;
			if (!artifact_node_kinds.has(source_node.kind)) continue;

			add_node(edge.source_id, "structural_ref");
			add_edge(edge.source_id, id, edge.kind, "structural_ref");
		}
	}
}
