import type {
	SessionGraphGroupedEdge,
	SessionGraphGroupedNode,
	SessionGraphGroupedNodeRole,
	SessionGraphGroupedProjection,
} from "./exploration-session-graph-grouped-view-model";

export interface SessionGraphLayoutNode {
	id: string;
	label: string;
	kind: SessionGraphGroupedNode["node"]["kind"];
	role: SessionGraphGroupedNodeRole;
	parent_id: string | null;
	depth: number;
	row: number;
	x: number;
	y: number;
	is_selected: boolean;
	is_on_selected_path: boolean;
}

export interface SessionGraphLayoutEdge {
	source_id: string;
	target_id: string;
	kind: SessionGraphGroupedEdge["kind"];
	role: SessionGraphGroupedEdge["role"];
	points: Array<[number, number]>;
	is_on_selected_path: boolean;
}

export interface SessionGraphLayout {
	nodes: SessionGraphLayoutNode[];
	edges: SessionGraphLayoutEdge[];
	width: number;
	height: number;
	selected_projection_node_id: string | null;
}

const COL_GAP = 56;
const ROW_GAP = 16;
const NODE_W = 190;
const NODE_H = 38;
const PAD = 24;
const EDGE_LANE_INSET = 10;
const BRIDGE_RAIL_STEP = 12;

export function compute_grouped_session_graph_layout(
	projection: SessionGraphGroupedProjection,
	selected_raw_node_id: string | null,
): SessionGraphLayout {
	if (projection.nodes.length === 0) {
		return {
			nodes: [],
			edges: [],
			width: 0,
			height: 0,
			selected_projection_node_id: null,
		};
	}

	const node_map = new Map<string, SessionGraphGroupedNode>();
	for (const node of projection.nodes) {
		node_map.set(node.id, node);
	}

	const by_source = new Map<string, SessionGraphGroupedEdge[]>();
	const by_target = new Map<string, SessionGraphGroupedEdge[]>();
	for (const edge of projection.edges) {
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

	const selected_projection_node_id = selected_raw_node_id
		? (projection.raw_to_group_id.get(selected_raw_node_id) ??
			selected_raw_node_id)
		: null;
	const selected_path = compute_selected_path(
		selected_projection_node_id,
		node_map,
		by_source,
		by_target,
	);

	const row_by_node = assign_rows(projection, node_map, by_source, by_target);

	const nodes = [...projection.nodes]
		.sort((left, right) => {
			if (left.column !== right.column) return left.column - right.column;
			const left_row = row_by_node.get(left.id) ?? 0;
			const right_row = row_by_node.get(right.id) ?? 0;
			if (left_row !== right_row) return left_row - right_row;
			return left.id.localeCompare(right.id);
		})
		.map((node) => {
			const row = row_by_node.get(node.id) ?? 0;
			const x = PAD + node.column * (NODE_W + COL_GAP);
			const y = PAD + row * (NODE_H + ROW_GAP);
			return {
				id: node.id,
				label: node.node.label,
				kind: node.node.kind,
				role: node.role,
				parent_id: null,
				depth: node.column,
				row,
				x,
				y,
				is_selected: node.id === selected_projection_node_id,
				is_on_selected_path: selected_path.node_ids.has(node.id),
			};
		});

	const layout_node_by_id = new Map<string, SessionGraphLayoutNode>();
	for (const node of nodes) {
		layout_node_by_id.set(node.id, node);
	}

	const edges = projection.edges.map((edge) => {
		const source = layout_node_by_id.get(edge.source_id);
		const target = layout_node_by_id.get(edge.target_id);
		if (!source || !target) {
			throw new Error(
				`Missing grouped layout position for edge ${edge.source_id} -> ${edge.target_id}`,
			);
		}

		return {
			source_id: edge.source_id,
			target_id: edge.target_id,
			kind: edge.kind,
			role: edge.role,
			points: route_edge(source, target),
			is_on_selected_path: selected_path.edge_keys.has(
				make_edge_key(edge.source_id, edge.target_id),
			),
		};
	});

	const max_x = Math.max(...nodes.map((node) => node.x + NODE_W), 0);
	const max_y = Math.max(...nodes.map((node) => node.y + NODE_H), 0);

	return {
		nodes,
		edges,
		width: max_x + PAD,
		height: max_y + PAD,
		selected_projection_node_id,
	};
}

function assign_rows(
	projection: SessionGraphGroupedProjection,
	node_map: Map<string, SessionGraphGroupedNode>,
	by_source: Map<string, SessionGraphGroupedEdge[]>,
	by_target: Map<string, SessionGraphGroupedEdge[]>,
): Map<string, number> {
	const sorted_columns = [
		...new Set(projection.nodes.map((node) => node.column)),
	].sort((left, right) => left - right);
	const ids_by_column_and_band = new Map<number, Map<number, string[]>>();
	const band_keys = new Set<number>();

	for (const node of projection.nodes) {
		const band_key = get_timeline_band_key(node);
		band_keys.add(band_key);
		let column_bands = ids_by_column_and_band.get(node.column);
		if (!column_bands) {
			column_bands = new Map<number, string[]>();
			ids_by_column_and_band.set(node.column, column_bands);
		}
		let ids = column_bands.get(band_key);
		if (!ids) {
			ids = [];
			column_bands.set(band_key, ids);
		}
		ids.push(node.id);
	}

	const sorted_band_keys = [...band_keys].sort((left, right) => left - right);
	const base_rank = new Map<string, number>();
	for (const column of sorted_columns) {
		const column_bands = ids_by_column_and_band.get(column);
		if (!column_bands) continue;
		for (const band_key of sorted_band_keys) {
			const ids = column_bands.get(band_key) ?? [];
			ids.sort((left_id, right_id) =>
				compare_nodes_within_timeline_band(left_id, right_id, node_map),
			);
			for (const [index, id] of ids.entries()) {
				base_rank.set(id, index);
			}
		}
	}

	const row_by_id = new Map<string, number>();
	const next_row_by_column = new Map<number, number>();

	for (const band_key of sorted_band_keys) {
		const local_rank_by_id = new Map<string, number>();
		const ids_by_column = new Map<number, string[]>();

		for (const column of sorted_columns) {
			const ids = [
				...((ids_by_column_and_band.get(column)?.get(band_key) ??
					[]) as string[]),
			].sort((left_id, right_id) =>
				compare_nodes_within_timeline_band(left_id, right_id, node_map),
			);
			ids_by_column.set(column, ids);
			for (const [index, id] of ids.entries()) {
				local_rank_by_id.set(id, index);
			}
		}

		for (const columns of [sorted_columns, [...sorted_columns].reverse()]) {
			for (const column of columns) {
				const ids = [...(ids_by_column.get(column) ?? [])];
				ids.sort((left_id, right_id) => {
					const left_anchor = get_band_row_anchor(
						left_id,
						band_key,
						local_rank_by_id,
						node_map,
						by_source,
						by_target,
					);
					const right_anchor = get_band_row_anchor(
						right_id,
						band_key,
						local_rank_by_id,
						node_map,
						by_source,
						by_target,
					);
					if (left_anchor !== right_anchor) return left_anchor - right_anchor;
					return (base_rank.get(left_id) ?? 0) - (base_rank.get(right_id) ?? 0);
				});
				for (const [index, id] of ids.entries()) {
					local_rank_by_id.set(id, index);
				}
				ids_by_column.set(column, ids);
			}
		}

		for (const column of sorted_columns) {
			const ids = ids_by_column.get(column) ?? [];
			const start_row = next_row_by_column.get(column) ?? 0;
			for (const [index, id] of ids.entries()) {
				row_by_id.set(id, start_row + index);
			}
			next_row_by_column.set(column, start_row + ids.length);
		}
	}

	return row_by_id;
}

function compare_nodes_within_timeline_band(
	left_id: string,
	right_id: string,
	node_map: Map<string, SessionGraphGroupedNode>,
): number {
	const left = node_map.get(left_id);
	const right = node_map.get(right_id);
	if (!left || !right) return left_id.localeCompare(right_id);
	const order_cmp = compare_temporal_orders(left.first_seen, right.first_seen);
	if (order_cmp !== 0) return order_cmp;
	const label_cmp = left.node.label.localeCompare(right.node.label);
	if (label_cmp !== 0) return label_cmp;
	return left.id.localeCompare(right.id);
}

function get_timeline_band_key(node: SessionGraphGroupedNode): number {
	const turn_anchor = get_turn_anchor(node);
	return Number.isFinite(turn_anchor) ? turn_anchor : -1;
}

function get_turn_anchor(node: SessionGraphGroupedNode): number {
	const turn_index = node.node.metadata?.turn_index;
	if (typeof turn_index === "number") return turn_index;
	const first_seen_turn = node.first_seen?.turn_index;
	return typeof first_seen_turn === "number"
		? first_seen_turn
		: Number.MAX_SAFE_INTEGER;
}

function get_band_row_anchor(
	node_id: string,
	band_key: number,
	local_rank_by_id: Map<string, number>,
	node_map: Map<string, SessionGraphGroupedNode>,
	by_source: Map<string, SessionGraphGroupedEdge[]>,
	by_target: Map<string, SessionGraphGroupedEdge[]>,
): number {
	const neighbors = [
		...(by_target.get(node_id) ?? []).map((edge) => edge.source_id),
		...(by_source.get(node_id) ?? []).map((edge) => edge.target_id),
	]
		.filter((neighbor_id) => {
			const neighbor = node_map.get(neighbor_id);
			return neighbor ? get_timeline_band_key(neighbor) === band_key : false;
		})
		.map((neighbor_id) => local_rank_by_id.get(neighbor_id))
		.filter((row): row is number => typeof row === "number");

	if (neighbors.length === 0) {
		return local_rank_by_id.get(node_id) ?? Number.MAX_SAFE_INTEGER;
	}

	return neighbors.reduce((sum, row) => sum + row, 0) / neighbors.length;
}

function compare_temporal_orders(
	left: { turn_index: number; tool_index: number } | null,
	right: { turn_index: number; tool_index: number } | null,
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

function compute_selected_path(
	selected_node_id: string | null,
	node_map: Map<string, SessionGraphGroupedNode>,
	by_source: Map<string, SessionGraphGroupedEdge[]>,
	by_target: Map<string, SessionGraphGroupedEdge[]>,
): { node_ids: Set<string>; edge_keys: Set<string> } {
	const node_ids = new Set<string>();
	const edge_keys = new Set<string>();
	if (!selected_node_id) return { node_ids, edge_keys };

	const selected = node_map.get(selected_node_id);
	if (!selected) return { node_ids, edge_keys };

	const visited_upstream = new Set<string>();
	const visited_downstream = new Set<string>();

	const visit_upstream = (node_id: string) => {
		if (visited_upstream.has(node_id)) return;
		visited_upstream.add(node_id);
		node_ids.add(node_id);
		for (const edge of by_target.get(node_id) ?? []) {
			edge_keys.add(make_edge_key(edge.source_id, edge.target_id));
			visit_upstream(edge.source_id);
		}
	};

	const visit_downstream = (node_id: string) => {
		if (visited_downstream.has(node_id)) return;
		visited_downstream.add(node_id);
		node_ids.add(node_id);
		for (const edge of by_source.get(node_id) ?? []) {
			edge_keys.add(make_edge_key(edge.source_id, edge.target_id));
			visit_downstream(edge.target_id);
		}
	};

	switch (selected.node.kind) {
		case "user_prompt":
		case "assistant_turn":
			visit_downstream(selected_node_id);
			break;
		case "search_query":
			visit_upstream(selected_node_id);
			visit_downstream(selected_node_id);
			break;
		default:
			visit_upstream(selected_node_id);
			break;
	}

	return { node_ids, edge_keys };
}

function make_edge_key(source_id: string, target_id: string): string {
	return `${source_id}->${target_id}`;
}

function route_edge(
	source: SessionGraphLayoutNode,
	target: SessionGraphLayoutNode,
): Array<[number, number]> {
	const sy = source.y + NODE_H / 2;
	const ty = target.y + NODE_H / 2;
	const source_right_x = source.x + NODE_W;
	const source_left_x = source.x;
	const target_left_x = target.x;
	const source_left_lane_x = get_left_gap_lane_x(source, target);
	const source_right_lane_x = get_right_gap_lane_x(source, target);
	const target_left_lane_x = get_left_gap_lane_x(target, source);

	if (target.depth <= source.depth) {
		return [
			[source_left_x, sy],
			[source_left_lane_x, sy],
			[source_left_lane_x, ty],
			[target_left_x, ty],
		];
	}

	if (target.depth === source.depth + 1) {
		if (Math.abs(sy - ty) < 2) {
			return [
				[source_right_x, sy],
				[target_left_x, ty],
			];
		}
		return [
			[source_right_x, sy],
			[source_right_lane_x, sy],
			[source_right_lane_x, ty],
			[target_left_x, ty],
		];
	}

	const bridge_y = get_intercolumn_bridge_y(source, target);
	return [
		[source_right_x, sy],
		[source_right_lane_x, sy],
		[source_right_lane_x, bridge_y],
		[target_left_lane_x, bridge_y],
		[target_left_lane_x, ty],
		[target_left_x, ty],
	];
}

function get_right_gap_lane_x(
	node: SessionGraphLayoutNode,
	other: SessionGraphLayoutNode,
): number {
	const fraction = get_gap_lane_fraction(node, other);
	return (
		node.x +
		NODE_W +
		EDGE_LANE_INSET +
		(COL_GAP - EDGE_LANE_INSET * 2) * fraction
	);
}

function get_left_gap_lane_x(
	node: SessionGraphLayoutNode,
	other: SessionGraphLayoutNode,
): number {
	const fraction = get_gap_lane_fraction(node, other);
	return (
		node.x -
		COL_GAP +
		EDGE_LANE_INSET +
		(COL_GAP - EDGE_LANE_INSET * 2) * fraction
	);
}

function get_gap_lane_fraction(
	source: SessionGraphLayoutNode,
	target: SessionGraphLayoutNode,
): number {
	const row_delta = target.row - source.row;
	const base_fraction =
		row_delta < -0.25 ? 0.28 : row_delta > 0.25 ? 0.72 : 0.5;
	const lane_jitter =
		get_edge_hash_bucket(source.id, target.id) === 0
			? -0.06
			: get_edge_hash_bucket(source.id, target.id) === 2
				? 0.06
				: 0;
	return clamp_number(base_fraction + lane_jitter, 0.18, 0.82);
}

function get_intercolumn_bridge_y(
	source: SessionGraphLayoutNode,
	target: SessionGraphLayoutNode,
): number {
	const source_center_y = source.y + NODE_H / 2;
	const target_center_y = target.y + NODE_H / 2;
	const base_above_band_y = Math.min(source.y, target.y) - ROW_GAP / 2;
	const base_below_band_y = Math.max(source.y, target.y) + NODE_H + ROW_GAP / 2;
	const rail_level = get_edge_hash_bucket(source.id, target.id) % 2;
	const above_band_y = base_above_band_y - rail_level * BRIDGE_RAIL_STEP;
	const below_band_y = base_below_band_y + rail_level * BRIDGE_RAIL_STEP;

	if (source.row === target.row) {
		return get_edge_hash_bucket(source.id, target.id) % 2 === 0
			? above_band_y
			: below_band_y;
	}

	const above_distance =
		Math.abs(source_center_y - above_band_y) +
		Math.abs(target_center_y - above_band_y);
	const below_distance =
		Math.abs(source_center_y - below_band_y) +
		Math.abs(target_center_y - below_band_y);

	return above_distance <= below_distance ? above_band_y : below_band_y;
}

function get_edge_hash_bucket(source_id: string, target_id: string): number {
	const key = `${source_id}->${target_id}`;
	let hash = 0;
	for (let index = 0; index < key.length; index++) {
		hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
	}
	return hash % 3;
}

function clamp_number(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export const SESSION_GRAPH_LAYOUT_NODE_WIDTH = NODE_W;
export const SESSION_GRAPH_LAYOUT_NODE_HEIGHT = NODE_H;
