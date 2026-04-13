import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_path_turns,
	type PathAction,
	type PathTurn,
} from "../../../src/lib/exploration-path-view-model";

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

function make_two_turn_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session", "session"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
				text: "Fix the login bug",
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("search_0", "search_query", "available_observed", {
				tool_name: "Grep",
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				tool_name: "Read",
				file_path: "src/auth.ts",
			}),
			make_node("tool_edit_0", "tool_call", "available_observed", {
				tool_name: "Edit",
				file_path: "src/auth.ts",
			}),
			make_node("file_auth", "source_file", "available_observed", {
				path: "src/auth.ts",
			}),
			// Turn 2
			make_node("user_1", "user_prompt", "available_observed", {
				turn_index: 1,
				text: "Now add tests",
			}),
			make_node("turn_1", "assistant_turn", "available_observed", {
				turn_index: 1,
			}),
			make_node("tool_read_1", "tool_call", "available_observed", {
				tool_name: "Read",
				file_path: "src/auth.ts",
			}),
			make_node("tool_write_1", "tool_call", "available_observed", {
				tool_name: "Write",
				file_path: "tests/auth.test.ts",
			}),
			make_node("file_test", "source_file", "available_observed", {
				path: "tests/auth.test.ts",
			}),
		],
		[
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("turn_0", "tool_edit_0", "invoked_tool"),
			make_edge("tool_read_0", "file_auth", "read"),
			make_edge("tool_edit_0", "file_auth", "edited"),
			make_edge("turn_1", "tool_read_1", "invoked_tool"),
			make_edge("turn_1", "tool_write_1", "invoked_tool"),
			make_edge("tool_read_1", "file_auth", "read"),
			make_edge("tool_write_1", "file_test", "wrote"),
		],
	);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("compute_path_turns", () => {
	it("produces one PathTurn per user_prompt", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns).toHaveLength(2);
		expect(turns[0].turn_index).toBe(0);
		expect(turns[1].turn_index).toBe(1);
	});

	it("extracts user message snippet", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns[0].user_message).toBe("Fix the login bug");
		expect(turns[1].user_message).toBe("Now add tests");
	});

	it("lists actions in order within each turn", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns[0].actions).toHaveLength(3); // search, read, edit
		expect(turns[0].actions[0].action_kind).toBe("search");
		expect(turns[0].actions[1].action_kind).toBe("file_read");
		expect(turns[0].actions[2].action_kind).toBe("file_edit");
	});

	it("classifies action kinds correctly", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		// Turn 2: read, write
		expect(turns[1].actions[0].action_kind).toBe("file_read");
		expect(turns[1].actions[1].action_kind).toBe("file_write");
	});

	it("links actions to target file IDs", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns[0].actions[1].target_node_id).toBe("file_auth");
		expect(turns[0].actions[2].target_node_id).toBe("file_auth");
		expect(turns[1].actions[1].target_node_id).toBe("file_test");
	});

	it("marks actions that directly precede an edit", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		// The read of src/auth.ts directly precedes the edit of src/auth.ts
		expect(turns[0].actions[1].precedes_edit).toBe(true);
		// The edit itself is the edit
		expect(turns[0].actions[2].precedes_edit).toBe(false);
	});

	it("marks revisits to the same file", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		// Turn 0 reads auth.ts first
		expect(turns[0].actions[1].is_revisit).toBe(false);
		// Turn 1 reads auth.ts again
		expect(turns[1].actions[0].is_revisit).toBe(true);
	});

	it("computes per-turn summaries", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns[0].summary.searches).toBe(1);
		expect(turns[0].summary.reads).toBe(1);
		expect(turns[0].summary.edits).toBe(1);
		expect(turns[0].summary.writes).toBe(0);

		expect(turns[1].summary.searches).toBe(0);
		expect(turns[1].summary.reads).toBe(1);
		expect(turns[1].summary.writes).toBe(1);
	});

	it("stores node IDs for selection", () => {
		const graph = make_two_turn_graph();
		const turns = compute_path_turns(graph);

		expect(turns[0].user_prompt_node_id).toBe("user_0");
		expect(turns[0].turn_node_id).toBe("turn_0");
	});

	it("sorts tool actions by explicit tool_index instead of edge array order", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", {
					turn_index: 0,
					text: "Fix it",
				}),
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_search", "search_query", "available_observed", {
					tool_name: "Grep",
					tool_index: 0,
				}),
				make_node("tool_read", "tool_call", "available_observed", {
					tool_name: "Read",
					file_path: "src/auth.ts",
					tool_index: 1,
				}),
				make_node("tool_edit", "tool_call", "available_observed", {
					tool_name: "Edit",
					file_path: "src/auth.ts",
					tool_index: 2,
				}),
				make_node("file_auth", "source_file", "available_observed", {
					path: "src/auth.ts",
				}),
			],
			[
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("turn_0", "tool_search", "invoked_tool"),
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_auth", "read"),
				make_edge("tool_edit", "file_auth", "edited"),
			],
		);

		const turns = compute_path_turns(graph);
		expect(turns).toHaveLength(1);
		expect(turns[0].actions.map((action) => action.action_kind)).toEqual([
			"search",
			"file_read",
			"file_edit",
		]);
	});
});
