import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_arrival_contributors,
	compute_temporally_visible_nodes,
	get_node_temporal_order,
	get_selection_cutoff,
	type TemporalOrder,
} from "../../../src/lib/exploration-temporal-view-model";

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

/**
 * Multi-turn graph:
 *   Turn 0: search, read file_a, read doc_a
 *   Turn 1: read file_b, edit file_a
 *   Turn 2: read file_c, write file_d
 *
 * file_a has adjacent_unexplored → file_adjacent
 */
function make_multi_turn_graph(): SessionGraphPayload {
	const nodes: GraphNode[] = [
		make_node("session", "session"),
		make_node("framing", "session_framing"),
		make_node("claude_md", "instruction_source", "available_ambient"),

		// Turn 0
		make_node("user_0", "user_prompt", "available_observed", {
			turn_index: 0,
			text: "Fix the login bug",
		}),
		make_node("turn_0", "assistant_turn", "available_observed", {
			turn_index: 0,
		}),
		make_node("search_0", "search_query", "available_observed", {
			turn_index: 0,
			tool_index: 0,
			tool_name: "Grep",
		}),
		make_node("tool_read_a_0", "tool_call", "available_observed", {
			turn_index: 0,
			tool_index: 1,
			tool_name: "Read",
			file_path: "src/auth.ts",
		}),
		make_node("tool_read_doc_0", "tool_call", "available_observed", {
			turn_index: 0,
			tool_index: 2,
			tool_name: "Read",
			file_path: "docs/auth.md",
		}),

		// Turn 1
		make_node("user_1", "user_prompt", "available_observed", {
			turn_index: 1,
			text: "Now fix the session handler",
		}),
		make_node("turn_1", "assistant_turn", "available_observed", {
			turn_index: 1,
		}),
		make_node("tool_read_b_1", "tool_call", "available_observed", {
			turn_index: 1,
			tool_index: 0,
			tool_name: "Read",
			file_path: "src/session.ts",
		}),
		make_node("tool_edit_a_1", "tool_call", "available_observed", {
			turn_index: 1,
			tool_index: 1,
			tool_name: "Edit",
			file_path: "src/auth.ts",
		}),

		// Turn 2
		make_node("user_2", "user_prompt", "available_observed", {
			turn_index: 2,
			text: "Add the test file",
		}),
		make_node("turn_2", "assistant_turn", "available_observed", {
			turn_index: 2,
		}),
		make_node("tool_read_c_2", "tool_call", "available_observed", {
			turn_index: 2,
			tool_index: 0,
			tool_name: "Read",
			file_path: "src/utils.ts",
		}),
		make_node("tool_write_d_2", "tool_call", "available_observed", {
			turn_index: 2,
			tool_index: 1,
			tool_name: "Write",
			file_path: "tests/auth.test.ts",
		}),

		// Artifact nodes
		make_node("file_a", "source_file", "available_observed", { path: "src/auth.ts" }),
		make_node("file_b", "source_file", "available_observed", { path: "src/session.ts" }),
		make_node("file_c", "source_file", "available_observed", { path: "src/utils.ts" }),
		make_node("file_d", "source_file", "available_observed", { path: "tests/auth.test.ts" }),
		make_node("doc_a", "doc_file", "available_observed", { path: "docs/auth.md" }),
		make_node("file_adjacent", "source_file", "available_ambient", { path: "src/helpers.ts" }),
	];

	const edges: GraphEdge[] = [
		make_edge("session", "framing", "framed_by"),
		make_edge("framing", "claude_md", "constrained_by"),
		make_edge("session", "user_0", "prompted"),

		// Turn 0 tools
		make_edge("turn_0", "search_0", "invoked_tool"),
		make_edge("turn_0", "tool_read_a_0", "invoked_tool"),
		make_edge("turn_0", "tool_read_doc_0", "invoked_tool"),
		make_edge("tool_read_a_0", "file_a", "read"),
		make_edge("tool_read_doc_0", "doc_a", "read"),

		// Turn 1 tools
		make_edge("turn_1", "tool_read_b_1", "invoked_tool"),
		make_edge("turn_1", "tool_edit_a_1", "invoked_tool"),
		make_edge("tool_read_b_1", "file_b", "read"),
		make_edge("tool_edit_a_1", "file_a", "edited"),

		// Turn 2 tools
		make_edge("turn_2", "tool_read_c_2", "invoked_tool"),
		make_edge("turn_2", "tool_write_d_2", "invoked_tool"),
		make_edge("tool_read_c_2", "file_c", "read"),
		make_edge("tool_write_d_2", "file_d", "wrote"),

		// Adjacent unexplored
		make_edge("file_a", "file_adjacent", "adjacent_unexplored"),

		// Doc influence
		make_edge("doc_a", "file_a", "influenced_by"),
	];

	return make_graph(nodes, edges);
}

// ── get_node_temporal_order ─────────────────────────────────────────────────

describe("get_node_temporal_order", () => {
	it("assigns order to user_prompt from turn_index", () => {
		const graph = make_multi_turn_graph();
		const order = get_node_temporal_order("user_0", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(0);
	});

	it("assigns order to assistant_turn from turn_index", () => {
		const graph = make_multi_turn_graph();
		const order = get_node_temporal_order("turn_1", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(1);
	});

	it("assigns order to tool_call from turn_index and tool_index", () => {
		const graph = make_multi_turn_graph();
		const order = get_node_temporal_order("tool_read_b_1", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(1);
		expect(order!.tool_index).toBe(0);
	});

	it("assigns order to search_query from turn_index and tool_index", () => {
		const graph = make_multi_turn_graph();
		const order = get_node_temporal_order("search_0", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(0);
		expect(order!.tool_index).toBe(0);
	});

	it("derives first_seen for artifact from earliest incoming tool edge", () => {
		const graph = make_multi_turn_graph();
		// file_a was first read in turn 0
		const order = get_node_temporal_order("file_a", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(0);
	});

	it("derives first_seen for artifact edited in a later turn from earliest interaction", () => {
		const graph = make_multi_turn_graph();
		// file_a was read in turn 0, edited in turn 1 — first seen should be turn 0
		const order = get_node_temporal_order("file_a", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(0);
	});

	it("derives first_seen for file only seen in turn 2", () => {
		const graph = make_multi_turn_graph();
		const order = get_node_temporal_order("file_c", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(2);
	});

	it("returns null for nodes with no temporal ordering (framing, session)", () => {
		const graph = make_multi_turn_graph();
		expect(get_node_temporal_order("session", graph)).toBeNull();
		expect(get_node_temporal_order("framing", graph)).toBeNull();
	});

	it("returns null for nonexistent node", () => {
		const graph = make_multi_turn_graph();
		expect(get_node_temporal_order("nonexistent", graph)).toBeNull();
	});

	it("handles ambient adjacent file with no direct tool edges", () => {
		const graph = make_multi_turn_graph();
		// file_adjacent has no read/edit/wrote edges — only adjacent_unexplored
		// its first-seen should derive from its explored anchor (file_a, turn 0)
		const order = get_node_temporal_order("file_adjacent", graph);
		expect(order).not.toBeNull();
		expect(order!.turn_index).toBe(0);
	});
});

// ── get_selection_cutoff ────────────────────────────────────────────────────

describe("get_selection_cutoff", () => {
	it("returns end-of-turn cutoff for a selected assistant_turn", () => {
		const graph = make_multi_turn_graph();
		const cutoff = get_selection_cutoff("turn_0", graph);
		expect(cutoff).not.toBeNull();
		expect(cutoff!.turn_index).toBe(0);
	});

	it("returns end-of-turn cutoff for a selected user_prompt", () => {
		const graph = make_multi_turn_graph();
		const cutoff = get_selection_cutoff("user_1", graph);
		expect(cutoff).not.toBeNull();
		expect(cutoff!.turn_index).toBe(1);
	});

	it("returns tool-level cutoff for a selected tool_call", () => {
		const graph = make_multi_turn_graph();
		const cutoff = get_selection_cutoff("tool_read_b_1", graph);
		expect(cutoff).not.toBeNull();
		expect(cutoff!.turn_index).toBe(1);
		expect(cutoff!.tool_index).toBe(0);
	});

	it("returns null for non-temporal nodes (artifacts, framing)", () => {
		const graph = make_multi_turn_graph();
		// Artifacts don't produce cutoffs — they produce arrival paths instead
		expect(get_selection_cutoff("file_a", graph)).toBeNull();
		expect(get_selection_cutoff("framing", graph)).toBeNull();
	});
});

// ── Temporal order comparison ───────────────────────────────────────────────

describe("TemporalOrder comparison", () => {
	it("orders by turn_index first", () => {
		const a: TemporalOrder = { turn_index: 0, tool_index: 5 };
		const b: TemporalOrder = { turn_index: 1, tool_index: 0 };
		// a should come before b
		expect(a.turn_index < b.turn_index).toBe(true);
	});

	it("orders by tool_index within the same turn", () => {
		const a: TemporalOrder = { turn_index: 1, tool_index: 0 };
		const b: TemporalOrder = { turn_index: 1, tool_index: 2 };
		expect(a.tool_index < b.tool_index).toBe(true);
	});
});

// ── compute_temporally_visible_nodes ────────────────────────────────────────

describe("compute_temporally_visible_nodes", () => {
	it("returns all node IDs when cutoff is null (full session view)", () => {
		const graph = make_multi_turn_graph();
		const visible = compute_temporally_visible_nodes(graph, null);

		// Should contain all nodes
		expect(visible.has("file_a")).toBe(true);
		expect(visible.has("file_b")).toBe(true);
		expect(visible.has("file_c")).toBe(true);
		expect(visible.has("file_d")).toBe(true);
		expect(visible.has("doc_a")).toBe(true);
		expect(visible.has("turn_0")).toBe(true);
		expect(visible.has("turn_2")).toBe(true);
	});

	it("excludes later artifacts when cutoff is at turn 0", () => {
		const graph = make_multi_turn_graph();
		const cutoff: TemporalOrder = { turn_index: 0, tool_index: Infinity };
		const visible = compute_temporally_visible_nodes(graph, cutoff);

		// Turn 0 explored: file_a, doc_a
		expect(visible.has("file_a")).toBe(true);
		expect(visible.has("doc_a")).toBe(true);

		// Turn 1+ artifacts should be excluded
		expect(visible.has("file_b")).toBe(false);
		expect(visible.has("file_c")).toBe(false);
		expect(visible.has("file_d")).toBe(false);

		// Turn 0 narrative nodes should be included
		expect(visible.has("turn_0")).toBe(true);
		expect(visible.has("user_0")).toBe(true);
		expect(visible.has("search_0")).toBe(true);

		// Turn 1+ narrative nodes should be excluded
		expect(visible.has("turn_1")).toBe(false);
		expect(visible.has("user_1")).toBe(false);
		expect(visible.has("turn_2")).toBe(false);
	});

	it("includes turn 0 and turn 1 artifacts when cutoff is at turn 1", () => {
		const graph = make_multi_turn_graph();
		const cutoff: TemporalOrder = { turn_index: 1, tool_index: Infinity };
		const visible = compute_temporally_visible_nodes(graph, cutoff);

		expect(visible.has("file_a")).toBe(true);
		expect(visible.has("file_b")).toBe(true);
		expect(visible.has("doc_a")).toBe(true);

		// Turn 2 artifacts should be excluded
		expect(visible.has("file_c")).toBe(false);
		expect(visible.has("file_d")).toBe(false);
	});

	it("always includes framing/session nodes regardless of cutoff", () => {
		const graph = make_multi_turn_graph();
		const cutoff: TemporalOrder = { turn_index: 0, tool_index: Infinity };
		const visible = compute_temporally_visible_nodes(graph, cutoff);

		expect(visible.has("session")).toBe(true);
		expect(visible.has("framing")).toBe(true);
		expect(visible.has("claude_md")).toBe(true);
	});

	it("gates adjacent unexplored nodes by their explored anchor visibility", () => {
		const graph = make_multi_turn_graph();
		// file_adjacent is adjacent to file_a which is first seen in turn 0
		const cutoff_0: TemporalOrder = { turn_index: 0, tool_index: Infinity };
		const visible_0 = compute_temporally_visible_nodes(graph, cutoff_0);
		// file_a is visible at turn 0, so file_adjacent should also be visible
		expect(visible_0.has("file_adjacent")).toBe(true);

		// But if we had a graph where the anchor wasn't visible, the adjacent should be hidden
		// (tested implicitly: file_adjacent derives its order from file_a)
	});

	it("respects tool-level cutoff within a turn", () => {
		const graph = make_multi_turn_graph();
		// Cut off at turn 1, tool_index 0 (only the read of file_b, not the edit of file_a)
		const cutoff: TemporalOrder = { turn_index: 1, tool_index: 0 };
		const visible = compute_temporally_visible_nodes(graph, cutoff);

		// tool_read_b_1 (tool_index=0) should be visible
		expect(visible.has("tool_read_b_1")).toBe(true);
		expect(visible.has("file_b")).toBe(true);

		// tool_edit_a_1 (tool_index=1) should be excluded
		expect(visible.has("tool_edit_a_1")).toBe(false);
	});
});

// ── compute_arrival_contributors ────────────────────────────────────────────

describe("compute_arrival_contributors", () => {
	it("returns contributing nodes for an edited file", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_a", graph);

		// file_a was read by tool_read_a_0 (turn 0), edited by tool_edit_a_1 (turn 1)
		// upstream: tool_read_a_0, turn_0, user_0, tool_edit_a_1, turn_1, user_1
		// also: doc_a influenced file_a
		expect(contributors.has("file_a")).toBe(true);
		expect(contributors.has("tool_read_a_0")).toBe(true);
		expect(contributors.has("turn_0")).toBe(true);
		expect(contributors.has("tool_edit_a_1")).toBe(true);
		expect(contributors.has("turn_1")).toBe(true);
		expect(contributors.has("doc_a")).toBe(true);
	});

	it("does not include unrelated later artifacts", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_a", graph);

		// file_c, file_d are unrelated to file_a's arrival
		expect(contributors.has("file_c")).toBe(false);
		expect(contributors.has("file_d")).toBe(false);
		expect(contributors.has("turn_2")).toBe(false);
	});

	it("returns contributing nodes for a file only read once", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_b", graph);

		expect(contributors.has("file_b")).toBe(true);
		expect(contributors.has("tool_read_b_1")).toBe(true);
		expect(contributors.has("turn_1")).toBe(true);

		// Not related to turn 0 or turn 2
		expect(contributors.has("turn_0")).toBe(false);
		expect(contributors.has("turn_2")).toBe(false);
	});

	it("returns contributing nodes for a written file", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_d", graph);

		expect(contributors.has("file_d")).toBe(true);
		expect(contributors.has("tool_write_d_2")).toBe(true);
		expect(contributors.has("turn_2")).toBe(true);
	});

	it("includes user_prompt nodes for contributing turns", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_b", graph);

		expect(contributors.has("user_1")).toBe(true);
	});

	it("returns empty set for nonexistent node", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("nonexistent", graph);
		expect(contributors.size).toBe(0);
	});

	it("includes search nodes that were part of the contributing turn", () => {
		const graph = make_multi_turn_graph();
		const contributors = compute_arrival_contributors("file_a", graph);

		// search_0 was invoked by turn_0, which also read file_a
		expect(contributors.has("search_0")).toBe(true);
	});
});
