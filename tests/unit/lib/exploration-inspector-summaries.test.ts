import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_arrival_paths,
	compute_node_summary,
	type ArrivalPath,
	type NodeSummary,
} from "../../../src/lib/exploration-inspector-summaries";

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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("compute_node_summary", () => {
	describe("for assistant_turn", () => {
		it("shows downstream action counts", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("search_0", "search_query"),
					make_node("tool_read", "tool_call", "available_observed", {
						tool_name: "Read",
					}),
					make_node("tool_edit", "tool_call", "available_observed", {
						tool_name: "Edit",
					}),
					make_node("file_a", "source_file"),
					make_node("doc_b", "doc_file"),
				],
				[
					make_edge("turn_0", "search_0", "invoked_tool"),
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("tool_read", "doc_b", "read"),
				],
			);

			const summary = compute_node_summary("turn_0", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("turn");
			expect(summary!.searches).toBe(1);
			expect(summary!.files_explored).toBeGreaterThanOrEqual(1);
			expect(summary!.edits).toBe(1);
		});
	});

	describe("for source_file", () => {
		it("shows upstream influences", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("tool_read", "tool_call", "available_observed", {
						tool_name: "Read",
					}),
					make_node("tool_edit", "tool_call", "available_observed", {
						tool_name: "Edit",
					}),
					make_node("file_a", "source_file"),
					make_node("doc_readme", "doc_file"),
				],
				[
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("doc_readme", "file_a", "linked_to"),
				],
			);

			const summary = compute_node_summary("file_a", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("file");
			expect(summary!.reads).toBeGreaterThanOrEqual(1);
			expect(summary!.edits).toBeGreaterThanOrEqual(1);
			expect(summary!.upstream_docs).toBeGreaterThanOrEqual(1);
		});
	});

	describe("for instruction_source", () => {
		it("shows downstream influence", () => {
			const graph = make_graph(
				[
					make_node("framing", "session_framing"),
					make_node("claude_md", "instruction_source", "available_ambient"),
					make_node("file_a", "source_file"),
					make_node("file_b", "source_file"),
				],
				[
					make_edge("framing", "claude_md", "constrained_by"),
					make_edge("claude_md", "file_a", "influenced_by"),
					make_edge("claude_md", "file_b", "influenced_by"),
				],
			);

			const summary = compute_node_summary("claude_md", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("instruction");
			expect(summary!.downstream_files).toBe(2);
		});
	});

	it("returns null for unknown node id", () => {
		const graph = make_graph([], []);
		expect(compute_node_summary("nonexistent", graph)).toBeNull();
	});
});

// ── Arrival paths ───────────────────────────────────────────────────────────

describe("compute_arrival_paths", () => {
	it("traces file back through tool → turn → user_prompt", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", {
					turn_index: 0,
					text: "Fix the bug",
				}),
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read", "tool_call", "available_observed", {
					tool_name: "Read",
				}),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
			],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(1);
		expect(paths[0].action).toBe("read");
		expect(paths[0].tool_node_id).toBe("tool_read");
		expect(paths[0].tool_label).toBe("tool_read");
		expect(paths[0].turn_index).toBe(0);
		expect(paths[0].user_message).toBe("Fix the bug");
	});

	it("returns multiple paths for a file read/edited in different turns", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", {
					turn_index: 0,
					text: "Read it",
				}),
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read_0", "tool_call", "available_observed", {
					tool_name: "Read",
				}),
				make_node("user_1", "user_prompt", "available_observed", {
					turn_index: 1,
					text: "Edit it",
				}),
				make_node("turn_1", "assistant_turn", "available_observed", {
					turn_index: 1,
				}),
				make_node("tool_edit_1", "tool_call", "available_observed", {
					tool_name: "Edit",
				}),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read_0", "invoked_tool"),
				make_edge("tool_read_0", "file_a", "read"),
				make_edge("turn_1", "tool_edit_1", "invoked_tool"),
				make_edge("tool_edit_1", "file_a", "edited"),
			],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(2);

		// First: read in turn 0
		expect(paths[0].turn_index).toBe(0);
		expect(paths[0].action).toBe("read");
		expect(paths[0].user_message).toBe("Read it");

		// Second: edited in turn 1
		expect(paths[1].turn_index).toBe(1);
		expect(paths[1].action).toBe("edited");
		expect(paths[1].user_message).toBe("Edit it");
	});

	it("returns empty array for node with no tool edges", () => {
		const graph = make_graph(
			[make_node("file_a", "source_file", "available_ambient")],
			[],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(0);
	});
});
