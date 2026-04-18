import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import { compute_insight_subgraph } from "../../../src/lib/exploration-insight-graph-view-model";

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

// ── Multi-turn graph fixture ────────────────────────────────────────────────

function make_multi_turn_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session", "session"),
			make_node("framing", "session_framing"),
			make_node("claude_md", "instruction_source", "available_ambient"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
				text: "Fix the bug",
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("search_0", "search_query", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("tool_read_doc", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 2,
			}),
			make_node("doc_readme", "doc_file", "available_observed"),
			make_node("file_a", "source_file", "available_observed"),
			make_node("user_1", "user_prompt", "available_observed", {
				turn_index: 1,
				text: "Now edit it",
			}),
			make_node("turn_1", "assistant_turn", "available_observed", {
				turn_index: 1,
			}),
			make_node("tool_edit_1", "tool_call", "available_observed", {
				turn_index: 1,
				tool_index: 0,
			}),
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
			// structural: file_b imports file_a
			make_edge("file_b", "file_a", "imports"),
			// structural: doc links to file_b
			make_edge("doc_readme", "file_b", "linked_to"),
			// claude_md influenced file_b
			make_edge("claude_md", "file_b", "influenced_by"),
		],
	);
}

function make_discovery_lineage_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session", "session"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
				text: "Find and inspect the file",
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("search_0", "search_query", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("file_a", "source_file", "available_observed"),
		],
		[
			make_edge("session", "user_0", "prompted"),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("search_0", "tool_read_0", "influenced_by", "derived_inferred"),
			make_edge("search_0", "file_a", "discovered", "derived_inferred"),
			make_edge("tool_read_0", "file_a", "read"),
		],
	);
}

// ── Tests: compute_insight_subgraph ─────────────────────────────────────────

describe("compute_insight_subgraph", () => {
	describe("with no selection", () => {
		it("returns an empty-state insight subgraph", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph(null, graph);

			expect(result.nodes).toHaveLength(0);
			expect(result.edges).toHaveLength(0);
			expect(result.focal_node_id).toBeNull();
		});
	});

	describe("selected file (artifact)", () => {
		it("includes the selected node as focal with primary_path role", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			expect(result.focal_node_id).toBe("file_b");
			const focal = result.nodes.find((n) => n.id === "file_b");
			expect(focal).toBeDefined();
			expect(focal!.role).toBe("primary_path");
		});

		it("traces upstream primary path through tool→turn", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			// file_b ← tool_edit_1 ← turn_1 should be primary path
			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("tool_edit_1")).toBe(true);
			expect(node_ids.has("turn_1")).toBe(true);

			const tool_edit_node = result.nodes.find((n) => n.id === "tool_edit_1");
			expect(tool_edit_node!.role).toBe("primary_path");
		});

		it("includes user_prompt for contributing turns", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("user_1")).toBe(true);
		});

		it("includes supporting contributors", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			// claude_md influenced file_b — should appear as supporting
			const claude_md = result.nodes.find((n) => n.id === "claude_md");
			expect(claude_md).toBeDefined();
			expect(claude_md!.role).toBe("supporting");
		});

		it("includes structural references when both endpoints are visible", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			// file_b imports file_a — structural reference
			const struct_edge = result.edges.find(
				(e) =>
					e.source_id === "file_b" &&
					e.target_id === "file_a" &&
					e.kind === "imports",
			);
			expect(struct_edge).toBeDefined();
			expect(struct_edge!.role).toBe("structural_ref");

			// file_a should be present as structural_ref node
			const file_a = result.nodes.find((n) => n.id === "file_a");
			expect(file_a).toBeDefined();
			expect(file_a!.role).toBe("structural_ref");
		});

		it("includes downstream effects from the selected node", () => {
			const graph = make_multi_turn_graph();
			// file_a has downstream: tool_edit_1 read it in the same turn that edited file_b
			const result = compute_insight_subgraph("file_a", graph);

			// file_a was read by tool_read_0 (turn_0) and tool_edit_1 (turn_1)
			// downstream: after being read, tool_edit_1 edited file_b
			const downstream_nodes = result.nodes.filter(
				(n) => n.role === "downstream",
			);
			// file_b should be downstream of file_a (read in turn_1 that also edited file_b)
			const file_b_downstream = downstream_nodes.find((n) => n.id === "file_b");
			expect(file_b_downstream).toBeDefined();
		});

		it("classifies edges with appropriate roles", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			// Primary path edges
			const primary_edges = result.edges.filter(
				(e) => e.role === "primary_path",
			);
			expect(primary_edges.length).toBeGreaterThan(0);

			// Structural ref edges
			const struct_edges = result.edges.filter(
				(e) => e.role === "structural_ref",
			);
			expect(struct_edges.length).toBeGreaterThan(0);
		});

		it("surfaces search-to-action lineage for selected artifacts", () => {
			const graph = make_discovery_lineage_graph();
			const result = compute_insight_subgraph("file_a", graph);

			const search_node = result.nodes.find((n) => n.id === "search_0");
			const influence_edge = result.edges.find(
				(e) =>
					e.source_id === "search_0" &&
					e.target_id === "tool_read_0" &&
					e.kind === "influenced_by",
			);
			const discovered_edge = result.edges.find(
				(e) =>
					e.source_id === "search_0" &&
					e.target_id === "file_a" &&
					e.kind === "discovered",
			);

			expect(search_node?.role).toBe("primary_path");
			expect(influence_edge?.role).toBe("primary_path");
			expect(discovered_edge?.role).toBe("supporting");
		});
	});

	describe("selected turn/prompt", () => {
		it("shows downstream path from selected turn", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("turn_0", graph);

			expect(result.focal_node_id).toBe("turn_0");

			// Should include downstream: search_0, tool_read_0, tool_read_doc, file_a, doc_readme
			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("search_0")).toBe(true);
			expect(node_ids.has("tool_read_0")).toBe(true);
			expect(node_ids.has("file_a")).toBe(true);
			expect(node_ids.has("doc_readme")).toBe(true);
		});

		it("includes user_prompt as upstream context", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("turn_0", graph);

			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("user_0")).toBe(true);
		});

		it("produces edges for selected turn (not 0 edges)", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("turn_0", graph);

			// Must have edges: turn→tool, tool→artifact
			expect(result.edges.length).toBeGreaterThan(0);

			const edge_keys = result.edges.map(
				(e) => `${e.source_id}->${e.target_id}`,
			);
			expect(edge_keys).toContain("turn_0->search_0");
			expect(edge_keys).toContain("turn_0->tool_read_0");
			expect(edge_keys).toContain("tool_read_0->file_a");
		});

		it("produces edges for selected user_prompt via assistant_turn", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("user_0", graph);

			// user_prompt selection should resolve to the assistant_turn's downstream
			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("user_0")).toBe(true);
			expect(node_ids.has("turn_0")).toBe(true);
			expect(node_ids.has("search_0")).toBe(true);
			expect(node_ids.has("file_a")).toBe(true);

			// Must have edges, not 0
			expect(result.edges.length).toBeGreaterThan(0);
		});

		it("uses influenced_by as the downstream spine when a turn contains discovery lineage", () => {
			const graph = make_discovery_lineage_graph();
			const result = compute_insight_subgraph("turn_0", graph);

			expect(
				result.edges.some(
					(e) =>
						e.source_id === "search_0" &&
						e.target_id === "tool_read_0" &&
						e.kind === "influenced_by" &&
						e.role === "primary_path",
				),
			).toBe(true);
			expect(
				result.edges.some(
					(e) =>
						e.source_id === "turn_0" &&
						e.target_id === "tool_read_0" &&
						e.kind === "invoked_tool" &&
						e.role === "primary_path",
				),
			).toBe(false);
		});
	});

	describe("selected tool/search", () => {
		it("shows upstream search context for an influenced tool selection", () => {
			const graph = make_discovery_lineage_graph();
			const result = compute_insight_subgraph("tool_read_0", graph);

			expect(
				result.edges.some(
					(e) =>
						e.source_id === "search_0" &&
						e.target_id === "tool_read_0" &&
						e.kind === "influenced_by" &&
						e.role === "primary_path",
				),
			).toBe(true);
			expect(
				result.edges.some(
					(e) =>
						e.source_id === "tool_read_0" &&
						e.target_id === "file_a" &&
						e.kind === "read" &&
						e.role === "primary_path",
				),
			).toBe(true);
		});
	});

	describe("selected instruction/framing node", () => {
		it("shows downstream influence", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("claude_md", graph);

			expect(result.focal_node_id).toBe("claude_md");
			const node_ids = new Set(result.nodes.map((n) => n.id));
			// claude_md → file_b via influenced_by
			expect(node_ids.has("file_b")).toBe(true);
		});
	});

	describe("suppression of unrelated nodes", () => {
		it("does not include session or session_framing in the insight graph", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("session")).toBe(false);
			expect(node_ids.has("framing")).toBe(false);
		});

		it("does not include nodes from unrelated turns for an artifact selection", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("file_b", graph);

			// file_b is only touched in turn_1; turn_0 tools/searches should not be primary
			const node_ids = new Set(result.nodes.map((n) => n.id));
			// search_0 is from turn_0 and unrelated to file_b's primary path
			expect(node_ids.has("search_0")).toBe(false);
		});
	});

	describe("temporal visibility", () => {
		it("restricts nodes to temporally visible set when provided", () => {
			const graph = make_multi_turn_graph();

			// Simulate built-so-far for turn_0: only turn_0 era nodes visible
			const temporally_visible = new Set([
				"session",
				"framing",
				"claude_md",
				"user_0",
				"turn_0",
				"search_0",
				"tool_read_0",
				"tool_read_doc",
				"doc_readme",
				"file_a",
			]);

			const result = compute_insight_subgraph("file_a", graph, {
				temporally_visible_node_ids: temporally_visible,
			});

			// file_b is not temporally visible, so no structural refs to it
			const node_ids = new Set(result.nodes.map((n) => n.id));
			expect(node_ids.has("file_b")).toBe(false);
			// But file_a's primary path should still be present
			expect(node_ids.has("tool_read_0")).toBe(true);
		});

		it("excludes structural references when one endpoint is not temporally visible", () => {
			const graph = make_multi_turn_graph();

			// file_a is visible but file_b is not
			const temporally_visible = new Set([
				"session",
				"framing",
				"claude_md",
				"user_0",
				"turn_0",
				"search_0",
				"tool_read_0",
				"tool_read_doc",
				"doc_readme",
				"file_a",
			]);

			const result = compute_insight_subgraph("file_a", graph, {
				temporally_visible_node_ids: temporally_visible,
			});

			// imports edge from file_b→file_a should not appear
			const imports_edge = result.edges.find((e) => e.kind === "imports");
			expect(imports_edge).toBeUndefined();
		});
	});

	describe("edge cases", () => {
		it("returns empty subgraph for nonexistent node", () => {
			const graph = make_multi_turn_graph();
			const result = compute_insight_subgraph("nonexistent", graph);

			expect(result.nodes).toHaveLength(0);
			expect(result.edges).toHaveLength(0);
			expect(result.focal_node_id).toBeNull();
		});

		it("handles a node with no edges", () => {
			const graph = make_graph([make_node("lonely_file", "source_file")], []);
			const result = compute_insight_subgraph("lonely_file", graph);

			expect(result.nodes).toHaveLength(1);
			expect(result.nodes[0].id).toBe("lonely_file");
			expect(result.edges).toHaveLength(0);
		});
	});
});
