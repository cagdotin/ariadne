/**
 * Graph layout engine for Exploration Graph mode.
 *
 * Produces a vertical tree layout with horizontal branches:
 *
 * - **Turn selection**: turn at top-left, vertical trunk going down,
 *   each tool branches right on its own row, artifacts further right.
 *
 * - **File selection**: multiple turn→tool→file paths stack vertically,
 *   converging on the focal file on the right.
 *
 * Edges are orthogonal (vertical trunk + horizontal branches).
 * No DOM, no React, fully testable.
 */

import type {
	InsightEdge,
	InsightNode,
	InsightRole,
	InsightSubgraph,
} from "./exploration-insight-graph-view-model";

const turn_focal_kinds = new Set(["user_prompt", "assistant_turn"]);
const tool_kinds = new Set(["tool_call", "search_query"]);
const artifact_kinds = new Set([
	"source_file",
	"doc_file",
	"doc_section",
	"directory",
]);

// ── Types ───────────────────────────────────────────────────────────────────

export interface LayoutNode {
	id: string;
	label: string;
	kind: string;
	role: InsightRole;
	is_focal: boolean;
	column: number;
	row: number;
	x: number;
	y: number;
}

export interface LayoutEdge {
	source_id: string;
	target_id: string;
	kind: string;
	role: InsightRole;
	/** Edge segments: array of [x,y] waypoints for orthogonal routing */
	points: Array<[number, number]>;
}

export interface GraphLayout {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	width: number;
	height: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const COL_GAP = 48;
const ROW_GAP = 12;
const NODE_W = 180;
const NODE_H = 34;
const PAD = 24;

// ── Main function ───────────────────────────────────────────────────────────

export function compute_graph_layout(insight: InsightSubgraph): GraphLayout {
	if (insight.nodes.length === 0) {
		return { nodes: [], edges: [], width: 0, height: 0 };
	}

	// Build adjacency from insight edges
	const children = new Map<string, InsightEdge[]>();
	const parents = new Map<string, InsightEdge[]>();
	for (const e of insight.edges) {
		if (!children.has(e.source_id)) children.set(e.source_id, []);
		children.get(e.source_id)?.push(e);
		if (!parents.has(e.target_id)) parents.set(e.target_id, []);
		parents.get(e.target_id)?.push(e);
	}

	const node_map = new Map<string, InsightNode>();
	for (const n of insight.nodes) node_map.set(n.id, n);

	// Assign topological depth (column) via longest-path from roots,
	// then normalize turn-centric layouts so the selected turn stays leftmost.
	const depth = assign_depth(insight.nodes, insight.edges, children);
	const focal_node = insight.focal_node_id
		? (node_map.get(insight.focal_node_id) ?? null)
		: null;
	if (focal_node && turn_focal_kinds.has(focal_node.node.kind)) {
		normalize_turn_focal_depth(depth, insight.nodes, focal_node.id);
	}

	// Assign rows: walk depth-first from roots, allocating rows sequentially
	// so that parent→child chains stay visually together
	const row_counter = { value: 0 };
	const node_row = new Map<string, number>();
	const placed = new Set<string>();

	// Find roots (no parents in insight edges)
	const roots = insight.nodes.filter((n) => !parents.get(n.id)?.length);
	// Sort roots by depth (should be 0) then by id for stability
	roots.sort((a, b) => a.id.localeCompare(b.id));

	for (const root of roots) {
		place_subtree(root.id, depth, children, node_row, placed, row_counter);
	}
	// Place any remaining unconnected nodes
	for (const n of insight.nodes) {
		if (!placed.has(n.id)) {
			node_row.set(n.id, row_counter.value);
			placed.add(n.id);
			row_counter.value++;
		}
	}

	// Compute positions
	const layout_nodes: LayoutNode[] = [];
	const positions = new Map<string, { x: number; y: number }>();

	for (const inode of insight.nodes) {
		const col = depth.get(inode.id) ?? 0;
		const row = node_row.get(inode.id) ?? 0;
		const x = PAD + col * (NODE_W + COL_GAP);
		const y = PAD + row * (NODE_H + ROW_GAP);

		positions.set(inode.id, { x, y });
		layout_nodes.push({
			id: inode.id,
			label: inode.node.label,
			kind: inode.node.kind,
			role: inode.role,
			is_focal: inode.id === insight.focal_node_id,
			column: col,
			row,
			x,
			y,
		});
	}

	// Compute edges with orthogonal routing
	const layout_edges: LayoutEdge[] = [];
	for (const edge of insight.edges) {
		const src = positions.get(edge.source_id);
		const tgt = positions.get(edge.target_id);
		if (!src || !tgt) continue;

		const points = route_edge(src, tgt);
		layout_edges.push({
			source_id: edge.source_id,
			target_id: edge.target_id,
			kind: edge.kind,
			role: edge.role,
			points,
		});
	}

	// Dimensions
	const max_x = Math.max(...layout_nodes.map((n) => n.x + NODE_W), 0);
	const max_y = Math.max(...layout_nodes.map((n) => n.y + NODE_H), 0);

	return {
		nodes: layout_nodes,
		edges: layout_edges,
		width: max_x + PAD,
		height: max_y + PAD,
	};
}

// ── Depth assignment (topological longest path) ─────────────────────────────

function assign_depth(
	nodes: InsightNode[],
	edges: InsightEdge[],
	children: Map<string, InsightEdge[]>,
): Map<string, number> {
	const depth = new Map<string, number>();
	for (const n of nodes) depth.set(n.id, 0);

	const in_deg = new Map<string, number>();
	for (const n of nodes) in_deg.set(n.id, 0);
	for (const e of edges) {
		if (in_deg.has(e.target_id)) {
			in_deg.set(e.target_id, (in_deg.get(e.target_id) ?? 0) + 1);
		}
	}

	const queue: string[] = [];
	for (const [id, d] of in_deg) {
		if (d === 0) queue.push(id);
	}

	const processed = new Set<string>();
	while (queue.length > 0) {
		const id = queue.shift();
		if (!id) break;
		if (processed.has(id)) continue;
		processed.add(id);

		const col = depth.get(id) ?? 0;
		const out = children.get(id) ?? [];
		for (const e of out) {
			const cur = depth.get(e.target_id) ?? 0;
			if (col + 1 > cur) depth.set(e.target_id, col + 1);
			in_deg.set(e.target_id, (in_deg.get(e.target_id) ?? 1) - 1);
			if (in_deg.get(e.target_id) === 0) queue.push(e.target_id);
		}
	}

	return depth;
}

function normalize_turn_focal_depth(
	depth: Map<string, number>,
	nodes: InsightNode[],
	focal_node_id: string,
): void {
	const focal_column = depth.get(focal_node_id) ?? 0;
	for (const node of nodes) {
		const current_column = depth.get(node.id) ?? 0;
		const normalized_column = Math.max(0, current_column - focal_column);

		if (turn_focal_kinds.has(node.node.kind)) {
			depth.set(node.id, 0);
			continue;
		}

		if (tool_kinds.has(node.node.kind)) {
			depth.set(node.id, Math.max(1, normalized_column));
			continue;
		}

		if (artifact_kinds.has(node.node.kind)) {
			depth.set(node.id, Math.max(2, normalized_column));
			continue;
		}

		depth.set(node.id, normalized_column);
	}
}

// ── Row assignment (DFS subtree placement) ──────────────────────────────────

function place_subtree(
	id: string,
	depth: Map<string, number>,
	children: Map<string, InsightEdge[]>,
	node_row: Map<string, number>,
	placed: Set<string>,
	row_counter: { value: number },
): void {
	if (placed.has(id)) return;
	placed.add(id);
	node_row.set(id, row_counter.value);
	row_counter.value++;

	// Get children sorted by their depth then id for stability
	const child_edges = children.get(id) ?? [];
	const sorted_children = [...child_edges].sort((a, b) => {
		const da = depth.get(a.target_id) ?? 0;
		const db = depth.get(b.target_id) ?? 0;
		if (da !== db) return da - db;
		return a.target_id.localeCompare(b.target_id);
	});

	for (const e of sorted_children) {
		place_subtree(e.target_id, depth, children, node_row, placed, row_counter);
	}
}

// ── Edge routing (orthogonal) ───────────────────────────────────────────────

function route_edge(
	src: { x: number; y: number },
	tgt: { x: number; y: number },
): Array<[number, number]> {
	const sx = src.x + NODE_W;
	const sy = src.y + NODE_H / 2;
	const tx = tgt.x;
	const ty = tgt.y + NODE_H / 2;

	if (Math.abs(sy - ty) < 2) {
		// Same row — straight horizontal
		return [
			[sx, sy],
			[tx, ty],
		];
	}

	// Different rows — orthogonal routing:
	// go right from source to midpoint, then vertical, then right to target
	const mid_x = sx + COL_GAP / 2;
	return [
		[sx, sy],
		[mid_x, sy],
		[mid_x, ty],
		[tx, ty],
	];
}

// ── Exported constants for rendering ────────────────────────────────────────

export const LAYOUT_NODE_WIDTH = NODE_W;
export const LAYOUT_NODE_HEIGHT = NODE_H;
