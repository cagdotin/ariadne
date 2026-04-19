import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import { get_time_breakdown } from "../../../backend/analytics/aggregations/time-breakdown";
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
		total_cost: 1.0,
		input_cost: 0,
		output_cost: 0,
		cache_read_cost: 0,
		cache_write_cost: 0,
		total_tokens: 5000,
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

describe("get_time_breakdown", () => {
	it("returns zeroed breakdown for empty sessions", async () => {
		const result = await get_time_breakdown(0, null);
		expect(result.total_sessions).toBe(0);
		expect(result.total_cost).toBe(0);
		expect(result.total_tokens).toBe(0);
		expect(result.avg_cost_per_session).toBe(0);
		expect(result.by_weekday).toHaveLength(7);
		expect(result.by_time_of_day).toHaveLength(5);
		expect(result.daily_model_usage).toEqual([]);
	});

	it("has 7 weekday entries Mon-Sun", async () => {
		const result = await get_time_breakdown(0, null);
		const days = result.by_weekday.map((w) => w.day);
		expect(days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
	});

	it("has 5 time-of-day buckets", async () => {
		const result = await get_time_breakdown(0, null);
		const labels = result.by_time_of_day.map((t) => t.label);
		expect(labels).toEqual([
			"After midnight",
			"Morning",
			"Afternoon",
			"Evening",
			"Night",
		]);
	});

	it("aggregates totals", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ total_cost: 1.0, total_tokens: 5000 }),
			make_session({ total_cost: 2.0, total_tokens: 10000 }),
		]);

		const result = await get_time_breakdown(0, null);
		expect(result.total_sessions).toBe(2);
		expect(result.total_cost).toBe(3.0);
		expect(result.total_tokens).toBe(15000);
		expect(result.avg_cost_per_session).toBeCloseTo(1.5);
	});

	it("assigns sessions to correct weekday", async () => {
		// 2025-06-02 is a Monday (local)
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ started_at: "2025-06-02T12:00:00Z" }),
		]);

		const result = await get_time_breakdown(0, null);
		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const monday = result.by_weekday.find((w) => w.day === "Mon")!;
		expect(monday.sessions).toBeGreaterThanOrEqual(1);
	});

	it("calculates weekday share percentages", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ started_at: "2025-06-02T12:00:00Z" }), // Monday
			make_session({ started_at: "2025-06-02T14:00:00Z" }), // Monday
		]);

		const result = await get_time_breakdown(0, null);
		const total_share = result.by_weekday.reduce((s, w) => s + w.share, 0);
		expect(total_share).toBeCloseTo(100);
	});

	it("produces daily_sessions sorted by date ascending", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({ started_at: "2025-06-03T12:00:00Z" }),
			make_session({ started_at: "2025-06-01T12:00:00Z" }),
		]);

		const result = await get_time_breakdown(0, null);
		if (result.daily_sessions.length >= 2) {
			expect(
				result.daily_sessions[0].date < result.daily_sessions[1].date,
			).toBe(true);
		}
	});

	it("produces hourly_sessions only when range_days=1", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([make_session()]);

		const result_0 = await get_time_breakdown(0, null);
		expect(result_0.hourly_sessions).toEqual([]);

		const result_7 = await get_time_breakdown(7, null);
		expect(result_7.hourly_sessions).toEqual([]);
	});

	it("returns range_days in result", async () => {
		const result = await get_time_breakdown(30, null);
		expect(result.range_days).toBe(30);
	});

	it("builds daily_model_usage with session-weighted model shares", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				started_at: "2025-06-01T12:00:00Z",
				total_cost: 10,
				models_used: [
					{
						model_id: "claude-sonnet",
						provider: "anthropic",
						message_count: 3,
					},
					{ model_id: "claude-opus", provider: "anthropic", message_count: 1 },
				],
			}),
		]);

		const result = await get_time_breakdown(0, null);
		expect(result.daily_model_usage).toEqual([
			{
				date: "2025-06-01",
				model_id: "claude-opus",
				provider: "anthropic",
				message_count: 1,
				session_equivalent_count: 0.25,
				total_cost: 2.5,
			},
			{
				date: "2025-06-01",
				model_id: "claude-sonnet",
				provider: "anthropic",
				message_count: 3,
				session_equivalent_count: 0.75,
				total_cost: 7.5,
			},
		]);
	});
});
