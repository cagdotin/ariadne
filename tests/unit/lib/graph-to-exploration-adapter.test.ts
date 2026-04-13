import { describe, expect, it } from "vitest";
import { exploration_payload_schema } from "../../../contracts/exploration/types";
import type { SessionGraphPayload } from "../../../contracts/graph/types";
import { project_graph_to_exploration } from "../../../src/lib/graph-to-exploration-adapter";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function make_graph(): SessionGraphPayload {
	return {
		session_id: "sess-1",
		project_path: "/project",
		nodes: [
			{
				id: "session_sess-1",
				kind: "session",
				label: "Session sess-1",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_replay", source_ref: "sess-1", detail: null },
				],
			},
			{
				id: "framing_sess-1",
				kind: "session_framing",
				label: "Session Framing",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
			},
			{
				id: "user_prompt_0",
				kind: "user_prompt",
				label: "User: fix the bug",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u1", detail: null }],
				metadata: { turn_index: 0, text: "fix the bug" },
			},
			{
				id: "assistant_turn_0",
				kind: "assistant_turn",
				label: "Turn 1",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u1", detail: null }],
				metadata: { turn_index: 0 },
			},
			{
				id: "tool_0_0",
				kind: "search_query",
				label: "Grep: bug pattern",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: { tool_name: "Grep" },
			},
			{
				id: "tool_0_1",
				kind: "tool_call",
				label: "Read: foo.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: { tool_name: "Read", file_path: "/project/src/foo.ts" },
			},
			{
				id: "tool_0_2",
				kind: "tool_call",
				label: "Edit: foo.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: { tool_name: "Edit", file_path: "/project/src/foo.ts" },
			},
			{
				id: "file_src_foo.ts",
				kind: "source_file",
				label: "foo.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: { path: "src/foo.ts" },
			},
			{
				id: "file_AGENTS.md",
				kind: "agents_doc",
				label: "AGENTS.md (ambient)",
				availability: "available_ambient",
				confidence: "medium",
				evidence: [
					{
						kind: "ambient_repo_context",
						source_ref: "AGENTS.md",
						detail: null,
					},
				],
				metadata: { path: "AGENTS.md" },
			},
		],
		edges: [
			{
				source_id: "session_sess-1",
				target_id: "framing_sess-1",
				kind: "framed_by",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "session_sess-1",
				target_id: "user_prompt_0",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "user_prompt_0",
				target_id: "assistant_turn_0",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_0",
				target_id: "tool_0_0",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_0",
				target_id: "tool_0_1",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_0",
				target_id: "tool_0_2",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "tool_0_1",
				target_id: "file_src_foo.ts",
				kind: "read",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "tool_0_2",
				target_id: "file_src_foo.ts",
				kind: "edited",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
		],
		has_repo_context: true,
		derived_at: "2026-04-13T10:00:00Z",
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("renderer-side project_graph_to_exploration", () => {
	it("produces a schema-valid ExplorationPayload", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(() => exploration_payload_schema.parse(result)).not.toThrow();
	});

	it("preserves session_id and project_path", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.session_id).toBe("sess-1");
		expect(result.project_path).toBe("/project");
	});

	it("creates turns from user_prompt nodes", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.turns).toHaveLength(1);
		expect(result.turns[0].user_message_snippet).toBe("fix the bug");
	});

	it("creates events from tool invocations", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.events).toHaveLength(4);
		const kinds = result.events.map((e) => e.kind);
		expect(kinds).toContain("user_message");
		expect(kinds).toContain("discovery_command");
		expect(kinds).toContain("file_read");
		expect(kinds).toContain("file_edit");
	});

	it("creates artifacts from file/doc nodes", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.artifacts).toHaveLength(2);
		const foo = result.artifacts.find((a) => a.path === "src/foo.ts");
		expect(foo).toBeDefined();
		expect(foo?.explored).toBe(true);
		expect(foo?.kind).toBe("source_file");
	});

	it("marks ambient artifacts as unexplored", () => {
		const result = project_graph_to_exploration(make_graph());
		const agents = result.artifacts.find((a) => a.path === "AGENTS.md");
		expect(agents).toBeDefined();
		expect(agents?.explored).toBe(false);
		expect(agents?.kind).toBe("doc_file");
	});

	it("creates relations from relevant graph edges", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.relations.length).toBeGreaterThan(0);
	});

	it("sets has_repo_context from graph", () => {
		const result = project_graph_to_exploration(make_graph());
		expect(result.has_repo_context).toBe(true);
	});

	it("handles graph with no turns", () => {
		const graph = make_graph();
		graph.nodes = graph.nodes.filter(
			(n) =>
				![
					"user_prompt",
					"assistant_turn",
					"tool_call",
					"search_query",
				].includes(n.kind),
		);
		graph.edges = [];
		const result = project_graph_to_exploration(graph);
		expect(result.turns).toHaveLength(0);
		expect(result.events).toHaveLength(0);
		expect(() => exploration_payload_schema.parse(result)).not.toThrow();
	});
});

describe("renderer adapter parity with backend adapter", () => {
	it("produces identical output to backend adapter for the same graph", async () => {
		const { project_graph_to_exploration: backend_adapter } = await import(
			"../../../backend/analytics/graph/graph-to-exploration-adapter"
		);
		const graph = make_graph();
		const renderer_result = project_graph_to_exploration(graph);
		const backend_result = backend_adapter(graph);
		expect(renderer_result).toEqual(backend_result);
	});
});
