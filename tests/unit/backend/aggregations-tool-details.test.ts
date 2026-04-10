import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("../../../backend/analytics/session-cache", () => ({
	session_cache: { get_or_init: vi.fn() },
}));

import { get_tool_details } from "../../../backend/analytics/aggregations/tool-details";
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

describe("get_tool_details", () => {
	it("returns zero stats for no sessions", async () => {
		const result = await get_tool_details("bash", null, 0);
		expect(result.tool_name).toBe("bash");
		expect(result.total_calls).toBe(0);
		expect(result.total_errors).toBe(0);
		expect(result.items).toEqual([]);
	});

	it("aggregates bash commands", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				tool_calls: { bash: { name: "bash", calls: 5, errors: 1 } },
				bash_commands: { ls: 3, git: 2 },
			}),
		]);

		const result = await get_tool_details("bash", null, 0);
		expect(result.total_calls).toBe(5);
		expect(result.total_errors).toBe(1);
		expect(result.items).toHaveLength(2);
		expect(result.items[0].name).toBe("ls"); // sorted by count desc
	});

	it("aggregates read files", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				tool_calls: { read: { name: "read", calls: 10, errors: 0 } },
				read_files: { "/a.ts": 6, "/b.ts": 4 },
			}),
		]);

		const result = await get_tool_details("read", null, 0);
		expect(result.total_calls).toBe(10);
		expect(result.items[0].name).toBe("/a.ts");
	});

	it("groups by project with top-5 items per project", async () => {
		const files: Record<string, number> = {};
		for (let i = 0; i < 10; i++) files[`/file${i}.ts`] = i + 1;

		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				tool_calls: { read: { name: "read", calls: 55, errors: 0 } },
				read_files: files,
			}),
		]);

		const result = await get_tool_details("read", null, 0);
		expect(result.by_project).toHaveLength(1);
		expect(result.by_project[0].items.length).toBeLessThanOrEqual(5);
	});

	it("returns null source for unknown tool type", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				tool_calls: {
					custom_tool: { name: "custom_tool", calls: 3, errors: 0 },
				},
			}),
		]);

		const result = await get_tool_details("custom_tool", null, 0);
		expect(result.total_calls).toBe(3);
		expect(result.items).toEqual([]); // no source mapping
	});

	it("produces by_date sorted ascending", async () => {
		vi.mocked(session_cache.get_or_init).mockResolvedValue([
			make_session({
				started_at: "2025-06-02T12:00:00Z",
				bash_commands: { ls: 1 },
				tool_calls: { bash: { name: "bash", calls: 1, errors: 0 } },
			}),
			make_session({
				started_at: "2025-06-01T12:00:00Z",
				bash_commands: { ls: 1 },
				tool_calls: { bash: { name: "bash", calls: 1, errors: 0 } },
			}),
		]);

		const result = await get_tool_details("bash", null, 0);
		expect(result.by_date.length).toBe(2);
		expect(result.by_date[0].date < result.by_date[1].date).toBe(true);
	});
});
