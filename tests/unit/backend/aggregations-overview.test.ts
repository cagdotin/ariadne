import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

// Mock session cache before importing the module under test
vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: {
		get_or_init: vi.fn(),
	},
}));

import { get_analytics_overview } from "../../../backend/analytics/aggregations/overview";
import { session_cache } from "../../../backend/analytics/session-cache";

function make_session(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		project_path: "/proj/a",
		project_name: "a",
		session_dir: "dir",
		file_name: "s.jsonl",
		file_size_bytes: 1000,
		started_at: "2025-06-01T12:00:00Z",
		ended_at: "2025-06-01T13:00:00Z",
		duration_seconds: 3600,
		title: null,
		first_user_message: null,
		total_cost: 1.0,
		input_cost: 0.5,
		output_cost: 0.3,
		cache_read_cost: 0.1,
		cache_write_cost: 0.1,
		total_tokens: 5000,
		input_tokens: 3000,
		output_tokens: 1500,
		cache_read_tokens: 300,
		cache_write_tokens: 200,
		user_message_count: 3,
		assistant_message_count: 3,
		tool_result_count: 2,
		turn_count: 3,
		compaction_count: 1,
		tool_calls: {
			read: { name: "read", calls: 5, errors: 0 },
			bash: { name: "bash", calls: 3, errors: 1 },
		},
		bash_commands: { ls: 2, git: 1 },
		read_files: { "/a.ts": 3, "/b.ts": 2 },
		edit_files: { "/a.ts": 1 },
		write_files: { "/c.ts": 1 },
		models_used: [
			{ model_id: "claude-3", provider: "anthropic", message_count: 3 },
		],
		...overrides,
	};
}

beforeEach(() => {
	vi.mocked(session_cache.get_or_init).mockResolvedValue([]);
});

describe("get_analytics_overview", () => {
	it("returns zeroed overview for empty sessions", async () => {
		const result = await get_analytics_overview(null, 0);
		expect(result.total_sessions).toBe(0);
		expect(result.total_cost).toBe(0);
		expect(result.total_tokens).toBe(0);
		expect(result.total_projects).toBe(0);
		expect(result.avg_turns_per_session).toBe(0);
		expect(result.avg_session_duration_seconds).toBe(0);
	});

	it("aggregates totals across sessions", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ id: "s1", total_cost: 1.0, total_tokens: 5000 }),
			make_session({ id: "s2", total_cost: 2.0, total_tokens: 10000 }),
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.total_sessions).toBe(2);
		expect(result.total_cost).toBe(3.0);
		expect(result.total_tokens).toBe(15000);
	});

	it("groups projects correctly", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ project_path: "/a", project_name: "a" }),
			make_session({ project_path: "/a", project_name: "a" }),
			make_session({ project_path: "/b", project_name: "b" }),
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.total_projects).toBe(2);
		expect(result.projects).toHaveLength(2);
	});

	it("filters by project_path", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ project_path: "/a", total_cost: 1.0 }),
			make_session({ project_path: "/b", total_cost: 2.0 }),
		]);

		const result = await get_analytics_overview("/a", 0);
		expect(result.total_sessions).toBe(1);
		expect(result.total_cost).toBe(1.0);
	});

	it("aggregates tool calls", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);

		const result = await get_analytics_overview(null, 0);
		expect(result.total_tool_calls).toBe(8); // 5 read + 3 bash
		expect(result.total_tool_errors).toBe(1);
		expect(result.tools.find((t) => t.name === "read")?.total_calls).toBe(5);
	});

	it("aggregates model usage", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);

		const result = await get_analytics_overview(null, 0);
		expect(result.models).toHaveLength(1);
		expect(result.models[0].model_id).toBe("claude-3");
	});

	it("produces sessions_by_date and cost_by_date sorted", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ started_at: "2025-06-02T12:00:00Z" }),
			make_session({ started_at: "2025-06-01T12:00:00Z" }),
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.sessions_by_date.length).toBeGreaterThanOrEqual(1);
		// Should be sorted ascending
		for (let i = 1; i < result.sessions_by_date.length; i++) {
			expect(
				result.sessions_by_date[i].date >= result.sessions_by_date[i - 1].date,
			).toBe(true);
		}
	});

	it("limits top lists to 20 items", async () => {
		const many_files: Record<string, number> = {};
		for (let i = 0; i < 30; i++) many_files[`/file${i}.ts`] = i + 1;

		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ read_files: many_files }),
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.top_read_files.length).toBeLessThanOrEqual(20);
	});

	it("limits recent_sessions to 20", async () => {
		const sessions = Array.from({ length: 25 }, (_, i) =>
			make_session({
				id: `s${i}`,
				started_at: `2025-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
			}),
		);
		vi.mocked(session_cache.get_or_init).mockResolvedValue(sessions);

		const result = await get_analytics_overview(null, 0);
		expect(result.recent_sessions.length).toBe(20);
		// Should be sorted newest first
		expect(
			result.recent_sessions[0].started_at >
				result.recent_sessions[1].started_at,
		).toBe(true);
	});

	it("calculates average duration correctly", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ duration_seconds: 100 }),
			make_session({ duration_seconds: 200 }),
			make_session({ duration_seconds: null }), // excluded from avg
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.avg_session_duration_seconds).toBe(150);
	});

	it("calculates average turns per session", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ turn_count: 4 }),
			make_session({ turn_count: 6 }),
		]);

		const result = await get_analytics_overview(null, 0);
		expect(result.avg_turns_per_session).toBe(5);
	});
});
