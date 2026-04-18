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

/** Edge kinds that directly represent a tool touching an artifact. */
const action_edge_kinds = new Set<string>(["read", "edited", "wrote"]);

/** Discovery edges that explain what a search surfaced. */
const discovery_edge_kinds = new Set<string>(["discovered", "searched_for"]);

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

	if (node.kind === "user_prompt" || node.kind === "assistant_turn") {
		derive_turn_insight(selected_node_id, idx, add_node, add_edge, is_visible);
	} else if (node.kind === "tool_call" || node.kind === "search_query") {
		derive_tool_insight(selected_node_id, idx, add_node, add_edge, is_visible);
	} else if (artifact_node_kinds.has(node.kind)) {
		derive_artifact_insight(
			selected_node_id,
			idx,
			add_node,
			add_edge,
			is_visible,
		);
	} else {
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
	is_visible: (id: string) => boolean,
): void {
	const node = idx.node_map.get(selected_id);
	if (!node) return;

	let assistant_turn_id: string | null = null;
	if (node.kind === "user_prompt") {
		const outgoing = idx.by_source.get(selected_id) ?? [];
		for (const edge of outgoing) {
			if (edge.kind !== "prompted") continue;
			const target = idx.node_map.get(edge.target_id);
			if (target?.kind !== "assistant_turn") continue;
			assistant_turn_id = target.id;
			add_node(target.id, "primary_path");
			add_edge(selected_id, target.id, edge.kind, "primary_path");
			break;
		}
	} else if (node.kind === "assistant_turn") {
		assistant_turn_id = selected_id;
		add_turn_prompt_context(selected_id, idx, add_node, add_edge, is_visible);
	}

	if (!assistant_turn_id) return;
	derive_turn_downstream(
		assistant_turn_id,
		idx,
		add_node,
		add_edge,
		is_visible,
	);
}

function derive_tool_insight(
	selected_tool_id: string,
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
	trace_primary_tool_upstream(
		selected_tool_id,
		idx,
		add_node,
		add_edge,
		is_visible,
		new Set(),
	);
	trace_tool_primary_descendants(
		selected_tool_id,
		idx,
		add_node,
		add_edge,
		is_visible,
		new Set(),
	);
	add_supporting_tool_influences(
		selected_tool_id,
		idx,
		add_node,
		add_edge,
		is_visible,
	);
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
	const incoming = idx.by_target.get(artifact_id) ?? [];
	const contributing_tool_ids = new Set<string>();
	let has_primary_action = false;

	for (const edge of incoming) {
		if (!action_edge_kinds.has(edge.kind)) continue;
		const source = idx.node_map.get(edge.source_id);
		if (!source || !is_visible(source.id)) continue;

		has_primary_action = true;
		contributing_tool_ids.add(source.id);
		add_node(source.id, "primary_path");
		add_edge(source.id, artifact_id, edge.kind, "primary_path");
		trace_primary_tool_upstream(
			source.id,
			idx,
			add_node,
			add_edge,
			is_visible,
			new Set(),
		);
	}

	if (!has_primary_action) {
		for (const edge of incoming) {
			if (!discovery_edge_kinds.has(edge.kind)) continue;
			const source = idx.node_map.get(edge.source_id);
			if (!source || !is_visible(source.id)) continue;
			add_node(source.id, "primary_path");
			add_edge(source.id, artifact_id, edge.kind, "primary_path");
			trace_primary_tool_upstream(
				source.id,
				idx,
				add_node,
				add_edge,
				is_visible,
				new Set(),
			);
		}
	}

	for (const edge of incoming) {
		if (discovery_edge_kinds.has(edge.kind)) {
			add_node(edge.source_id, "supporting");
			add_edge(edge.source_id, artifact_id, edge.kind, "supporting");
			continue;
		}
		if (influence_edge_kinds.has(edge.kind)) {
			add_node(edge.source_id, "supporting");
			add_edge(edge.source_id, artifact_id, edge.kind, "supporting");
		}
	}

	for (const tool_id of contributing_tool_ids) {
		add_supporting_tool_influences(
			tool_id,
			idx,
			add_node,
			add_edge,
			is_visible,
		);
	}

	derive_downstream_effects(artifact_id, idx, add_node, add_edge, is_visible);
}

function derive_turn_downstream(
	assistant_turn_id: string,
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
	const outgoing = idx.by_source.get(assistant_turn_id) ?? [];
	for (const edge of outgoing) {
		if (edge.kind !== "invoked_tool") continue;
		if (!is_visible(edge.target_id)) continue;
		if (get_primary_tool_influence(edge.target_id, idx, is_visible)) continue;

		add_node(edge.target_id, "primary_path");
		add_edge(assistant_turn_id, edge.target_id, edge.kind, "primary_path");
		trace_tool_primary_descendants(
			edge.target_id,
			idx,
			add_node,
			add_edge,
			is_visible,
			new Set(),
		);
	}
}

function trace_primary_tool_upstream(
	tool_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	is_visible: (id: string) => boolean,
	visited_tool_ids: Set<string>,
): void {
	if (visited_tool_ids.has(tool_id)) return;
	visited_tool_ids.add(tool_id);

	const primary_influence = get_primary_tool_influence(
		tool_id,
		idx,
		is_visible,
	);
	if (primary_influence) {
		add_node(primary_influence.source_id, "primary_path");
		add_edge(
			primary_influence.source_id,
			tool_id,
			primary_influence.kind,
			"primary_path",
		);
		trace_primary_tool_upstream(
			primary_influence.source_id,
			idx,
			add_node,
			add_edge,
			is_visible,
			visited_tool_ids,
		);
		return;
	}

	const turn_edge = get_tool_invocation_edge(tool_id, idx, is_visible);
	if (!turn_edge) return;

	add_node(turn_edge.source_id, "primary_path");
	add_edge(turn_edge.source_id, tool_id, turn_edge.kind, "primary_path");
	add_turn_prompt_context(
		turn_edge.source_id,
		idx,
		add_node,
		add_edge,
		is_visible,
	);
}

function trace_tool_primary_descendants(
	tool_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
	is_visible: (id: string) => boolean,
	visited_tool_ids: Set<string>,
): void {
	if (visited_tool_ids.has(tool_id)) return;
	visited_tool_ids.add(tool_id);

	add_tool_supporting_discovery_outputs(tool_id, idx, add_node, add_edge);

	const outgoing = idx.by_source.get(tool_id) ?? [];
	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (!target || !is_visible(target.id)) continue;

		if (
			action_edge_kinds.has(edge.kind) &&
			artifact_node_kinds.has(target.kind)
		) {
			add_node(target.id, "primary_path");
			add_edge(tool_id, target.id, edge.kind, "primary_path");
			continue;
		}

		if (edge.kind === "influenced_by" && target.kind === "tool_call") {
			const primary_influence = get_primary_tool_influence(
				target.id,
				idx,
				is_visible,
			);
			if (!primary_influence || primary_influence.source_id !== tool_id)
				continue;

			add_node(target.id, "primary_path");
			add_edge(tool_id, target.id, edge.kind, "primary_path");
			trace_tool_primary_descendants(
				target.id,
				idx,
				add_node,
				add_edge,
				is_visible,
				visited_tool_ids,
			);
		}
	}
}

function add_tool_supporting_discovery_outputs(
	tool_id: string,
	idx: EdgeIndex,
	add_node: (id: string, role: InsightRole) => void,
	add_edge: (
		source: string,
		target: string,
		kind: string,
		role: InsightRole,
	) => void,
): void {
	const outgoing = idx.by_source.get(tool_id) ?? [];
	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (!target || !artifact_node_kinds.has(target.kind)) continue;
		if (!discovery_edge_kinds.has(edge.kind)) continue;
		add_node(target.id, "supporting");
		add_edge(tool_id, target.id, edge.kind, "supporting");
	}
}

function add_supporting_tool_influences(
	tool_id: string,
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
	const incoming = idx.by_target.get(tool_id) ?? [];
	const primary_influence = get_primary_tool_influence(
		tool_id,
		idx,
		is_visible,
	);

	for (const edge of incoming) {
		if (edge.kind !== "influenced_by") continue;
		if (!is_visible(edge.source_id)) continue;
		if (
			primary_influence &&
			primary_influence.source_id === edge.source_id &&
			primary_influence.target_id === edge.target_id
		) {
			continue;
		}
		add_node(edge.source_id, "supporting");
		add_edge(edge.source_id, tool_id, edge.kind, "supporting");
	}
}

function add_turn_prompt_context(
	turn_id: string,
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
	const user_prompt_id = find_turn_user_prompt_id(turn_id, idx);
	if (!user_prompt_id || !is_visible(user_prompt_id)) return;
	add_node(user_prompt_id, "primary_path");
	add_edge(user_prompt_id, turn_id, "prompted", "primary_path");
}

function find_turn_user_prompt_id(
	turn_id: string,
	idx: EdgeIndex,
): string | null {
	const turn_node = idx.node_map.get(turn_id);
	if (turn_node?.kind !== "assistant_turn") return null;

	const incoming = idx.by_target.get(turn_id) ?? [];
	for (const edge of incoming) {
		if (edge.kind !== "prompted") continue;
		const source = idx.node_map.get(edge.source_id);
		if (source?.kind === "user_prompt") return source.id;
	}

	const turn_index = turn_node.metadata?.turn_index;
	if (typeof turn_index !== "number") return null;
	for (const [id, node] of idx.node_map) {
		if (
			node.kind === "user_prompt" &&
			(node.metadata?.turn_index as number) === turn_index
		) {
			return id;
		}
	}

	return null;
}

function get_tool_invocation_edge(
	tool_id: string,
	idx: EdgeIndex,
	is_visible: (id: string) => boolean,
): GraphEdge | null {
	const incoming = idx.by_target.get(tool_id) ?? [];
	for (const edge of incoming) {
		if (edge.kind !== "invoked_tool") continue;
		const source = idx.node_map.get(edge.source_id);
		if (source?.kind !== "assistant_turn") continue;
		if (!is_visible(source.id)) continue;
		return edge;
	}
	return null;
}

function get_primary_tool_influence(
	tool_id: string,
	idx: EdgeIndex,
	is_visible: (id: string) => boolean,
): GraphEdge | null {
	const target = idx.node_map.get(tool_id);
	if (target?.kind !== "tool_call") return null;

	const incoming = idx.by_target.get(tool_id) ?? [];
	const candidates = incoming.filter((edge) => {
		if (edge.kind !== "influenced_by") return false;
		if (edge.confidence !== "high" && edge.confidence !== "medium")
			return false;
		if (!is_visible(edge.source_id)) return false;

		const source = idx.node_map.get(edge.source_id);
		if (source?.kind !== "tool_call" && source?.kind !== "search_query") {
			return false;
		}

		const source_turn_index = source.metadata?.turn_index;
		const target_turn_index = target.metadata?.turn_index;
		const source_tool_index = source.metadata?.tool_index;
		const target_tool_index = target.metadata?.tool_index;
		if (
			typeof source_turn_index !== "number" ||
			typeof target_turn_index !== "number" ||
			source_turn_index !== target_turn_index
		) {
			return false;
		}
		if (
			typeof source_tool_index !== "number" ||
			typeof target_tool_index !== "number" ||
			source_tool_index >= target_tool_index
		) {
			return false;
		}
		return true;
	});

	candidates.sort((left, right) => {
		const confidence_cmp = compare_edge_confidence(right, left);
		if (confidence_cmp !== 0) return confidence_cmp;

		const left_source = idx.node_map.get(left.source_id);
		const right_source = idx.node_map.get(right.source_id);
		const left_tool_index = left_source?.metadata?.tool_index;
		const right_tool_index = right_source?.metadata?.tool_index;
		if (
			typeof left_tool_index === "number" &&
			typeof right_tool_index === "number" &&
			left_tool_index !== right_tool_index
		) {
			return right_tool_index - left_tool_index;
		}

		return left.source_id.localeCompare(right.source_id);
	});

	return candidates[0] ?? null;
}

function compare_edge_confidence(left: GraphEdge, right: GraphEdge): number {
	return (
		get_confidence_rank(left.confidence) - get_confidence_rank(right.confidence)
	);
}

function get_confidence_rank(confidence: GraphEdge["confidence"]): number {
	if (confidence === "high") return 2;
	if (confidence === "medium") return 1;
	if (confidence === "low") return 0;
	return -1;
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
