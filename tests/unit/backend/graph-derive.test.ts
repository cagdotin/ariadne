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
	tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "a1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:01Z",
		message: {
			role: "assistant",
			content: tool_calls.map((tc) => ({
				type: "toolCall" as const,
				id: `tc_${tc.name}`,
				name: tc.name,
				arguments: tc.arguments,
			})),
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
		const entries: SessionEntry[] = [
			make_user_entry("hello"),
		];
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
				make_model_change_entry("anthropic", "claude-opus-4-20250514", { id: "mc1" }),
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
				(e) => e.target_id === "framing_system_prompt" || e.target_id === "framing_developer_prompt",
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
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/foo.ts" } },
				], { id: "a1" }),
			];
			const result = derive_session_graph("sess-1", entries, default_header);
			const user_nodes = result.nodes.filter((n) => n.kind === "user_prompt");
			const turn_nodes = result.nodes.filter((n) => n.kind === "assistant_turn");
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
			const search_nodes = result.nodes.filter((n) => n.kind === "search_query");
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
			const search_nodes = result.nodes.filter((n) => n.kind === "search_query");
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
				expect(["available_observed", "available_ambient", "derived_inferred", "unavailable", "unknown"]).toContain(node.availability);
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
				{ type: "banana", id: "x1", parentId: null, timestamp: "2025-06-01T10:00:00Z" } as unknown as SessionEntry,
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
			const tool_nodes = result.nodes.filter((n) => n.kind === "tool_call" || n.kind === "search_query");
			expect(tool_nodes.length).toBeGreaterThanOrEqual(1);
			const file_nodes = result.nodes.filter((n) => n.kind === "source_file" || n.kind === "doc_file");
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
				{ type: "message", id: "broken", parentId: null, timestamp: "2025-06-01T10:00:00Z" } as unknown as SessionEntry,
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
			const tool_nodes = result.nodes.filter((n) => n.kind === "tool_call" || n.kind === "search_query");
			expect(tool_nodes).toHaveLength(0);
		});
	});
});
