import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";

export type SessionGraphGroupedNodeRole = "session" | "artifact" | "framing";
export type SessionGraphGroupedEdgeRole = "session" | "artifact" | "framing";

export interface SessionGraphGroupedNode {
	id: string;
	node: GraphNode;
	role: SessionGraphGroupedNodeRole;
	member_ids: string[];
	column: number;
	first_seen: TemporalOrder | null;
}

export interface SessionGraphGroupedEdge {
	source_id: string;
	target_id: string;
	kind: GraphEdge["kind"];
	role: SessionGraphGroupedEdgeRole;
	member_count: number;
}

export interface SessionGraphGroupedProjection {
	nodes: SessionGraphGroupedNode[];
	edges: SessionGraphGroupedEdge[];
	raw_to_group_id: Map<string, string>;
}

export interface SessionGraphGroupedProjectionOptions {
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

const artifact_node_kinds = new Set<GraphNode["kind"]>([
	"source_file",
	"doc_file",
	"agents_doc",
]);

const temporal_node_kinds = new Set<GraphNode["kind"]>([
	"user_prompt",
	"assistant_turn",
	"tool_call",
	"search_query",
]);

const always_visible_kinds = new Set<GraphNode["kind"]>([
	"session_framing",
	"instruction_source",
]);

const display_edge_kinds = new Set<GraphEdge["kind"]>([
	"prompted",
	"invoked_tool",
	"influenced_by",
	"read",
	"edited",
	"wrote",
	"constrained_by",
	"framed_by",
]);

const tool_artifact_edge_kinds = new Set<GraphEdge["kind"]>([
	"read",
	"edited",
	"wrote",
]);

export function project_session_graph_grouped(
	graph: SessionGraphPayload,
	options: SessionGraphGroupedProjectionOptions = {},
): SessionGraphGroupedProjection {
	const normalized_options = {
		show_ambient: options.show_ambient ?? true,
		show_inferred: options.show_inferred ?? true,
		show_unexplored: options.show_unexplored ?? true,
	};

	const idx = build_edge_index(graph);
	const visible_nodes = graph.nodes
		.filter((node) => is_visible_node(node, normalized_options))
		.sort((left, right) => compare_raw_nodes(left.id, right.id, idx));

	const raw_to_group_id = new Map<string, string>();
	const groups_by_signature = new Map<string, SessionGraphGroupedNode>();

	for (const node of visible_nodes) {
		const signature = get_group_signature(node);
		let group = groups_by_signature.get(signature);
		if (!group) {
			group = {
				id: node.id,
				node: {
					...node,
					metadata: {
						...node.metadata,
						member_node_ids: [node.id],
						member_count: 1,
					},
				},
				role: derive_node_role(node),
				member_ids: [node.id],
				column: get_node_column(node),
				first_seen: idx.order_map.get(node.id) ?? null,
			};
			groups_by_signature.set(signature, group);
		} else {
			group.member_ids.push(node.id);
			group.node = {
				...group.node,
				metadata: {
					...group.node.metadata,
					member_node_ids: [...group.member_ids],
					member_count: group.member_ids.length,
				},
			};
		}

		raw_to_group_id.set(node.id, group.id);
	}

	const grouped_edges = new Map<string, SessionGraphGroupedEdge>();
	for (const edge of graph.edges) {
		if (!is_visible_edge(edge, normalized_options)) continue;
		if (!display_edge_kinds.has(edge.kind)) continue;

		const source_id = raw_to_group_id.get(edge.source_id);
		const target_id = raw_to_group_id.get(edge.target_id);
		if (!source_id || !target_id || source_id === target_id) continue;

		const source = idx.node_map.get(edge.source_id);
		const target = idx.node_map.get(edge.target_id);
		if (!source || !target) continue;

		const role = classify_edge_role(edge, source, target);
		if (!role) continue;

		const key = `${source_id}->${target_id}:${edge.kind}`;
		const existing = grouped_edges.get(key);
		if (existing) {
			existing.member_count += 1;
			continue;
		}

		grouped_edges.set(key, {
			source_id,
			target_id,
			kind: edge.kind,
			role,
			member_count: 1,
		});
	}

	const nodes = [...groups_by_signature.values()].sort((left, right) => {
		if (left.column !== right.column) return left.column - right.column;
		const order_cmp = compare_temporal_orders(
			left.first_seen,
			right.first_seen,
		);
		if (order_cmp !== 0) return order_cmp;
		const label_cmp = left.node.label.localeCompare(right.node.label);
		if (label_cmp !== 0) return label_cmp;
		return left.id.localeCompare(right.id);
	});
	const group_by_id = new Map<string, SessionGraphGroupedNode>();
	for (const node of nodes) {
		group_by_id.set(node.id, node);
	}

	const edges = [...grouped_edges.values()].sort((left, right) => {
		const source_cmp = compare_group_order(
			left.source_id,
			right.source_id,
			group_by_id,
		);
		if (source_cmp !== 0) return source_cmp;
		return compare_group_order(left.target_id, right.target_id, group_by_id);
	});

	return {
		nodes,
		edges,
		raw_to_group_id,
	};
}

export function resolve_grouped_selection_member_id(
	projection: SessionGraphGroupedProjection,
	projection_node_id: string,
	current_raw_node_id: string | null,
): string {
	const projection_node = projection.nodes.find(
		(node) => node.id === projection_node_id,
	);
	if (!projection_node) {
		return projection_node_id;
	}

	if (
		current_raw_node_id &&
		projection.raw_to_group_id.get(current_raw_node_id) ===
			projection_node_id &&
		projection_node.member_ids.includes(current_raw_node_id)
	) {
		return current_raw_node_id;
	}

	return (
		projection_node.member_ids[projection_node.member_ids.length - 1] ??
		projection_node_id
	);
}

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

function is_visible_node(
	node: GraphNode,
	options: Required<SessionGraphGroupedProjectionOptions>,
): boolean {
	if (!visible_node_kinds.has(node.kind)) return false;
	if (node.availability === "available_ambient" && !options.show_ambient) {
		return false;
	}
	if (node.availability === "derived_inferred" && !options.show_inferred) {
		return false;
	}
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
	options: Required<SessionGraphGroupedProjectionOptions>,
): boolean {
	if (edge.availability === "available_ambient" && !options.show_ambient) {
		return false;
	}
	if (edge.availability === "derived_inferred" && !options.show_inferred) {
		return false;
	}
	if (
		(edge.availability === "unavailable" || edge.availability === "unknown") &&
		!options.show_unexplored
	) {
		return false;
	}
	return true;
}

function get_group_signature(node: GraphNode): string {
	if (node.kind === "search_query") {
		const query = node.metadata?.query;
		return typeof query === "string"
			? `search:${query}`
			: `search:${node.label}`;
	}

	if (node.kind === "tool_call") {
		const tool_name = node.metadata?.tool_name;
		const relative_path =
			typeof node.metadata?.relative_path === "string"
				? node.metadata.relative_path
				: typeof node.metadata?.file_path === "string"
					? node.metadata.file_path
					: null;

		if (typeof tool_name === "string" && typeof relative_path === "string") {
			return `tool:${tool_name}:${relative_path}`;
		}

		if (
			typeof tool_name === "string" &&
			(node.label.startsWith("read:") ||
				node.label.startsWith("edit:") ||
				node.label.startsWith("write:"))
		) {
			return `tool:${tool_name}:${node.label}`;
		}

		return node.id;
	}

	if (artifact_node_kinds.has(node.kind)) {
		const path = node.metadata?.path;
		return typeof path === "string"
			? `artifact:${node.kind}:${path}`
			: `artifact:${node.kind}:${node.id}`;
	}

	return node.id;
}

function classify_edge_role(
	edge: GraphEdge,
	source: GraphNode,
	target: GraphNode,
): SessionGraphGroupedEdgeRole | null {
	if (edge.kind === "prompted") {
		if (source.kind === "user_prompt" && target.kind === "assistant_turn") {
			return "session";
		}
		return null;
	}

	if (edge.kind === "invoked_tool") {
		if (
			source.kind === "assistant_turn" &&
			(target.kind === "search_query" || target.kind === "tool_call")
		) {
			return "session";
		}
		return null;
	}

	if (edge.kind === "influenced_by") {
		if (
			(source.kind === "search_query" || source.kind === "tool_call") &&
			(target.kind === "tool_call" || target.kind === "search_query")
		) {
			return "session";
		}
		return null;
	}

	if (tool_artifact_edge_kinds.has(edge.kind)) {
		if (source.kind === "tool_call" && artifact_node_kinds.has(target.kind)) {
			return "artifact";
		}
		return null;
	}

	if (edge.kind === "framed_by" || edge.kind === "constrained_by") {
		if (source.kind === "session_framing") {
			return "framing";
		}
	}

	return null;
}

function derive_node_role(node: GraphNode): SessionGraphGroupedNodeRole {
	if (node.kind === "session_framing" || node.kind === "instruction_source") {
		return "framing";
	}
	if (artifact_node_kinds.has(node.kind)) {
		return "artifact";
	}
	return "session";
}

function get_node_column(node: GraphNode): number {
	if (node.kind === "session_framing" || node.kind === "instruction_source") {
		return 0;
	}
	if (node.kind === "user_prompt") return 1;
	if (node.kind === "assistant_turn") return 2;
	if (node.kind === "search_query") return 3;
	if (node.kind === "tool_call") return 4;
	if (artifact_node_kinds.has(node.kind)) return 5;
	return 4;
}

function compare_group_order(
	left_id: string,
	right_id: string,
	group_by_id: Map<string, SessionGraphGroupedNode>,
): number {
	const left = group_by_id.get(left_id);
	const right = group_by_id.get(right_id);
	if (!left || !right) return left_id.localeCompare(right_id);
	if (left.column !== right.column) return left.column - right.column;
	const order_cmp = compare_temporal_orders(left.first_seen, right.first_seen);
	if (order_cmp !== 0) return order_cmp;
	return left.id.localeCompare(right.id);
}

function compare_raw_nodes(
	left_id: string,
	right_id: string,
	idx: EdgeIndex,
): number {
	const left = idx.node_map.get(left_id);
	const right = idx.node_map.get(right_id);
	if (!left || !right) return left_id.localeCompare(right_id);

	const order_cmp = compare_temporal_orders(
		idx.order_map.get(left_id) ?? null,
		idx.order_map.get(right_id) ?? null,
	);
	if (order_cmp !== 0) return order_cmp;

	const column_cmp = get_node_column(left) - get_node_column(right);
	if (column_cmp !== 0) return column_cmp;

	const label_cmp = left.label.localeCompare(right.label);
	if (label_cmp !== 0) return label_cmp;
	return left.id.localeCompare(right.id);
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
