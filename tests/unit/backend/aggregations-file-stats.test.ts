import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import { get_project_file_stats } from "../../../backend/analytics/aggregations/file-stats";
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

describe("get_project_file_stats", () => {
	it("returns empty stats for no matching sessions", async () => {
		const result = await get_project_file_stats("/proj", 0);
		expect(result.total_sessions).toBe(0);
		expect(result.read_files).toEqual([]);
		expect(result.file_insights).toEqual([]);
	});

	it("aggregates file operations across sessions", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				id: "s1",
				read_files: { "/a.ts": 3 },
				edit_files: { "/a.ts": 1 },
			}),
			make_session({
				id: "s2",
				read_files: { "/a.ts": 2 },
				write_files: { "/b.ts": 1 },
			}),
		]);

		const result = await get_project_file_stats("/proj", 0);
		expect(result.total_sessions).toBe(2);

		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const a_insight = result.file_insights.find((f) => f.path === "/a.ts")!;
		expect(a_insight.read_count).toBe(5);
		expect(a_insight.edit_count).toBe(1);
		expect(a_insight.total_count).toBe(6);
		expect(a_insight.distinct_session_count).toBe(2);
	});

	it("produces tool distribution sorted by count", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				tool_calls: {
					read: { name: "read", calls: 10, errors: 0 },
					bash: { name: "bash", calls: 3, errors: 0 },
				},
			}),
		]);

		const result = await get_project_file_stats("/proj", 0);
		expect(result.tool_distribution[0].name).toBe("read");
		expect(result.tool_distribution[0].count).toBe(10);
	});

	it("produces directory stats from file paths", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				read_files: { "/proj/src/a.ts": 5, "/proj/src/b.ts": 3 },
				edit_files: { "/proj/lib/c.ts": 2 },
			}),
		]);

		const result = await get_project_file_stats("/proj", 0);
		expect(result.directory_stats.length).toBeGreaterThanOrEqual(2);

		const src_dir = result.directory_stats.find((d) => d.path.endsWith("src"));
		expect(src_dir).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: test assertion on known non-null value
		expect(src_dir!.read_count).toBe(8);
	});

	it("sorts file insights by total_count descending", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				read_files: { "/a.ts": 1, "/b.ts": 10, "/c.ts": 5 },
			}),
		]);

		const result = await get_project_file_stats("/proj", 0);
		expect(result.file_insights[0].path).toBe("/b.ts");
		expect(result.file_insights[1].path).toBe("/c.ts");
		expect(result.file_insights[2].path).toBe("/a.ts");
	});

	it("only includes sessions matching project_path", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ project_path: "/proj", read_files: { "/a.ts": 1 } }),
			make_session({ project_path: "/other", read_files: { "/b.ts": 1 } }),
		]);

		const result = await get_project_file_stats("/proj", 0);
		expect(result.total_sessions).toBe(1);
		expect(result.read_files).toHaveLength(1);
		expect(result.read_files[0].name).toBe("/a.ts");
	});
});
