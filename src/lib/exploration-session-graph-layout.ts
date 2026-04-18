import type {
	SessionGraphTree,
	SessionGraphTreeEdge,
	SessionGraphTreeNode,
	SessionGraphTreeNodeRole,
} from "./exploration-session-graph-view-model";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SessionGraphLayoutNode {
	id: string;
	label: string;
	kind: SessionGraphTreeNode["node"]["kind"];
	role: SessionGraphTreeNodeRole;
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
	kind: SessionGraphTreeEdge["kind"];
	role: SessionGraphTreeEdge["role"];
	points: Array<[number, number]>;
	is_on_selected_path: boolean;
}

export interface SessionGraphLayout {
	nodes: SessionGraphLayoutNode[];
	edges: SessionGraphLayoutEdge[];
	width: number;
	height: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const COL_GAP = 56;
const ROW_GAP = 16;
const NODE_W = 190;
const NODE_H = 38;
const PAD = 24;
const ROOT_GAP_ROWS = 1;

// ── Public API ─────────────────────────────────────────────────────────────

export function compute_session_graph_layout(
	tree: SessionGraphTree,
	selected_node_id: string | null,
): SessionGraphLayout {
	if (tree.nodes.length === 0) {
		return { nodes: [], edges: [], width: 0, height: 0 };
	}

	const node_map = new Map<string, SessionGraphTreeNode>();
	for (const node of tree.nodes) {
		node_map.set(node.id, node);
	}

	const row_by_node = new Map<string, number>();
	const next_leaf_row = { value: 0 };

	for (let index = 0; index < tree.roots.length; index++) {
		place_subtree(tree.roots[index], node_map, row_by_node, next_leaf_row);
		if (index < tree.roots.length - 1) {
			next_leaf_row.value += ROOT_GAP_ROWS;
		}
	}

	const selected_path = compute_selected_path(selected_node_id, node_map);
	const positions = new Map<string, { x: number; y: number }>();

	const nodes = [...tree.nodes]
		.sort((left, right) => {
			const left_row = row_by_node.get(left.id) ?? 0;
			const right_row = row_by_node.get(right.id) ?? 0;
			if (left_row !== right_row) return left_row - right_row;
			if (left.depth !== right.depth) return left.depth - right.depth;
			return left.id.localeCompare(right.id);
		})
		.map((node) => {
			const row = row_by_node.get(node.id) ?? 0;
			const x = PAD + node.depth * (NODE_W + COL_GAP);
			const y = PAD + row * (NODE_H + ROW_GAP);
			positions.set(node.id, { x, y });

			return {
				id: node.id,
				label: node.node.label,
				kind: node.node.kind,
				role: node.role,
				parent_id: node.parent_id,
				depth: node.depth,
				row,
				x,
				y,
				is_selected: node.id === selected_node_id,
				is_on_selected_path: selected_path.node_ids.has(node.id),
			};
		});

	const edges = tree.edges.map((edge) => {
		const source = positions.get(edge.source_id);
		const target = positions.get(edge.target_id);
		if (!source || !target) {
			throw new Error(
				`Missing layout position for edge ${edge.source_id} -> ${edge.target_id}`,
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
	};
}

// ── Tree placement ──────────────────────────────────────────────────────────

function place_subtree(
	node_id: string,
	node_map: Map<string, SessionGraphTreeNode>,
	row_by_node: Map<string, number>,
	next_leaf_row: { value: number },
): number {
	if (row_by_node.has(node_id)) {
		return row_by_node.get(node_id) ?? 0;
	}

	const node = node_map.get(node_id);
	if (!node) {
		throw new Error(`Missing projected node for layout: ${node_id}`);
	}

	if (node.child_ids.length === 0) {
		const row = next_leaf_row.value;
		row_by_node.set(node_id, row);
		next_leaf_row.value += 1;
		return row;
	}

	const child_rows = node.child_ids.map((child_id) =>
		place_subtree(child_id, node_map, row_by_node, next_leaf_row),
	);
	const first_row = child_rows[0] ?? next_leaf_row.value;
	const last_row = child_rows[child_rows.length - 1] ?? first_row;
	const row = (first_row + last_row) / 2;
	row_by_node.set(node_id, row);
	return row;
}

// ── Selected path ───────────────────────────────────────────────────────────

function compute_selected_path(
	selected_node_id: string | null,
	node_map: Map<string, SessionGraphTreeNode>,
): {
	node_ids: Set<string>;
	edge_keys: Set<string>;
} {
	const node_ids = new Set<string>();
	const edge_keys = new Set<string>();

	if (!selected_node_id) {
		return { node_ids, edge_keys };
	}

	let cursor = node_map.get(selected_node_id) ?? null;
	while (cursor) {
		node_ids.add(cursor.id);
		if (cursor.parent_id) {
			edge_keys.add(make_edge_key(cursor.parent_id, cursor.id));
		}
		cursor = cursor.parent_id ? (node_map.get(cursor.parent_id) ?? null) : null;
	}

	return { node_ids, edge_keys };
}

function make_edge_key(source_id: string, target_id: string): string {
	return `${source_id}->${target_id}`;
}

// ── Edge routing ────────────────────────────────────────────────────────────

function route_edge(
	source: { x: number; y: number },
	target: { x: number; y: number },
): Array<[number, number]> {
	const sx = source.x + NODE_W;
	const sy = source.y + NODE_H / 2;
	const tx = target.x;
	const ty = target.y + NODE_H / 2;

	if (Math.abs(sy - ty) < 2) {
		return [
			[sx, sy],
			[tx, ty],
		];
	}

	const mid_x = sx + COL_GAP / 2;
	return [
		[sx, sy],
		[mid_x, sy],
		[mid_x, ty],
		[tx, ty],
	];
}

// ── Exported dimensions ─────────────────────────────────────────────────────

export const SESSION_GRAPH_LAYOUT_NODE_WIDTH = NODE_W;
export const SESSION_GRAPH_LAYOUT_NODE_HEIGHT = NODE_H;
