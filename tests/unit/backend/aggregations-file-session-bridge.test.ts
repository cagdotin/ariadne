import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import { get_sessions_for_files } from "../../../backend/analytics/aggregations/file-session-bridge";
import { session_cache } from "../../../backend/analytics/session-cache";

function make_session(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		project_path: "/proj",
		project_name: "proj",
		session_dir: "dir",
		file_name: "s.jsonl",
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
	vi.mocked(session_cache.get_or_init).mockResolvedValue([]);
});

describe("get_sessions_for_files", () => {
	it("aggregates repeated file operations and sorts per-file results deterministically", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				read_files: {
					"src/a.ts": 2,
					"src/b.ts": 2,
				},
				edit_files: {
					"src/a.ts": 1,
				},
				write_files: {
					"src/b.ts": 1,
				},
			}),
		]);

		const result = await get_sessions_for_files("/proj", [], 0);
		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0].file_ops).toEqual([
			expect.objectContaining({
				path: "src/a.ts",
				read_count: 2,
				edit_count: 1,
				write_count: 0,
				total_count: 3,
			}),
			expect.objectContaining({
				path: "src/b.ts",
				read_count: 2,
				edit_count: 0,
				write_count: 1,
				total_count: 3,
			}),
		]);
	});

	it("does not widen an unmatched scoped query into all sessions", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				id: "s-match",
				read_files: { "src/match.ts": 1 },
			}),
			make_session({
				id: "s-other",
				read_files: { "src/other.ts": 5 },
			}),
		]);

		const result = await get_sessions_for_files("/proj", ["src/missing.ts"], 0);
		expect(result.sessions).toEqual([]);
	});

	it("breaks session ordering ties by started_at desc and session_id asc", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				id: "s-b",
				started_at: "2025-06-01T12:00:00Z",
				read_files: { "src/shared.ts": 2 },
			}),
			make_session({
				id: "s-a",
				started_at: "2025-06-01T12:00:00Z",
				read_files: { "src/shared.ts": 2 },
			}),
			make_session({
				id: "s-newer",
				started_at: "2025-06-02T12:00:00Z",
				read_files: { "src/shared.ts": 2 },
			}),
		]);

		const result = await get_sessions_for_files("/proj", [], 0);
		expect(result.sessions.map((session) => session.session_id)).toEqual([
			"s-newer",
			"s-a",
			"s-b",
		]);
	});
});
