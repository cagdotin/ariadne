import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse_session_file } from "../../../backend/analytics/session-parser";
import type { SessionFile } from "../../../backend/analytics/session-types";

vi.mock("node:fs");

const mock_file: SessionFile = {
	path: "/sessions/proj/session.jsonl",
	dir_name: "proj",
	file_name: "session.jsonl",
	file_size: 5000,
};

function make_jsonl(...lines: Record<string, unknown>[]): string {
	return lines.map((l) => JSON.stringify(l)).join("\n");
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("parse_session_file", () => {
	// ── Basic parsing ─────────────────────────────────────────────────

	it("returns null when file cannot be read", () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(parse_session_file(mock_file)).toBeNull();
	});

	it("returns null when no session header found", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl({ type: "message", message: { role: "user", content: "hi" } }),
		);
		expect(parse_session_file(mock_file)).toBeNull();
	});

	it("parses a minimal session with just a header", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl({
				type: "session",
				id: "s1",
				timestamp: "2025-06-01T10:00:00Z",
				cwd: "/project/foo",
			}),
		);

		const result = parse_session_file(mock_file);
		expect(result).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: test assertion on known non-null value
		expect(result!.id).toBe("s1");
		// biome-ignore lint/style/noNonNullAssertion: test assertion on known non-null value
		expect(result!.started_at).toBe("2025-06-01T10:00:00Z");
		// biome-ignore lint/style/noNonNullAssertion: test assertion on known non-null value
		expect(result!.project_path).toBe("/project/foo");
		// biome-ignore lint/style/noNonNullAssertion: test assertion on known non-null value
		expect(result!.project_name).toBe("foo");
	});

	// ── Message counting ──────────────────────────────────────────────

	it("counts user and assistant messages", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "message", message: { role: "user", content: "hello" } },
				{
					type: "message",
					message: { role: "assistant", content: [], stopReason: "end" },
				},
				{ type: "message", message: { role: "user", content: "thanks" } },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.user_message_count).toBe(2);
		expect(result.assistant_message_count).toBe(1);
		expect(result.turn_count).toBe(1);
	});

	it("counts tool results", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", isError: false },
				},
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", isError: true },
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.tool_result_count).toBe(2);
		expect(result.tool_calls.read.calls).toBe(2);
		expect(result.tool_calls.read.errors).toBe(1);
	});

	// ── First user message ────────────────────────────────────────────

	it("captures first user message (string content)", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: { role: "user", content: "Write a function" },
				},
				{
					type: "message",
					message: { role: "user", content: "Second message" },
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.first_user_message).toBe("Write a function");
	});

	it("captures first user message (array content blocks)", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "user",
						content: [{ type: "text", text: "Help me" }],
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.first_user_message).toBe("Help me");
	});

	it("truncates first user message to 200 chars", () => {
		const long_msg = "x".repeat(300);
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "message", message: { role: "user", content: long_msg } },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		// biome-ignore lint/style/noNonNullAssertion: test data contains user messages
		expect(result.first_user_message!.length).toBe(201); // 200 + ellipsis char
		// biome-ignore lint/style/noNonNullAssertion: test data contains user messages
		expect(result.first_user_message!.endsWith("\u2026")).toBe(true);
	});

	it("skips empty first user message", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "message", message: { role: "user", content: "   " } },
				{ type: "message", message: { role: "user", content: "Real message" } },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.first_user_message).toBe("Real message");
	});

	// ── Token and cost tracking ───────────────────────────────────────

	it("accumulates token usage from assistant messages", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						usage: {
							input: 100,
							output: 50,
							cacheRead: 10,
							cacheWrite: 5,
							totalTokens: 165,
						},
					},
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						usage: {
							input: 200,
							output: 100,
							cacheRead: 20,
							cacheWrite: 10,
							totalTokens: 330,
						},
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.input_tokens).toBe(300);
		expect(result.output_tokens).toBe(150);
		expect(result.cache_read_tokens).toBe(30);
		expect(result.cache_write_tokens).toBe(15);
		expect(result.total_tokens).toBe(495);
	});

	it("accumulates cost from assistant messages", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						usage: {
							cost: {
								input: 0.01,
								output: 0.02,
								cacheRead: 0.001,
								cacheWrite: 0.002,
								total: 0.033,
							},
						},
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.input_cost).toBeCloseTo(0.01);
		expect(result.output_cost).toBeCloseTo(0.02);
		expect(result.total_cost).toBeCloseTo(0.033);
	});

	// ── Tool call extraction ──────────────────────────────────────────

	it("extracts bash commands from tool calls", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								name: "bash",
								arguments: { command: "ls -la" },
							},
							{
								type: "toolCall",
								name: "bash",
								arguments: { command: "git status" },
							},
							{
								type: "toolCall",
								name: "bash",
								arguments: { command: "ls /tmp" },
							},
						],
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.bash_commands.ls).toBe(2);
		expect(result.bash_commands.git).toBe(1);
	});

	it("extracts read/edit/write file paths", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								name: "read",
								arguments: { path: "/src/a.ts" },
							},
							{
								type: "toolCall",
								name: "read",
								arguments: { path: "/src/a.ts" },
							},
							{
								type: "toolCall",
								name: "edit",
								arguments: { path: "/src/b.ts" },
							},
							{
								type: "toolCall",
								name: "write",
								arguments: { path: "/src/c.ts" },
							},
						],
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.read_files["/src/a.ts"]).toBe(2);
		expect(result.edit_files["/src/b.ts"]).toBe(1);
		expect(result.write_files["/src/c.ts"]).toBe(1);
	});

	it("handles case-insensitive tool names (Read, Edit, Write)", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [
							{ type: "toolCall", name: "Read", arguments: { path: "/a.ts" } },
							{ type: "toolCall", name: "Edit", arguments: { path: "/b.ts" } },
							{ type: "toolCall", name: "Write", arguments: { path: "/c.ts" } },
						],
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.read_files["/a.ts"]).toBe(1);
		expect(result.edit_files["/b.ts"]).toBe(1);
		expect(result.write_files["/c.ts"]).toBe(1);
	});

	// ── Model tracking ────────────────────────────────────────────────

	it("tracks model usage", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						model: "claude-3",
						provider: "anthropic",
					},
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						model: "claude-3",
						provider: "anthropic",
					},
				},
				{
					type: "message",
					message: {
						role: "assistant",
						content: [],
						model: "gpt-4",
						provider: "openai",
					},
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.models_used).toHaveLength(2);
		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const claude = result.models_used.find((m) => m.model_id === "claude-3")!;
		expect(claude.message_count).toBe(2);
		expect(claude.provider).toBe("anthropic");
	});

	// ── Duration calculation ──────────────────────────────────────────

	it("calculates duration from first to last timestamp", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{
					type: "message",
					timestamp: "2025-06-01T10:05:00Z",
					message: { role: "user", content: "hi" },
				},
				{
					type: "message",
					timestamp: "2025-06-01T10:10:00Z",
					message: { role: "assistant", content: [] },
				},
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.duration_seconds).toBe(600); // 10 minutes
		expect(result.ended_at).toBe("2025-06-01T10:10:00Z");
	});

	// ── Compaction counting ───────────────────────────────────────────

	it("counts compaction entries", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "compaction" },
				{ type: "compaction" },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.compaction_count).toBe(2);
	});

	// ── Session info ──────────────────────────────────────────────────

	it("captures session title from session_info entry", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "session_info", name: "Refactor auth module" },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.title).toBe("Refactor auth module");
	});

	// ── Edge cases ────────────────────────────────────────────────────

	it("skips malformed JSON lines", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			`{"type":"session","id":"s1","timestamp":"2025-06-01T10:00:00Z","cwd":"/p"}\nnot valid json\n{"type":"message","message":{"role":"user","content":"hi"}}`,
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result).not.toBeNull();
		expect(result.user_message_count).toBe(1);
	});

	it("skips blank lines", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			`{"type":"session","id":"s1","timestamp":"2025-06-01T10:00:00Z","cwd":"/p"}\n\n\n`,
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result).not.toBeNull();
	});

	it("handles assistant message without usage", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T10:00:00Z",
					cwd: "/p",
				},
				{ type: "message", message: { role: "assistant", content: [] } },
			),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.total_tokens).toBe(0);
		expect(result.total_cost).toBe(0);
	});

	it("populates file metadata from SessionFile", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl({
				type: "session",
				id: "s1",
				timestamp: "2025-06-01T10:00:00Z",
				cwd: "/p",
			}),
		);

		// biome-ignore lint/style/noNonNullAssertion: test assertion, parse result is non-null for valid input
		const result = parse_session_file(mock_file)!;
		expect(result.session_dir).toBe("proj");
		expect(result.file_name).toBe("session.jsonl");
		expect(result.file_size_bytes).toBe(5000);
	});
});
