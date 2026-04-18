import { describe, expect, it } from "vitest";
import { derive_session_graph } from "../../../backend/analytics/graph/derive-session-graph";
import { session_graph_payload_schema } from "../../../contracts/graph/types";
import type {
	SessionEntry,
	SessionHeader,
} from "../../../contracts/sessions/replay";

// ── Helpers ──────────────────────────────────────────────────────────────────

function make_user_entry(
	content: string,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "u1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:00Z",
		message: { role: "user", content },
	};
}

function make_assistant_entry(
	tool_calls: Array<{
		id?: string;
		name: string;
		arguments: Record<string, unknown>;
	}>,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "a1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:01Z",
		message: {
			role: "assistant",
			content: tool_calls.map((tc, index) => ({
				type: "toolCall" as const,
				id: tc.id ?? `tc_${tc.name}_${index}`,
				name: tc.name,
				arguments: tc.arguments,
			})),
		},
	};
}

function make_tool_result_entry(
	tool_call_id: string,
	content: string,
	opts: {
		id?: string;
		timestamp?: string;
		tool_name?: string;
		is_error?: boolean;
	} = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? `tr_${tool_call_id}`,
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:02Z",
		message: {
			role: "toolResult",
			toolCallId: tool_call_id,
			toolName: opts.tool_name,
			isError: opts.is_error ?? false,
			content: [{ type: "text", text: content }],
		},
	};
}

function make_model_change_entry(
	provider: string,
	model_id: string,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "model_change",
		id: opts.id ?? "mc1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:00Z",
		provider,
		modelId: model_id,
	} as SessionEntry;
}

function make_thinking_level_entry(
	level: string,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "thinking_level_change",
		id: opts.id ?? "tl1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:00Z",
		thinkingLevel: level,
	} as SessionEntry;
}

function make_custom_message_entry(
	custom_type: string,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "custom_message",
		id: opts.id ?? "cm1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:00Z",
		customType: custom_type,
		content: custom_type,
		display: false,
	} as SessionEntry;
}

const default_header: SessionHeader = {
	type: "session",
	id: "sess-1",
	cwd: "/project",
	timestamp: "2025-06-01T10:00:00Z",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("derive_session_graph", () => {
	it("produces a schema-valid payload", () => {
		const entries: SessionEntry[] = [make_user_entry("hello")];
		const result = derive_session_graph("sess-1", entries, default_header);
		expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
	});

	it("returns session_id and project_path", () => {
		const result = derive_session_graph("sess-1", [], default_header);
		expect(result.session_id).toBe("sess-1");
		expect(result.project_path).toBe("/project");
	});

	// ── Framing ─────────────────────────────────────────────────────────

	describe("framing nodes", () => {
		it("creates session and session_framing nodes", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const kinds = result.nodes.map((n) => n.kind);
			expect(kinds).toContain("session");
			expect(kinds).toContain("session_framing");
		});

		it("creates cwd runtime_context from header", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const cwd_node = result.nodes.find(
				(n) => n.kind === "runtime_context" && n.label.includes("cwd"),
			);
			expect(cwd_node).toBeDefined();
			expect(cwd_node!.label).toContain("/project");
			expect(cwd_node!.availability).toBe("available_observed");
			expect(cwd_node!.metadata?.cwd).toBe("/project");
		});

		it("creates model_change framing node", () => {
			const entries: SessionEntry[] = [
				make_model_change_entry("anthropic", "claude-opus-4-20250514", {
					id: "mc1",
				}),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const model_node = result.nodes.find(
				(n) => n.kind === "runtime_context" && n.label.includes("Model"),
			);
			expect(model_node).toBeDefined();
			expect(model_node!.label).toContain("claude-opus-4-20250514");
			expect(model_node!.availability).toBe("available_observed");
			expect(model_node!.evidence[0].kind).toBe("observed_replay");
			expect(model_node!.evidence[0].source_ref).toBe("mc1");
		});

		it("creates thinking_level_change framing node", () => {
			const entries: SessionEntry[] = [
				make_thinking_level_entry("high", { id: "tl1" }),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const tl_node = result.nodes.find(
				(n) => n.kind === "runtime_context" && n.label.includes("Thinking"),
			);
			expect(tl_node).toBeDefined();
			expect(tl_node!.label).toContain("high");
			expect(tl_node!.evidence[0].source_ref).toBe("tl1");
		});

		it("creates framing nodes for notable custom messages", () => {
			const entries: SessionEntry[] = [
				make_custom_message_entry("expertise-loaded", { id: "cm1" }),
				make_custom_message_entry("cmux-detected", { id: "cm2" }),
				make_custom_message_entry("track-context-loaded", { id: "cm3" }),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const custom_nodes = result.nodes.filter(
				(n) => n.kind === "runtime_context" && n.label.startsWith("Runtime:"),
			);
			expect(custom_nodes).toHaveLength(3);
			expect(custom_nodes.map((n) => n.metadata?.custom_type).sort()).toEqual([
				"cmux-detected",
				"expertise-loaded",
				"track-context-loaded",
			]);
			for (const cn of custom_nodes) {
				expect(cn.evidence[0].kind).toBe("observed_custom_message");
			}
		});

		it("ignores non-notable custom messages", () => {
			const entries: SessionEntry[] = [
				make_custom_message_entry("some-random-message", { id: "cm1" }),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const custom_nodes = result.nodes.filter(
				(n) => n.kind === "runtime_context" && n.label.startsWith("Runtime:"),
			);
			expect(custom_nodes).toHaveLength(0);
		});
	});

	// ── System/developer prompts ─────────────────────────────────────────

	describe("system/developer prompt unavailability", () => {
		it("creates unavailable system_prompt node", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const sys = result.nodes.find((n) => n.kind === "system_prompt");
			expect(sys).toBeDefined();
			expect(sys!.availability).toBe("unavailable");
			expect(sys!.evidence).toHaveLength(0);
			expect(sys!.label).toContain("not captured");
		});

		it("creates unavailable developer_prompt node", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const dev = result.nodes.find((n) => n.kind === "developer_prompt");
			expect(dev).toBeDefined();
			expect(dev!.availability).toBe("unavailable");
			expect(dev!.label).toContain("not captured");
		});

		it("connects prompts to framing with unavailable edges", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const framing_edges = result.edges.filter(
				(e) =>
					e.target_id === "framing_system_prompt" ||
					e.target_id === "framing_developer_prompt",
			);
			expect(framing_edges).toHaveLength(2);
			for (const e of framing_edges) {
				expect(e.availability).toBe("unavailable");
			}
		});
	});

	// ── Turn / tool / file nodes ─────────────────────────────────────────

	describe("turn and tool derivation", () => {
		it("creates user_prompt and assistant_turn nodes for each turn", () => {
			const entries: SessionEntry[] = [
				make_user_entry("first question", { id: "u1" }),
				make_assistant_entry(
					[{ name: "Read", arguments: { file_path: "/project/foo.ts" } }],
					{ id: "a1" },
				),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const user_nodes = result.nodes.filter((n) => n.kind === "user_prompt");
			const turn_nodes = result.nodes.filter(
				(n) => n.kind === "assistant_turn",
			);
			expect(user_nodes).toHaveLength(1);
			expect(turn_nodes).toHaveLength(1);
			expect(user_nodes[0].label).toContain("first question");
		});

		it("creates tool_call nodes for file operations", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read foo"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const tool_nodes = result.nodes.filter((n) => n.kind === "tool_call");
			expect(tool_nodes).toHaveLength(1);
			expect(tool_nodes[0].label).toContain("foo.ts");
			expect(tool_nodes[0].metadata?.tool_index).toBe(0);
			expect(tool_nodes[0].metadata?.turn_index).toBe(0);
		});

		it("creates source_file nodes for code files", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read code"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/app.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const file_nodes = result.nodes.filter((n) => n.kind === "source_file");
			expect(file_nodes).toHaveLength(1);
			expect(file_nodes[0].label).toBe("app.ts");
			expect(file_nodes[0].metadata?.path).toBe("src/app.ts");
		});

		it("creates doc_file nodes for markdown files", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read docs"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/docs/README.md" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const doc_nodes = result.nodes.filter((n) => n.kind === "doc_file");
			expect(doc_nodes).toHaveLength(1);
			expect(doc_nodes[0].label).toBe("README.md");
		});

		it("creates read edges from tool to file", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const read_edges = result.edges.filter((e) => e.kind === "read");
			expect(read_edges).toHaveLength(1);
		});

		it("creates edited edges for Edit tool calls", () => {
			const entries: SessionEntry[] = [
				make_user_entry("edit file"),
				make_assistant_entry([
					{ name: "Edit", arguments: { file_path: "/project/foo.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const edit_edges = result.edges.filter((e) => e.kind === "edited");
			expect(edit_edges).toHaveLength(1);
		});

		it("creates wrote edges for Write tool calls", () => {
			const entries: SessionEntry[] = [
				make_user_entry("write file"),
				make_assistant_entry([
					{ name: "Write", arguments: { file_path: "/project/new.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const write_edges = result.edges.filter((e) => e.kind === "wrote");
			expect(write_edges).toHaveLength(1);
		});

		it("creates search_query nodes for discovery tools", () => {
			const entries: SessionEntry[] = [
				make_user_entry("find files"),
				make_assistant_entry([
					{ name: "Grep", arguments: { pattern: "TODO" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const search_nodes = result.nodes.filter(
				(n) => n.kind === "search_query",
			);
			expect(search_nodes).toHaveLength(1);
			expect(search_nodes[0].label).toContain("Grep");
			expect(search_nodes[0].label).toContain("TODO");
		});

		it("creates search_query for bash discovery commands", () => {
			const entries: SessionEntry[] = [
				make_user_entry("find files"),
				make_assistant_entry([
					{ name: "Bash", arguments: { command: "rg pattern src/" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const search_nodes = result.nodes.filter(
				(n) => n.kind === "search_query",
			);
			expect(search_nodes).toHaveLength(1);
		});

		it("deduplicates file nodes across multiple reads", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read twice"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const file_nodes = result.nodes.filter((n) => n.kind === "source_file");
			expect(file_nodes).toHaveLength(1);
		});
	});

	// ── Same-turn discovery lineage ─────────────────────────────────────

	describe("same-turn discovery lineage", () => {
		it("emits discovered and influenced_by for an exact surfaced path", () => {
			const entries: SessionEntry[] = [
				make_user_entry("find the implementation and read it", { id: "u1" }),
				make_assistant_entry(
					[
						{
							id: "tc_search",
							name: "Grep",
							arguments: { pattern: "derive_session_graph" },
						},
					],
					{ id: "a1", timestamp: "2025-06-01T10:00:01Z" },
				),
				make_tool_result_entry(
					"tc_search",
					"src/lib/foo.ts:12:export function derive_session_graph()",
					{ id: "tr1", timestamp: "2025-06-01T10:00:02Z", tool_name: "Grep" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read",
							name: "Read",
							arguments: { file_path: "/project/src/lib/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const search_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_search",
			);
			const read_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read",
			);
			const file_node = result.nodes.find(
				(n) =>
					n.kind === "source_file" && n.metadata?.path === "src/lib/foo.ts",
			);
			const discovered_edge = result.edges.find(
				(e) =>
					e.kind === "discovered" &&
					e.source_id === search_node?.id &&
					e.target_id === file_node?.id,
			);
			const influenced_edge = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === search_node?.id &&
					e.target_id === read_node?.id,
			);

			expect(search_node?.kind).toBe("search_query");
			expect(search_node?.metadata?.tool_result_entry_id).toBe("tr1");
			expect(discovered_edge).toBeDefined();
			expect(discovered_edge?.availability).toBe("derived_inferred");
			expect(discovered_edge?.confidence).toBe("high");
			expect(
				discovered_edge?.evidence.some((ev) => ev.source_ref === "tr1"),
			).toBe(true);
			expect(influenced_edge).toBeDefined();
			expect(influenced_edge?.availability).toBe("derived_inferred");
			expect(influenced_edge?.confidence).toBe("high");
		});

		it("uses medium confidence for uniquely resolvable basename matches", () => {
			const entries: SessionEntry[] = [
				make_user_entry("search then inspect foo", { id: "u1" }),
				make_assistant_entry(
					[{ id: "tc_search", name: "Grep", arguments: { pattern: "foo" } }],
					{ id: "a1" },
				),
				make_tool_result_entry("tc_search", "foo.ts:7:match", {
					id: "tr1",
					tool_name: "Grep",
				}),
				make_assistant_entry(
					[
						{
							id: "tc_read",
							name: "Read",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const search_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_search",
			);
			const read_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read",
			);
			const file_node = result.nodes.find(
				(n) => n.kind === "source_file" && n.metadata?.path === "src/foo.ts",
			);
			const discovered_edge = result.edges.find(
				(e) =>
					e.kind === "discovered" &&
					e.source_id === search_node?.id &&
					e.target_id === file_node?.id,
			);
			const influenced_edge = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === search_node?.id &&
					e.target_id === read_node?.id,
			);

			expect(discovered_edge?.confidence).toBe("medium");
			expect(influenced_edge?.confidence).toBe("medium");
		});

		it("does not emit false lineage for ambiguous basename-only results", () => {
			const entries: SessionEntry[] = [
				make_user_entry("search ambiguous foo", { id: "u1" }),
				make_assistant_entry(
					[{ id: "tc_search", name: "Grep", arguments: { pattern: "foo" } }],
					{ id: "a1" },
				),
				make_tool_result_entry("tc_search", "foo.ts:7:match", {
					id: "tr1",
					tool_name: "Grep",
				}),
				make_assistant_entry(
					[
						{
							id: "tc_read_a",
							name: "Read",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_b",
							name: "Read",
							arguments: { file_path: "/project/tests/foo.ts" },
						},
					],
					{ id: "a3", timestamp: "2025-06-01T10:00:04Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			expect(result.edges.filter((e) => e.kind === "discovered")).toHaveLength(
				0,
			);
			expect(
				result.edges.filter((e) => e.kind === "influenced_by"),
			).toHaveLength(0);
		});

		it("does not emit lineage from temporal adjacency alone", () => {
			const entries: SessionEntry[] = [
				make_user_entry("search and read something else", { id: "u1" }),
				make_assistant_entry(
					[{ id: "tc_search", name: "Grep", arguments: { pattern: "bar" } }],
					{ id: "a1" },
				),
				make_tool_result_entry("tc_search", "src/bar.ts:4:match", {
					id: "tr1",
					tool_name: "Grep",
				}),
				make_assistant_entry(
					[
						{
							id: "tc_read",
							name: "Read",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			expect(result.edges.filter((e) => e.kind === "discovered")).toHaveLength(
				0,
			);
			expect(
				result.edges.filter((e) => e.kind === "influenced_by"),
			).toHaveLength(0);
		});

		it("allows one search query to influence multiple later reads", () => {
			const entries: SessionEntry[] = [
				make_user_entry("search and open both files", { id: "u1" }),
				make_assistant_entry(
					[
						{
							id: "tc_search",
							name: "Bash",
							arguments: { command: "rg TODO src" },
						},
					],
					{ id: "a1" },
				),
				make_tool_result_entry(
					"tc_search",
					"src/foo.ts:1:TODO\nsrc/bar.ts:2:TODO",
					{
						id: "tr1",
						tool_name: "Bash",
					},
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_a",
							name: "Read",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_b",
							name: "Read",
							arguments: { file_path: "/project/src/bar.ts" },
						},
					],
					{ id: "a3", timestamp: "2025-06-01T10:00:04Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const search_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_search",
			);
			const influenced_edges = result.edges.filter(
				(e) => e.kind === "influenced_by" && e.source_id === search_node?.id,
			);
			const discovered_edges = result.edges.filter(
				(e) => e.kind === "discovered" && e.source_id === search_node?.id,
			);

			expect(influenced_edges).toHaveLength(2);
			expect(discovered_edges).toHaveLength(2);
		});

		it("uses search query term affinity when later reads stay in the same search topic", () => {
			const entries: SessionEntry[] = [
				make_user_entry("follow the session graph files", { id: "u1" }),
				make_assistant_entry(
					[
						{
							id: "tc_search",
							name: "Bash",
							arguments: {
								command:
									'rg -n "exploration-session-graph|ExplorationGraph|viewport|graph" tests src/lib src/components/exploration',
							},
						},
					],
					{ id: "a1" },
				),
				make_tool_result_entry(
					"tc_search",
					"tests/unit/lib/exploration-path-view-model.test.ts:8:import { compute_path_turns }",
					{ id: "tr1", tool_name: "Bash" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_a",
							name: "Read",
							arguments: {
								file_path:
									"/project/tests/unit/lib/exploration-session-graph-layout.test.ts",
							},
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_b",
							name: "Read",
							arguments: {
								file_path:
									"/project/tests/unit/lib/exploration-session-graph-view-model.test.ts",
							},
						},
					],
					{ id: "a3", timestamp: "2025-06-01T10:00:04Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const search_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_search",
			);
			const read_a = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read_a",
			);
			const read_b = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read_b",
			);
			const influenced_a = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === search_node?.id &&
					e.target_id === read_a?.id,
			);
			const influenced_b = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === search_node?.id &&
					e.target_id === read_b?.id,
			);

			expect(influenced_a?.confidence).toBe("medium");
			expect(influenced_b?.confidence).toBe("medium");
			expect(result.edges.filter((e) => e.kind === "discovered")).toHaveLength(
				0,
			);
		});

		it("lets an earlier read influence a later read when the earlier file explicitly references it", () => {
			const entries: SessionEntry[] = [
				make_user_entry("follow the reference", { id: "u1" }),
				make_assistant_entry(
					[
						{
							id: "tc_read_a",
							name: "Read",
							arguments: { file_path: "/project/docs/guide.md" },
						},
					],
					{ id: "a1" },
				),
				make_tool_result_entry(
					"tc_read_a",
					"Next inspect src/lib/bar.ts for the implementation details.",
					{ id: "tr1", tool_name: "Read" },
				),
				make_assistant_entry(
					[
						{
							id: "tc_read_b",
							name: "Read",
							arguments: { file_path: "/project/src/lib/bar.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const read_a = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read_a",
			);
			const read_b = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read_b",
			);
			const influenced_edge = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === read_a?.id &&
					e.target_id === read_b?.id,
			);

			expect(influenced_edge?.confidence).toBe("high");
		});

		it("prefers same-artifact follow-up over an older search when a file is edited after being read", () => {
			const entries: SessionEntry[] = [
				make_user_entry("find foo then change it", { id: "u1" }),
				make_assistant_entry(
					[{ id: "tc_search", name: "Grep", arguments: { pattern: "foo" } }],
					{ id: "a1" },
				),
				make_tool_result_entry("tc_search", "src/foo.ts:7:match", {
					id: "tr1",
					tool_name: "Grep",
				}),
				make_assistant_entry(
					[
						{
							id: "tc_read",
							name: "Read",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
				make_tool_result_entry("tc_read", "export const foo = true;", {
					id: "tr2",
					tool_name: "Read",
				}),
				make_assistant_entry(
					[
						{
							id: "tc_edit",
							name: "Edit",
							arguments: { file_path: "/project/src/foo.ts" },
						},
					],
					{ id: "a3", timestamp: "2025-06-01T10:00:04Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const search_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_search",
			);
			const read_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read",
			);
			const edit_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_edit",
			);
			const search_to_read = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === search_node?.id &&
					e.target_id === read_node?.id,
			);
			const read_to_edit = result.edges.find(
				(e) =>
					e.kind === "influenced_by" &&
					e.source_id === read_node?.id &&
					e.target_id === edit_node?.id,
			);

			expect(search_to_read).toBeDefined();
			expect(read_to_edit?.confidence).toBe("high");
		});

		it("withholds medium-confidence influence when multiple searches tie on the same query term", () => {
			const entries: SessionEntry[] = [
				make_user_entry("search twice then read", { id: "u1" }),
				make_assistant_entry(
					[
						{
							id: "tc_search_a",
							name: "Bash",
							arguments: { command: 'rg -n "session-graph" src tests' },
						},
					],
					{ id: "a1" },
				),
				make_tool_result_entry(
					"tc_search_a",
					"src/other-file.ts:1:session-graph",
					{
						id: "tr1",
						tool_name: "Bash",
					},
				),
				make_assistant_entry(
					[
						{
							id: "tc_search_b",
							name: "Bash",
							arguments: { command: 'rg -n "session-graph" tests src/lib' },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:00:03Z" },
				),
				make_tool_result_entry(
					"tc_search_b",
					"tests/another-file.ts:1:session-graph",
					{
						id: "tr2",
						tool_name: "Bash",
					},
				),
				make_assistant_entry(
					[
						{
							id: "tc_read",
							name: "Read",
							arguments: {
								file_path:
									"/project/tests/unit/lib/exploration-session-graph-view-model.test.ts",
							},
						},
					],
					{ id: "a3", timestamp: "2025-06-01T10:00:04Z" },
				),
			];

			const result = derive_session_graph("sess-1", entries, default_header);
			const read_node = result.nodes.find(
				(n) => n.metadata?.tool_call_id === "tc_read",
			);
			const influenced_edges = result.edges.filter(
				(e) => e.kind === "influenced_by" && e.target_id === read_node?.id,
			);

			expect(influenced_edges).toHaveLength(0);
		});
	});

	// ── AGENTS.md handling ───────────────────────────────────────────────

	describe("AGENTS.md handling", () => {
		it("marks explicitly read AGENTS.md as agents_doc with observed evidence", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read agents"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/AGENTS.md" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const agents_node = result.nodes.find((n) => n.kind === "agents_doc");
			expect(agents_node).toBeDefined();
			expect(agents_node!.availability).toBe("available_observed");
			expect(agents_node!.label).toContain("explicitly read");
		});

		it("connects explicitly read AGENTS.md to framing", () => {
			const entries: SessionEntry[] = [
				make_user_entry("read agents"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/AGENTS.md" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const agents_node = result.nodes.find((n) => n.kind === "agents_doc");
			const framing_edge = result.edges.find(
				(e) => e.target_id === agents_node?.id && e.kind === "constrained_by",
			);
			expect(framing_edge).toBeDefined();
			expect(framing_edge!.availability).toBe("available_observed");
			expect(framing_edge!.label).toBe("explicitly read");
		});
	});

	// ── Evidence and provenance ──────────────────────────────────────────

	describe("evidence and provenance", () => {
		it("attaches entry IDs to evidence source_refs", () => {
			const entries: SessionEntry[] = [
				make_user_entry("question", { id: "user-entry-42" }),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const user_node = result.nodes.find((n) => n.kind === "user_prompt");
			expect(user_node).toBeDefined();
			expect(user_node!.evidence[0].source_ref).toBe("user-entry-42");
		});

		it("framing edges reference session header", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			const framing_edges = result.edges.filter(
				(e) => e.source_id.startsWith("session_") && e.kind === "framed_by",
			);
			expect(framing_edges.length).toBeGreaterThan(0);
			for (const e of framing_edges) {
				expect(e.evidence.length).toBeGreaterThan(0);
			}
		});

		it("all nodes have valid availability and confidence", () => {
			const entries: SessionEntry[] = [
				make_model_change_entry("anthropic", "opus"),
				make_thinking_level_entry("high"),
				make_user_entry("hello"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);

			for (const node of result.nodes) {
				expect([
					"available_observed",
					"available_ambient",
					"derived_inferred",
					"unavailable",
					"unknown",
				]).toContain(node.availability);
				expect(["high", "medium", "low"]).toContain(node.confidence);
			}
		});
	});

	// ── Empty/edge cases ─────────────────────────────────────────────────

	describe("edge cases", () => {
		it("handles empty entries", () => {
			const result = derive_session_graph("sess-1", [], default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			// Should still have session, framing, cwd, prompt nodes
			expect(result.nodes.length).toBeGreaterThan(0);
		});

		it("handles null header", () => {
			const entries: SessionEntry[] = [make_user_entry("hello")];
			const result = derive_session_graph("sess-1", entries, null);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			expect(result.project_path).toBe("");
		});
	});

	// ── Defensive / malformed input ─────────────────────────────────────

	describe("malformed entries", () => {
		it("ignores entries with unknown type", () => {
			const entries: SessionEntry[] = [
				{
					type: "banana",
					id: "x1",
					parentId: null,
					timestamp: "2025-06-01T10:00:00Z",
				} as unknown as SessionEntry,
				make_user_entry("hello"),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			// The unknown entry should be silently skipped
			const user_prompts = result.nodes.filter((n) => n.kind === "user_prompt");
			expect(user_prompts).toHaveLength(1);
		});

		it("handles tool call with null file_path argument", () => {
			const entries: SessionEntry[] = [
				make_user_entry("fix it"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: null as unknown as string } },
				]),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			// Should still create a tool node but no file node
			const tool_nodes = result.nodes.filter(
				(n) => n.kind === "tool_call" || n.kind === "search_query",
			);
			expect(tool_nodes.length).toBeGreaterThanOrEqual(1);
			const file_nodes = result.nodes.filter(
				(n) => n.kind === "source_file" || n.kind === "doc_file",
			);
			expect(file_nodes).toHaveLength(0);
		});

		it("handles tool call with missing arguments entirely", () => {
			const entries: SessionEntry[] = [
				make_user_entry("do something"),
				{
					type: "message",
					id: "a1",
					parentId: null,
					timestamp: "2025-06-01T10:00:01Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall" as const,
								id: "tc_x",
								name: "CustomTool",
								arguments: {},
							},
						],
					},
				},
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			const tool_nodes = result.nodes.filter((n) => n.kind === "tool_call");
			expect(tool_nodes).toHaveLength(1);
			expect(tool_nodes[0].label).toContain("CustomTool");
		});

		it("handles entry missing the message field gracefully", () => {
			const entries: SessionEntry[] = [
				{
					type: "message",
					id: "broken",
					parentId: null,
					timestamp: "2025-06-01T10:00:00Z",
				} as unknown as SessionEntry,
				make_user_entry("hello"),
			];
			// Should not throw even with a malformed message entry
			const result = derive_session_graph("sess-1", entries, default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
		});

		it("handles assistant entry with no content blocks", () => {
			const entries: SessionEntry[] = [
				make_user_entry("hello"),
				{
					type: "message",
					id: "a1",
					parentId: null,
					timestamp: "2025-06-01T10:00:01Z",
					message: { role: "assistant", content: [] },
				},
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			expect(() => session_graph_payload_schema.parse(result)).not.toThrow();
			const tool_nodes = result.nodes.filter(
				(n) => n.kind === "tool_call" || n.kind === "search_query",
			);
			expect(tool_nodes).toHaveLength(0);
		});
	});
});
