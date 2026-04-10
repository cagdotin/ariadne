import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("node:fs");
vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import { get_session_entries } from "../../../backend/analytics/replay-loader";
import { session_cache } from "../../../backend/analytics/session-cache";

function make_session(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		project_path: "/proj",
		project_name: "proj",
		session_dir: "proj-dir",
		file_name: "session.jsonl",
		file_size_bytes: 1000,
		started_at: "2025-06-01T12:00:00Z",
		ended_at: null,
		duration_seconds: null,
		title: null,
		first_user_message: null,
		total_cost: 0,
		input_cost: 0,
		output_cost: 0,
		cache_read_cost: 0,
		cache_write_cost: 0,
		total_tokens: 0,
		input_tokens: 0,
		output_tokens: 0,
		cache_read_tokens: 0,
		cache_write_tokens: 0,
		user_message_count: 0,
		assistant_message_count: 0,
		tool_result_count: 0,
		turn_count: 0,
		compaction_count: 0,
		tool_calls: {},
		bash_commands: {},
		read_files: {},
		edit_files: {},
		write_files: {},
		models_used: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
	process.env.ARIADNE_PI_SESSIONS_ROOT = "/sessions";
	vi.mocked(session_cache.get_or_init).mockResolvedValue([]);
});

describe("get_session_entries", () => {
	it("throws when session not found in cache", async () => {
		await expect(get_session_entries("nonexistent")).rejects.toThrow(
			"Session with id nonexistent not found",
		);
	});

	it("throws when session file does not exist on disk", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(false);

		await expect(get_session_entries("s1")).rejects.toThrow(
			"Session file not found",
		);
	});

	it("parses JSONL and extracts header, entries, and leaf_id", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			[
				JSON.stringify({
					type: "session",
					id: "s1",
					timestamp: "2025-06-01T12:00:00Z",
					cwd: "/proj",
				}),
				JSON.stringify({
					type: "message",
					id: "e1",
					message: { role: "user", content: "hi" },
				}),
				JSON.stringify({
					type: "message",
					id: "e2",
					message: { role: "assistant", content: [] },
				}),
			].join("\n"),
		);

		const result = await get_session_entries("s1");

		expect(result.header).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: guarded by not.toBeNull() above
		expect(result.header!.type).toBe("session");
		expect(result.entries).toHaveLength(2);
		expect(result.leaf_id).toBe("e2");
	});

	it("sets leaf_id to last entry with an id", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			[
				JSON.stringify({ type: "session", id: "s1", cwd: "/p" }),
				JSON.stringify({ type: "message", id: "first" }),
				JSON.stringify({ type: "message", id: "last" }),
			].join("\n"),
		);

		const result = await get_session_entries("s1");
		expect(result.leaf_id).toBe("last");
	});

	it("handles entries without id field", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			[
				JSON.stringify({ type: "session", id: "s1", cwd: "/p" }),
				JSON.stringify({ type: "compaction", summary: "compacted" }),
			].join("\n"),
		);

		const result = await get_session_entries("s1");
		expect(result.entries).toHaveLength(1);
		expect(result.leaf_id).toBeNull();
	});

	it("skips blank and malformed lines", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			`${JSON.stringify({ type: "session", id: "s1", cwd: "/p" })}\n\nnot json\n${JSON.stringify({ type: "message", id: "e1" })}`,
		);

		const result = await get_session_entries("s1");
		expect(result.entries).toHaveLength(1);
		expect(result.header).not.toBeNull();
	});

	it("returns null header when no session type entry exists", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({ type: "message", id: "e1" }),
		);

		const result = await get_session_entries("s1");
		expect(result.header).toBeNull();
		expect(result.entries).toHaveLength(1);
	});
});
