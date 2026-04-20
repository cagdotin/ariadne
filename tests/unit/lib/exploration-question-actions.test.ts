import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_question_actions,
	type QuestionAction,
} from "../../../src/lib/exploration-question-actions";

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

describe("compute_question_actions", () => {
	describe("for assistant_turn", () => {
		it("returns turn-specific actions", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("search_0", "search_query"),
					make_node("tool_read", "tool_call"),
					make_node("tool_edit", "tool_call"),
					make_node("file_a", "source_file"),
					make_node("doc_a", "doc_file"),
				],
				[
					make_edge("turn_0", "search_0", "invoked_tool"),
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("tool_read", "doc_a", "read"),
				],
			);

			const actions = compute_question_actions("turn_0", graph);

			const action_ids = actions.map((a) => a.id);
			expect(action_ids).toContain("show_explored_after");
			expect(action_ids).toContain("show_edited_files_only");
			expect(action_ids).toContain("show_turn_docs");
		});

		it("omits show_edited_files_only when no edits", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("tool_read", "tool_call"),
					make_node("file_a", "source_file"),
				],
				[
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
				],
			);

			const actions = compute_question_actions("turn_0", graph);
			expect(actions.find((a) => a.id === "show_edited_files_only")).toBeUndefined();
		});
	});

	describe("for source_file", () => {
		it("returns file-specific actions", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn"),
					make_node("tool_read", "tool_call"),
					make_node("tool_edit", "tool_call"),
					make_node("file_a", "source_file"),
					make_node("doc_a", "doc_file"),
					make_node("file_b", "source_file", "available_ambient"),
				],
				[
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("doc_a", "file_a", "linked_to"),
					make_edge("file_a", "file_b", "adjacent_unexplored"),
				],
			);

			const actions = compute_question_actions("file_a", graph);
			const action_ids = actions.map((a) => a.id);

			expect(action_ids).toContain("show_arrival_path");
			expect(action_ids).toContain("show_upstream_docs");
			expect(action_ids).toContain("show_adjacent_unexplored");
		});

		it("omits show_adjacent_unexplored when none exist", () => {
			const graph = make_graph(
				[
					make_node("tool_read", "tool_call"),
					make_node("file_a", "source_file"),
				],
				[make_edge("tool_read", "file_a", "read")],
			);

			const actions = compute_question_actions("file_a", graph);
			expect(actions.find((a) => a.id === "show_adjacent_unexplored")).toBeUndefined();
		});
	});

	describe("for instruction_source / doc", () => {
		it("returns instruction-specific actions", () => {
			const graph = make_graph(
				[
					make_node("claude_md", "instruction_source", "available_ambient"),
					make_node("file_a", "source_file"),
					make_node("file_b", "source_file"),
					make_node("tool_edit", "tool_call"),
				],
				[
					make_edge("claude_md", "file_a", "influenced_by"),
					make_edge("claude_md", "file_b", "influenced_by"),
					make_edge("tool_edit", "file_b", "edited"),
				],
			);

			const actions = compute_question_actions("claude_md", graph);
			const action_ids = actions.map((a) => a.id);

			expect(action_ids).toContain("show_what_influenced");
			expect(action_ids).toContain("show_downstream_edits");
		});
	});

	it("returns empty for unsupported node kinds", () => {
		const graph = make_graph(
			[make_node("session", "session")],
			[],
		);

		const actions = compute_question_actions("session", graph);
		expect(actions).toHaveLength(0);
	});

	it("returns empty for unknown node id", () => {
		const graph = make_graph([], []);
		const actions = compute_question_actions("nonexistent", graph);
		expect(actions).toHaveLength(0);
	});

	it("every action has required fields", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read", "tool_call"),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
			],
		);

		const actions = compute_question_actions("turn_0", graph);
		for (const action of actions) {
			expect(action.id).toBeDefined();
			expect(action.label).toBeDefined();
			expect(action.focus_mode).toBeDefined();
		}
	});
});
