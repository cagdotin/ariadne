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

	assign_artifact_rows(tree, row_by_node, next_leaf_row.value);

	const selected_path = compute_selected_path(
		selected_node_id,
		node_map,
		tree.artifact_edges,
	);
	const positions = new Map<string, { x: number; y: number }>();
	const artifact_depth = get_artifact_sink_depth(tree.nodes);

	const nodes = [...tree.nodes]
		.sort((left, right) => {
			const left_row = row_by_node.get(left.id) ?? 0;
			const right_row = row_by_node.get(right.id) ?? 0;
			if (left_row !== right_row) return left_row - right_row;
			const left_depth = is_artifact_node(left) ? artifact_depth : left.depth;
			const right_depth = is_artifact_node(right) ? artifact_depth : right.depth;
			if (left_depth !== right_depth) return left_depth - right_depth;
			return left.id.localeCompare(right.id);
		})
		.map((node) => {
			const row = row_by_node.get(node.id) ?? 0;
			const depth = is_artifact_node(node) ? artifact_depth : node.depth;
			const x = PAD + depth * (NODE_W + COL_GAP);
			const y = PAD + row * (NODE_H + ROW_GAP);
			positions.set(node.id, { x, y });

			return {
				id: node.id,
				label: node.node.label,
				kind: node.node.kind,
				role: node.role,
				parent_id: node.parent_id,
				depth,
				row,
				x,
				y,
				is_selected: node.id === selected_node_id,
				is_on_selected_path: selected_path.node_ids.has(node.id),
			};
		});

	const display_edges = [...tree.edges, ...tree.artifact_edges];
	const edges = display_edges.map((edge) => {
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

	const structural_child_ids = node.child_ids.filter((child_id) => {
		const child = node_map.get(child_id);
		return child ? !is_artifact_node(child) : false;
	});

	if (structural_child_ids.length === 0) {
		const row = next_leaf_row.value;
		row_by_node.set(node_id, row);
		next_leaf_row.value += 1;
		return row;
	}

	const child_rows = structural_child_ids.map((child_id) =>
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
	artifact_edges: SessionGraphTreeEdge[],
): {
	node_ids: Set<string>;
	edge_keys: Set<string>;
} {
	const node_ids = new Set<string>();
	const edge_keys = new Set<string>();

	if (!selected_node_id) {
		return { node_ids, edge_keys };
	}

	const selected_node = node_map.get(selected_node_id) ?? null;
	if (!selected_node) {
		return { node_ids, edge_keys };
	}

	const trace_to_root = (start_id: string) => {
		let cursor = node_map.get(start_id) ?? null;
		while (cursor) {
			node_ids.add(cursor.id);
			if (cursor.parent_id) {
				edge_keys.add(make_edge_key(cursor.parent_id, cursor.id));
			}
			cursor = cursor.parent_id ? (node_map.get(cursor.parent_id) ?? null) : null;
		}
	};

	node_ids.add(selected_node_id);
	if (is_artifact_node(selected_node)) {
		const incoming_artifact_edges = artifact_edges.filter(
			(edge) => edge.target_id === selected_node_id,
		);
		if (incoming_artifact_edges.length > 0) {
			for (const edge of incoming_artifact_edges) {
				edge_keys.add(make_edge_key(edge.source_id, edge.target_id));
				trace_to_root(edge.source_id);
			}
			return { node_ids, edge_keys };
		}
	}

	trace_to_root(selected_node_id);
	return { node_ids, edge_keys };
}

function make_edge_key(source_id: string, target_id: string): string {
	return `${source_id}->${target_id}`;
}

// ── Edge routing ────────────────────────────────────────────────────────────

function assign_artifact_rows(
	tree: SessionGraphTree,
	row_by_node: Map<string, number>,
	fallback_row: number,
): void {
	const artifact_nodes = tree.nodes.filter((node) => is_artifact_node(node));
	const sorted_artifacts = artifact_nodes
		.map((node) => ({
			node,
			anchor: get_artifact_anchor_row(node.id, tree.artifact_edges, row_by_node),
		}))
		.sort((left, right) => {
			if (left.anchor !== right.anchor) return left.anchor - right.anchor;
			const left_parent_row = left.node.parent_id
				? (row_by_node.get(left.node.parent_id) ?? fallback_row)
				: fallback_row;
			const right_parent_row = right.node.parent_id
				? (row_by_node.get(right.node.parent_id) ?? fallback_row)
				: fallback_row;
			if (left_parent_row !== right_parent_row) {
				return left_parent_row - right_parent_row;
			}
			return left.node.id.localeCompare(right.node.id);
		});

	let previous_row = Number.NEGATIVE_INFINITY;
	for (const { node, anchor } of sorted_artifacts) {
		const row = Math.max(anchor, previous_row + 1);
		row_by_node.set(node.id, row);
		previous_row = row;
	}
}

function get_artifact_anchor_row(
	node_id: string,
	artifact_edges: SessionGraphTreeEdge[],
	row_by_node: Map<string, number>,
): number {
	const source_rows = artifact_edges
		.filter((edge) => edge.target_id === node_id)
		.map((edge) => row_by_node.get(edge.source_id))
		.filter((row): row is number => typeof row === "number")
		.sort((left, right) => left - right);

	if (source_rows.length === 0) return 0;
	const middle = Math.floor(source_rows.length / 2);
	if (source_rows.length % 2 === 1) return source_rows[middle] ?? 0;
	return ((source_rows[middle - 1] ?? 0) + (source_rows[middle] ?? 0)) / 2;
}

function get_artifact_sink_depth(nodes: SessionGraphTreeNode[]): number {
	const non_artifact_depths = nodes
		.filter((node) => !is_artifact_node(node))
		.map((node) => node.depth);
	if (non_artifact_depths.length === 0) return 0;
	return Math.max(...non_artifact_depths) + 1;
}

function is_artifact_node(node: SessionGraphTreeNode): boolean {
	return (
		node.node.kind === "source_file" ||
		node.node.kind === "doc_file" ||
		node.node.kind === "agents_doc"
	);
}

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
