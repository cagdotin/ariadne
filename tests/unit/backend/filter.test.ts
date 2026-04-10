import { describe, expect, it } from "vitest";
import {
	filter_sessions,
	session_matches,
} from "../../../backend/analytics/filter";
import type { SessionSummary } from "../../../backend/analytics/session-types";

function make_session(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		project_path: "/project/a",
		project_name: "a",
		session_dir: "dir",
		file_name: "session.jsonl",
		file_size_bytes: 1000,
		started_at: "2025-06-01T12:00:00Z",
		ended_at: "2025-06-01T13:00:00Z",
		duration_seconds: 3600,
		title: null,
		first_user_message: null,
		total_cost: 0.5,
		input_cost: 0.3,
		output_cost: 0.2,
		cache_read_cost: 0,
		cache_write_cost: 0,
		total_tokens: 5000,
		input_tokens: 3000,
		output_tokens: 2000,
		cache_read_tokens: 0,
		cache_write_tokens: 0,
		user_message_count: 3,
		assistant_message_count: 3,
		tool_result_count: 2,
		turn_count: 3,
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

// ── session_matches ─────────────────────────────────────────────────────

describe("session_matches", () => {
	const now = new Date("2025-06-10T00:00:00Z");

	it("matches all sessions when no filters applied", () => {
		expect(session_matches(make_session(), null, 0, now)).toBe(true);
	});

	it("filters by project_path", () => {
		expect(
			session_matches(make_session({ project_path: "/a" }), "/a", 0, now),
		).toBe(true);
		expect(
			session_matches(make_session({ project_path: "/a" }), "/b", 0, now),
		).toBe(false);
	});

	it("filters by range_days", () => {
		// Session started 9 days ago
		expect(session_matches(make_session(), null, 10, now)).toBe(true);
		expect(session_matches(make_session(), null, 5, now)).toBe(false);
	});

	it("range_days=0 means no time filter", () => {
		const old_session = make_session({ started_at: "2020-01-01T00:00:00Z" });
		expect(session_matches(old_session, null, 0, now)).toBe(true);
	});

	it("returns false for sessions with invalid timestamps", () => {
		const bad = make_session({ started_at: "not-a-date" });
		expect(session_matches(bad, null, 30, now)).toBe(false);
	});

	it("combines project_path and range_days filters", () => {
		const session = make_session({ project_path: "/a" });
		expect(session_matches(session, "/a", 10, now)).toBe(true);
		expect(session_matches(session, "/b", 10, now)).toBe(false);
		expect(session_matches(session, "/a", 1, now)).toBe(false);
	});

	it("boundary: session exactly at range_days boundary", () => {
		// Session 9 days old, range is 10 — age_days=9, 9 < 10 → true
		const nine_days_ago = new Date(now.getTime() - 9 * 86400000).toISOString();
		const session = make_session({ started_at: nine_days_ago });
		expect(session_matches(session, null, 10, now)).toBe(true);

		// Session 10 days old, range is 10 — age_days=10, 10 < 10 → false
		const ten_days_ago = new Date(now.getTime() - 10 * 86400000).toISOString();
		const session2 = make_session({ started_at: ten_days_ago });
		expect(session_matches(session2, null, 10, now)).toBe(false);
	});
});

// ── filter_sessions ─────────────────────────────────────────────────────

describe("filter_sessions", () => {
	it("returns all sessions with no filters", () => {
		const sessions = [make_session({ id: "a" }), make_session({ id: "b" })];
		expect(filter_sessions(sessions, null, 0)).toHaveLength(2);
	});

	it("filters by project path", () => {
		const sessions = [
			make_session({ id: "a", project_path: "/proj-a" }),
			make_session({ id: "b", project_path: "/proj-b" }),
		];
		const result = filter_sessions(sessions, "/proj-a", 0);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("a");
	});

	it("returns empty for no matches", () => {
		expect(filter_sessions([make_session()], "/nonexistent", 0)).toEqual([]);
	});

	it("returns empty for empty input", () => {
		expect(filter_sessions([], null, 0)).toEqual([]);
	});
});
