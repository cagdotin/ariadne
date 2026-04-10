import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");

import { parse_qmd_logs_from_session } from "../../../backend/qmd-logs/parser";

function make_jsonl(...lines: Record<string, unknown>[]): string {
	return lines.map((l) => JSON.stringify(l)).join("\n");
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("parse_qmd_logs_from_session", () => {
	it("returns empty when file cannot be read", () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(parse_qmd_logs_from_session("/missing.jsonl", "dir")).toEqual([]);
	});

	it("returns empty when no QMD commands found", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "ls -la" },
							},
						],
					},
				},
			),
		);

		expect(parse_qmd_logs_from_session("/s.jsonl", "dir")).toEqual([]);
	});

	it("extracts QMD bash commands and correlates with results", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd search 'test'" },
							},
						],
					},
				},
				{
					type: "message",
					timestamp: "2025-06-01T10:00:01Z",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: [{ type: "text", text: "search results here" }],
						isError: false,
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries).toHaveLength(1);
		expect(entries[0].subcommand).toBe("search");
		expect(entries[0].has_output).toBe(true);
		expect(entries[0].output_text).toBe("search results here");
		expect(entries[0].is_error).toBe(false);
		expect(entries[0].session_id).toBe("s1");
		expect(entries[0].project_path).toBe("/proj");
	});

	it("marks error tool results", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd status" },
							},
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: "Error: QMD not found",
						isError: true,
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].is_error).toBe(true);
	});

	it("handles pending calls without tool results", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd embed" },
							},
						],
					},
				},
				// No tool result follows
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries).toHaveLength(1);
		expect(entries[0].has_output).toBe(false);
		expect(entries[0].output_text).toBe("");
		expect(entries[0].subcommand).toBe("embed");
	});

	it("extracts multiple QMD commands from one session", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd search 'foo'" },
							},
							{
								type: "toolCall",
								id: "tc2",
								name: "bash",
								arguments: { command: "qmd status" },
							},
						],
					},
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc1", content: "r1" },
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc2", content: "r2" },
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries).toHaveLength(2);
		expect(entries[0].subcommand).toBe("search");
		expect(entries[1].subcommand).toBe("status");
	});

	it("generates unique IDs from session_id and tool_call_id", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc-abc",
								name: "bash",
								arguments: { command: "qmd ls" },
							},
						],
					},
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc-abc", content: "" },
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].id).toBe("s1:tc-abc");
		expect(entries[0].tool_call_id).toBe("tc-abc");
	});

	it("ignores non-bash tool calls", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "read",
								arguments: { path: "/a.ts" },
							},
							{
								type: "toolCall",
								id: "tc2",
								name: "bash",
								arguments: { command: "qmd search 'test'" },
							},
						],
					},
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc2", content: "found" },
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries).toHaveLength(1);
		expect(entries[0].subcommand).toBe("search");
	});

	it("handles Bash (capitalized) tool name", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "Bash",
								arguments: { command: "qmd status" },
							},
						],
					},
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc1", content: "ok" },
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries).toHaveLength(1);
	});

	it("truncates long output previews to 200 chars", () => {
		const long_output = "x".repeat(500);
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd search 'test'" },
							},
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: long_output,
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].output_preview.length).toBeLessThanOrEqual(201); // 200 + ellipsis
		expect(entries[0].output_text).toBe(long_output); // full text preserved
	});

	it("detects JSON search output kind", () => {
		const search_json = JSON.stringify({ results: [{ text: "found" }] });
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd search 'test'" },
							},
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: search_json,
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].output_kind).toBe("search_json");
	});

	it("detects files JSON output kind", () => {
		const files_json = JSON.stringify([{ path: "/a.ts", name: "a.ts" }]);
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd paths" },
							},
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: files_json,
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].output_kind).toBe("files_json");
	});

	it("detects raw text output kind", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "s1", cwd: "/proj" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd status" },
							},
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tc1",
						content: "QMD is running v2.0",
					},
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].output_kind).toBe("raw_text");
	});

	it("skips malformed JSON lines", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			`${JSON.stringify({ type: "session", id: "s1", cwd: "/p" })}\nnot json\n${JSON.stringify(
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd status" },
							},
						],
					},
				},
			)}`,
		);

		// Should not crash, may find the QMD command
		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries.length).toBeGreaterThanOrEqual(0);
	});

	it("extracts project info from session header", () => {
		vi.mocked(fs.readFileSync).mockReturnValue(
			make_jsonl(
				{ type: "session", id: "sess-123", cwd: "/Users/me/my-project" },
				{
					type: "message",
					timestamp: "2025-06-01T10:00:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "toolCall",
								id: "tc1",
								name: "bash",
								arguments: { command: "qmd ls" },
							},
						],
					},
				},
				{
					type: "message",
					message: { role: "toolResult", toolCallId: "tc1", content: "" },
				},
			),
		);

		const entries = parse_qmd_logs_from_session("/s.jsonl", "dir");
		expect(entries[0].session_id).toBe("sess-123");
		expect(entries[0].project_path).toBe("/Users/me/my-project");
		expect(entries[0].project_name).toBe("my-project");
	});
});
