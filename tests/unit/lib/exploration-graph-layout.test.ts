import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_insight_subgraph,
} from "../../../src/lib/exploration-insight-graph-view-model";
import {
	compute_graph_layout,
	type LayoutEdge,
	type LayoutNode,
} from "../../../src/lib/exploration-graph-layout";

// ── Fixtures ────────────────────────────────────────────────────────────────

function make_node(
	id: string,
	kind: GraphNode["kind"],
	availability: GraphNode["availability"] = "available_observed",
	metadata?: Record<string, unknown>,
): GraphNode {
	return {
		id,
		kind,
		label: id,
		availability,
		confidence: "high",
		evidence: [],
		metadata,
	};
}

function make_edge(
	source_id: string,
	target_id: string,
	kind: GraphEdge["kind"],
	availability: GraphEdge["availability"] = "available_observed",
): GraphEdge {
	return {
		source_id,
		target_id,
		kind,
		availability,
		confidence: "high",
		evidence: [],
		label: null,
	};
}

function make_graph(
	nodes: GraphNode[],
	edges: GraphEdge[],
): SessionGraphPayload {
	return {
		session_id: "s1",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-13T00:00:00Z",
	};
}

function make_multi_turn_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session", "session"),
			make_node("framing", "session_framing"),
			make_node("claude_md", "instruction_source", "available_ambient"),
			make_node("user_0", "user_prompt", "available_observed", { turn_index: 0, text: "Fix the bug" }),
			make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
			make_node("search_0", "search_query", "available_observed", { turn_index: 0, tool_index: 0 }),
			make_node("tool_read_0", "tool_call", "available_observed", { turn_index: 0, tool_index: 1 }),
			make_node("tool_read_doc", "tool_call", "available_observed", { turn_index: 0, tool_index: 2 }),
			make_node("doc_readme", "doc_file", "available_observed"),
			make_node("file_a", "source_file", "available_observed"),
			make_node("user_1", "user_prompt", "available_observed", { turn_index: 1, text: "Now edit it" }),
			make_node("turn_1", "assistant_turn", "available_observed", { turn_index: 1 }),
			make_node("tool_edit_1", "tool_call", "available_observed", { turn_index: 1, tool_index: 0 }),
			make_node("file_b", "source_file", "available_observed"),
			make_node("file_c", "source_file", "available_observed"),
		],
		[
			make_edge("session", "framing", "framed_by"),
			make_edge("framing", "claude_md", "constrained_by"),
			make_edge("session", "user_0", "prompted"),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_doc", "invoked_tool"),
			make_edge("tool_read_0", "file_a", "read"),
			make_edge("tool_read_doc", "doc_readme", "read"),
			make_edge("session", "user_1", "prompted"),
			make_edge("user_1", "turn_1", "prompted"),
			make_edge("turn_1", "tool_edit_1", "invoked_tool"),
			make_edge("tool_edit_1", "file_b", "edited"),
			make_edge("tool_edit_1", "file_a", "read"),
			make_edge("file_b", "file_a", "imports"),
			make_edge("doc_readme", "file_b", "linked_to"),
			make_edge("claude_md", "file_b", "influenced_by"),
		],
	);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("compute_graph_layout", () => {
	describe("empty/null subgraph", () => {
		it("returns an empty layout for empty insight subgraph", () => {
			const insight = compute_insight_subgraph(null, make_graph([], []));
			const layout = compute_graph_layout(insight);

			expect(layout.nodes).toHaveLength(0);
			expect(layout.edges).toHaveLength(0);
			expect(layout.width).toBe(0);
			expect(layout.height).toBe(0);
		});
	});

	describe("selected artifact layout", () => {
		it("places focal node in a later column than upstream nodes", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			const focal = layout.nodes.find((n) => n.id === "file_b");
			expect(focal).toBeDefined();

			const upstream = layout.nodes.filter(
				(n) => n.role === "primary_path" && n.id !== "file_b",
			);
			for (const u of upstream) {
				expect(u.column).toBeLessThanOrEqual(focal!.column);
			}
		});

		it("places upstream turns in earlier columns", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			const focal = layout.nodes.find((n) => n.id === "file_b")!;
			const turn_1 = layout.nodes.find((n) => n.id === "turn_1");

			if (turn_1) {
				expect(turn_1.column).toBeLessThan(focal.column);
			}
		});

		it("produces x/y coordinates for all nodes", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			for (const node of layout.nodes) {
				expect(typeof node.x).toBe("number");
				expect(typeof node.y).toBe("number");
				expect(node.x).toBeGreaterThanOrEqual(0);
				expect(node.y).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe("selected turn layout", () => {
		it("places the turn as the leftmost node", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("turn_0", graph);
			const layout = compute_graph_layout(insight);

			const turn_node = layout.nodes.find((n) => n.id === "turn_0")!;
			const min_col = Math.min(...layout.nodes.map((n) => n.column));
			expect(turn_node.column).toBe(min_col);
		});

		it("places tools in a column after the turn", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("turn_0", graph);
			const layout = compute_graph_layout(insight);

			const turn_node = layout.nodes.find((n) => n.id === "turn_0")!;
			const search = layout.nodes.find((n) => n.id === "search_0");
			const tool_read = layout.nodes.find((n) => n.id === "tool_read_0");

			if (search) expect(search.column).toBeGreaterThan(turn_node.column);
			if (tool_read) expect(tool_read.column).toBeGreaterThan(turn_node.column);
		});

		it("places artifacts after tools", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("turn_0", graph);
			const layout = compute_graph_layout(insight);

			const tool_read = layout.nodes.find((n) => n.id === "tool_read_0");
			const file_a = layout.nodes.find((n) => n.id === "file_a");

			if (tool_read && file_a) {
				expect(file_a.column).toBeGreaterThan(tool_read.column);
			}
		});

		it("each tool gets its own row", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("turn_0", graph);
			const layout = compute_graph_layout(insight);

			const search = layout.nodes.find((n) => n.id === "search_0");
			const tool_read = layout.nodes.find((n) => n.id === "tool_read_0");
			const tool_doc = layout.nodes.find((n) => n.id === "tool_read_doc");

			const rows = [search?.row, tool_read?.row, tool_doc?.row].filter(
				(r) => r !== undefined,
			);
			// All rows should be unique
			expect(new Set(rows).size).toBe(rows.length);
		});
	});

	describe("edge routing", () => {
		it("produces edges with waypoint arrays", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			expect(layout.edges.length).toBeGreaterThan(0);
			for (const edge of layout.edges) {
				expect(edge.points.length).toBeGreaterThanOrEqual(2);
				expect(edge.role).toBeDefined();
				for (const [x, y] of edge.points) {
					expect(typeof x).toBe("number");
					expect(typeof y).toBe("number");
				}
			}
		});

		it("orthogonal edges have 2 or 4 points", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("turn_0", graph);
			const layout = compute_graph_layout(insight);

			for (const edge of layout.edges) {
				// 2 = horizontal, 4 = orthogonal L-shaped
				expect([2, 4]).toContain(edge.points.length);
			}
		});
	});

	describe("determinism", () => {
		it("produces the same layout for the same input", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const l1 = compute_graph_layout(insight);
			const l2 = compute_graph_layout(insight);

			expect(l1.nodes.length).toBe(l2.nodes.length);
			for (let i = 0; i < l1.nodes.length; i++) {
				expect(l1.nodes[i].x).toBe(l2.nodes[i].x);
				expect(l1.nodes[i].y).toBe(l2.nodes[i].y);
			}
		});
	});

	describe("layout dimensions", () => {
		it("returns positive width and height when there are nodes", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			expect(layout.width).toBeGreaterThan(0);
			expect(layout.height).toBeGreaterThan(0);
		});

		it("nodes fit within the declared dimensions", () => {
			const graph = make_multi_turn_graph();
			const insight = compute_insight_subgraph("file_b", graph);
			const layout = compute_graph_layout(insight);

			for (const node of layout.nodes) {
				expect(node.x).toBeLessThanOrEqual(layout.width);
				expect(node.y).toBeLessThanOrEqual(layout.height);
			}
		});
	});

	describe("single-node graph", () => {
		it("handles a node with no edges", () => {
			const graph = make_graph(
				[make_node("lonely_file", "source_file")],
				[],
			);
			const insight = compute_insight_subgraph("lonely_file", graph);
			const layout = compute_graph_layout(insight);

			expect(layout.nodes).toHaveLength(1);
			expect(layout.nodes[0].id).toBe("lonely_file");
			expect(layout.edges).toHaveLength(0);
		});
	});
});
