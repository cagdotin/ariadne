import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import {
	get_all_sessions,
	get_session_detail,
} from "../../../backend/analytics/query";
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

describe("get_all_sessions", () => {
	it("returns empty for no sessions", async () => {
		const result = await get_all_sessions(null, 0);
		expect(result).toEqual([]);
	});

	it("returns all sessions when no filters", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "a" }),
			make_session({ id: "b" }),
		]);

		const result = await get_all_sessions(null, 0);
		expect(result).toHaveLength(2);
	});

	it("filters by project_path", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "a", project_path: "/a" }),
			make_session({ id: "b", project_path: "/b" }),
		]);

		const result = await get_all_sessions("/a", 0);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("a");
	});

	it("sorts by started_at descending (newest first)", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "old", started_at: "2025-01-01T00:00:00Z" }),
			make_session({ id: "new", started_at: "2025-06-01T00:00:00Z" }),
			make_session({ id: "mid", started_at: "2025-03-01T00:00:00Z" }),
		]);

		const result = await get_all_sessions(null, 0);
		expect(result.map((s) => s.id)).toEqual(["new", "mid", "old"]);
	});
});

describe("get_session_detail", () => {
	it("returns the matching session", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "target", title: "My Session" }),
			make_session({ id: "other" }),
		]);

		const result = await get_session_detail("target");
		expect(result.id).toBe("target");
		expect(result.title).toBe("My Session");
	});

	it("throws for non-existent session", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "exists" }),
		]);

		await expect(get_session_detail("missing")).rejects.toThrow(
			"Session with id missing not found",
		);
	});

	it("throws for empty sessions list", async () => {
		await expect(get_session_detail("any")).rejects.toThrow(
			"Session with id any not found",
		);
	});
});
