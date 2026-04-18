import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";

// ── Types ───────────────────────────────────────────────────────────────────

export type SessionGraphTreeNodeRole = "session" | "artifact" | "framing";
export type SessionGraphTreeEdgeRole = "session" | "framing";

export interface SessionGraphTreeNode {
	id: string;
	node: GraphNode;
	role: SessionGraphTreeNodeRole;
	parent_id: string | null;
	depth: number;
	child_ids: string[];
}

export interface SessionGraphTreeEdge {
	source_id: string;
	target_id: string;
	kind: GraphEdge["kind"];
	role: SessionGraphTreeEdgeRole;
}

export interface SessionGraphTree {
	nodes: SessionGraphTreeNode[];
	edges: SessionGraphTreeEdge[];
	roots: string[];
}

export interface SessionGraphTreeOptions {
	show_ambient?: boolean;
	show_inferred?: boolean;
	show_unexplored?: boolean;
}

interface TemporalOrder {
	turn_index: number;
	tool_index: number;
}

interface EdgeIndex {
	by_source: Map<string, GraphEdge[]>;
	by_target: Map<string, GraphEdge[]>;
	node_map: Map<string, GraphNode>;
	order_map: Map<string, TemporalOrder | null>;
}

interface TreeCandidateEdge {
	edge: GraphEdge;
	role: SessionGraphTreeEdgeRole;
}

// ── Constants ───────────────────────────────────────────────────────────────

const visible_node_kinds = new Set<GraphNode["kind"]>([
	"session_framing",
	"instruction_source",
	"agents_doc",
	"user_prompt",
	"assistant_turn",
	"tool_call",
	"search_query",
	"source_file",
	"doc_file",
]);

const session_edge_kinds = new Set<GraphEdge["kind"]>([
	"prompted",
	"invoked_tool",
	"read",
	"edited",
	"wrote",
]);

const framing_edge_kinds = new Set<GraphEdge["kind"]>([
	"constrained_by",
	"framed_by",
]);

const artifact_node_kinds = new Set<GraphNode["kind"]>([
	"source_file",
	"doc_file",
	"agents_doc",
]);

const tool_node_kinds = new Set<GraphNode["kind"]>([
	"tool_call",
	"search_query",
]);

const root_node_kinds = new Set<GraphNode["kind"]>([
	"session_framing",
	"user_prompt",
]);

const always_visible_kinds = new Set<GraphNode["kind"]>([
	"session_framing",
	"instruction_source",
]);

const temporal_node_kinds = new Set<GraphNode["kind"]>([
	"user_prompt",
	"assistant_turn",
	"tool_call",
	"search_query",
]);

const tool_artifact_edge_kinds = new Set<GraphEdge["kind"]>([
	"read",
	"edited",
	"wrote",
]);

const edge_kind_priority: Record<GraphEdge["kind"], number> = {
	prompted: 1,
	invoked_tool: 2,
	read: 3,
	edited: 4,
	wrote: 5,
	constrained_by: 6,
	framed_by: 7,
	searched_for: 8,
	discovered: 9,
	linked_to: 10,
	imports: 11,
	belongs_to: 12,
	influenced_by: 13,
	adjacent_unexplored: 14,
};

// ── Public API ─────────────────────────────────────────────────────────────

export function project_session_graph_tree(
	graph: SessionGraphPayload,
	options: SessionGraphTreeOptions = {},
): SessionGraphTree {
	const normalized_options = {
		show_ambient: options.show_ambient ?? true,
		show_inferred: options.show_inferred ?? true,
		show_unexplored: options.show_unexplored ?? true,
	};

	const idx = build_edge_index(graph);
	const visible_node_ids = new Set<string>();

	for (const node of graph.nodes) {
		if (is_visible_node(node, normalized_options)) {
			visible_node_ids.add(node.id);
		}
	}

	const candidate_edges_by_target = new Map<string, TreeCandidateEdge[]>();
	for (const edge of graph.edges) {
		const candidate = classify_tree_edge(
			edge,
			idx,
			visible_node_ids,
			normalized_options,
		);
		if (!candidate) continue;

		let existing = candidate_edges_by_target.get(edge.target_id);
		if (!existing) {
			existing = [];
			candidate_edges_by_target.set(edge.target_id, existing);
		}
		existing.push(candidate);
	}

	const parent_by_node = new Map<string, SessionGraphTreeEdge>();
	for (const node_id of visible_node_ids) {
		const node = idx.node_map.get(node_id);
		if (!node || root_node_kinds.has(node.kind)) continue;

		const candidates = candidate_edges_by_target.get(node_id) ?? [];
		if (candidates.length === 0) continue;

		candidates.sort((left, right) => compare_candidates(left, right, idx));
		const chosen = candidates[0];
		parent_by_node.set(node_id, {
			source_id: chosen.edge.source_id,
			target_id: chosen.edge.target_id,
			kind: chosen.edge.kind,
			role: chosen.role,
		});
	}

	const child_ids_by_parent = new Map<string, string[]>();
	for (const node_id of visible_node_ids) {
		const parent_edge = parent_by_node.get(node_id);
		if (!parent_edge) continue;

		let children = child_ids_by_parent.get(parent_edge.source_id);
		if (!children) {
			children = [];
			child_ids_by_parent.set(parent_edge.source_id, children);
		}
		children.push(node_id);
	}

	for (const [parent_id, child_ids] of child_ids_by_parent) {
		child_ids.sort((left, right) => compare_nodes(left, right, idx));
		child_ids_by_parent.set(parent_id, child_ids);
	}

	const roots = [...visible_node_ids].filter(
		(node_id) => !parent_by_node.has(node_id),
	);
	roots.sort((left, right) => compare_nodes(left, right, idx));

	const depth_by_node = new Map<string, number>();
	for (const root_id of roots) {
		assign_depths(root_id, 0, child_ids_by_parent, depth_by_node);
	}

	const nodes = [...visible_node_ids]
		.sort((left, right) => compare_nodes(left, right, idx))
		.map((node_id) => {
			const node = idx.node_map.get(node_id);
			if (!node) {
				throw new Error(`Missing graph node for tree projection: ${node_id}`);
			}

			const parent_edge = parent_by_node.get(node_id);
			return {
				id: node_id,
				node,
				role: derive_node_role(node, parent_edge),
				parent_id: parent_edge?.source_id ?? null,
				depth: depth_by_node.get(node_id) ?? 0,
				child_ids: child_ids_by_parent.get(node_id) ?? [],
			};
		});

	const edges = [...parent_by_node.values()].sort((left, right) => {
		const source_cmp = compare_nodes(left.source_id, right.source_id, idx);
		if (source_cmp !== 0) return source_cmp;
		return compare_nodes(left.target_id, right.target_id, idx);
	});

	return { nodes, edges, roots };
}

// ── Indexing ────────────────────────────────────────────────────────────────

function build_edge_index(graph: SessionGraphPayload): EdgeIndex {
	const by_source = new Map<string, GraphEdge[]>();
	const by_target = new Map<string, GraphEdge[]>();
	const node_map = new Map<string, GraphNode>();

	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	for (const edge of graph.edges) {
		let outgoing = by_source.get(edge.source_id);
		if (!outgoing) {
			outgoing = [];
			by_source.set(edge.source_id, outgoing);
		}
		outgoing.push(edge);

		let incoming = by_target.get(edge.target_id);
		if (!incoming) {
			incoming = [];
			by_target.set(edge.target_id, incoming);
		}
		incoming.push(edge);
	}

	const idx: EdgeIndex = {
		by_source,
		by_target,
		node_map,
		order_map: new Map<string, TemporalOrder | null>(),
	};

	for (const node of graph.nodes) {
		idx.order_map.set(node.id, get_node_order(node.id, idx));
	}

	return idx;
}

// ── Visibility ──────────────────────────────────────────────────────────────

function is_visible_node(
	node: GraphNode,
	options: Required<SessionGraphTreeOptions>,
): boolean {
	if (!visible_node_kinds.has(node.kind)) return false;
	if (node.availability === "available_ambient" && !options.show_ambient)
		return false;
	if (node.availability === "derived_inferred" && !options.show_inferred)
		return false;
	if (
		(node.availability === "unavailable" || node.availability === "unknown") &&
		!options.show_unexplored
	) {
		return false;
	}
	return true;
}

function is_visible_edge(
	edge: GraphEdge,
	options: Required<SessionGraphTreeOptions>,
): boolean {
	if (edge.availability === "available_ambient" && !options.show_ambient)
		return false;
	if (edge.availability === "derived_inferred" && !options.show_inferred)
		return false;
	if (
		(edge.availability === "unavailable" || edge.availability === "unknown") &&
		!options.show_unexplored
	) {
		return false;
	}
	return true;
}

// ── Tree edge selection ─────────────────────────────────────────────────────

function classify_tree_edge(
	edge: GraphEdge,
	idx: EdgeIndex,
	visible_node_ids: Set<string>,
	options: Required<SessionGraphTreeOptions>,
): TreeCandidateEdge | null {
	if (!is_visible_edge(edge, options)) return null;
	if (
		!visible_node_ids.has(edge.source_id) ||
		!visible_node_ids.has(edge.target_id)
	) {
		return null;
	}

	const source = idx.node_map.get(edge.source_id);
	const target = idx.node_map.get(edge.target_id);
	if (!source || !target) return null;

	if (edge.kind === "prompted") {
		if (source.kind === "user_prompt" && target.kind === "assistant_turn") {
			return { edge, role: "session" };
		}
		return null;
	}

	if (edge.kind === "invoked_tool") {
		if (source.kind === "assistant_turn" && tool_node_kinds.has(target.kind)) {
			return { edge, role: "session" };
		}
		return null;
	}

	if (edge.kind === "influenced_by") {
		if (is_supported_tool_parent_influence(edge, source, target, idx)) {
			return { edge, role: "session" };
		}
		return null;
	}

	if (session_edge_kinds.has(edge.kind)) {
		if (
			tool_node_kinds.has(source.kind) &&
			artifact_node_kinds.has(target.kind)
		) {
			return { edge, role: "session" };
		}
		return null;
	}

	if (framing_edge_kinds.has(edge.kind)) {
		if (
			source.kind === "session_framing" &&
			(target.kind === "instruction_source" || target.kind === "agents_doc")
		) {
			return { edge, role: "framing" };
		}
	}

	return null;
}

function is_supported_tool_parent_influence(
	edge: GraphEdge,
	source: GraphNode,
	target: GraphNode,
	idx: EdgeIndex,
): boolean {
	if (!tool_node_kinds.has(source.kind)) return false;
	if (target.kind !== "tool_call") return false;
	if (edge.confidence !== "high" && edge.confidence !== "medium") return false;

	const source_order = idx.order_map.get(source.id) ?? null;
	const target_order = idx.order_map.get(target.id) ?? null;
	if (!source_order || !target_order) return false;
	if (source_order.turn_index !== target_order.turn_index) return false;
	if (source_order.tool_index >= target_order.tool_index) return false;

	return true;
}

function compare_candidates(
	left: TreeCandidateEdge,
	right: TreeCandidateEdge,
	idx: EdgeIndex,
): number {
	const target = idx.node_map.get(left.edge.target_id);
	if (target && target.id === right.edge.target_id) {
		const parent_priority_cmp = compare_parent_priority(
			left.edge,
			right.edge,
			target,
			idx,
		);
		if (parent_priority_cmp !== 0) return parent_priority_cmp;
	}

	const left_order = idx.order_map.get(left.edge.source_id) ?? null;
	const right_order = idx.order_map.get(right.edge.source_id) ?? null;
	const temporal_cmp = compare_temporal_orders(left_order, right_order);
	if (temporal_cmp !== 0) return temporal_cmp;

	const kind_cmp =
		(edge_kind_priority[left.edge.kind] ?? Number.MAX_SAFE_INTEGER) -
		(edge_kind_priority[right.edge.kind] ?? Number.MAX_SAFE_INTEGER);
	if (kind_cmp !== 0) return kind_cmp;

	const source_cmp = compare_nodes(
		left.edge.source_id,
		right.edge.source_id,
		idx,
	);
	if (source_cmp !== 0) return source_cmp;

	return left.edge.target_id.localeCompare(right.edge.target_id);
}

function compare_parent_priority(
	left: GraphEdge,
	right: GraphEdge,
	target: GraphNode,
	idx: EdgeIndex,
): number {
	const left_priority = get_parent_priority(left, target, idx);
	const right_priority = get_parent_priority(right, target, idx);
	if (left_priority !== right_priority) {
		return left_priority - right_priority;
	}

	if (target.kind === "tool_call") {
		const left_source_order = idx.order_map.get(left.source_id) ?? null;
		const right_source_order = idx.order_map.get(right.source_id) ?? null;
		if (
			left.kind === "influenced_by" &&
			right.kind === "influenced_by" &&
			left_source_order &&
			right_source_order &&
			left_source_order.turn_index === right_source_order.turn_index
		) {
			if (left_source_order.tool_index !== right_source_order.tool_index) {
				return right_source_order.tool_index - left_source_order.tool_index;
			}
		}
	}

	return 0;
}

function get_parent_priority(
	edge: GraphEdge,
	target: GraphNode,
	idx: EdgeIndex,
): number {
	const source = idx.node_map.get(edge.source_id);
	if (
		target.kind === "tool_call" &&
		source &&
		edge.kind === "influenced_by" &&
		is_supported_tool_parent_influence(edge, source, target, idx)
	) {
		return edge.confidence === "high" ? 0 : 1;
	}

	if (target.kind === "tool_call" && edge.kind === "invoked_tool") {
		return 2;
	}

	return 10;
}

function derive_node_role(
	node: GraphNode,
	parent_edge?: SessionGraphTreeEdge,
): SessionGraphTreeNodeRole {
	if (node.kind === "session_framing" || parent_edge?.role === "framing") {
		return "framing";
	}
	if (artifact_node_kinds.has(node.kind)) {
		return "artifact";
	}
	return "session";
}

function assign_depths(
	node_id: string,
	depth: number,
	child_ids_by_parent: Map<string, string[]>,
	depth_by_node: Map<string, number>,
): void {
	if (depth_by_node.has(node_id)) return;
	depth_by_node.set(node_id, depth);

	const child_ids = child_ids_by_parent.get(node_id) ?? [];
	for (const child_id of child_ids) {
		assign_depths(child_id, depth + 1, child_ids_by_parent, depth_by_node);
	}
}

// ── Ordering helpers ────────────────────────────────────────────────────────

function compare_nodes(
	left_id: string,
	right_id: string,
	idx: EdgeIndex,
): number {
	const left = idx.node_map.get(left_id);
	const right = idx.node_map.get(right_id);
	if (!left || !right) return left_id.localeCompare(right_id);

	const category_cmp = node_category_rank(left) - node_category_rank(right);
	if (category_cmp !== 0) return category_cmp;

	const temporal_cmp = compare_temporal_orders(
		idx.order_map.get(left_id) ?? null,
		idx.order_map.get(right_id) ?? null,
	);
	if (temporal_cmp !== 0) return temporal_cmp;

	const label_cmp = left.label.localeCompare(right.label);
	if (label_cmp !== 0) return label_cmp;

	return left.id.localeCompare(right.id);
}

function node_category_rank(node: GraphNode): number {
	if (node.kind === "session_framing") return 0;
	if (node.kind === "user_prompt") return 1;
	if (node.kind === "assistant_turn") return 2;
	if (tool_node_kinds.has(node.kind)) return 3;
	if (artifact_node_kinds.has(node.kind)) return 4;
	if (always_visible_kinds.has(node.kind)) return 5;
	return 6;
}

function compare_temporal_orders(
	left: TemporalOrder | null,
	right: TemporalOrder | null,
): number {
	if (left && right) {
		if (left.turn_index !== right.turn_index) {
			return left.turn_index - right.turn_index;
		}
		if (left.tool_index !== right.tool_index) {
			return left.tool_index - right.tool_index;
		}
		return 0;
	}
	if (left) return -1;
	if (right) return 1;
	return 0;
}

// ── Temporal order derivation ───────────────────────────────────────────────

function get_node_order(node_id: string, idx: EdgeIndex): TemporalOrder | null {
	const node = idx.node_map.get(node_id);
	if (!node) return null;
	if (always_visible_kinds.has(node.kind)) return null;

	if (temporal_node_kinds.has(node.kind)) {
		const turn_index = node.metadata?.turn_index;
		if (typeof turn_index !== "number") return null;

		const tool_index = node.metadata?.tool_index;
		return {
			turn_index,
			tool_index:
				typeof tool_index === "number" ? tool_index : Number.POSITIVE_INFINITY,
		};
	}

	if (artifact_node_kinds.has(node.kind)) {
		return derive_artifact_first_seen(node_id, idx);
	}

	return null;
}

function derive_artifact_first_seen(
	node_id: string,
	idx: EdgeIndex,
): TemporalOrder | null {
	const incoming = idx.by_target.get(node_id) ?? [];
	let earliest: TemporalOrder | null = null;

	for (const edge of incoming) {
		if (!tool_artifact_edge_kinds.has(edge.kind)) continue;
		const source_order = get_tool_order(edge.source_id, idx);
		if (!source_order) continue;
		if (!earliest || compare_temporal_orders(source_order, earliest) < 0) {
			earliest = source_order;
		}
	}

	return earliest;
}

function get_tool_order(tool_id: string, idx: EdgeIndex): TemporalOrder | null {
	const tool = idx.node_map.get(tool_id);
	if (!tool) return null;

	const turn_index = tool.metadata?.turn_index;
	if (typeof turn_index === "number") {
		const tool_index = tool.metadata?.tool_index;
		return {
			turn_index,
			tool_index:
				typeof tool_index === "number" ? tool_index : Number.POSITIVE_INFINITY,
		};
	}

	const incoming = idx.by_target.get(tool_id) ?? [];
	for (const edge of incoming) {
		if (edge.kind !== "invoked_tool") continue;
		const turn = idx.node_map.get(edge.source_id);
		if (turn?.kind !== "assistant_turn") continue;
		const derived_turn_index = turn.metadata?.turn_index;
		if (typeof derived_turn_index !== "number") continue;
		return {
			turn_index: derived_turn_index,
			tool_index: Number.POSITIVE_INFINITY,
		};
	}

	return null;
}
