import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
	get_file_sizes,
	list_projects,
} from "../../../backend/analytics/helpers";
import type { SessionSummary } from "../../../backend/analytics/session-types";

vi.mock("node:fs");

function make_session(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		project_path: "/project/a",
		project_name: "a",
		session_dir: "dir",
		file_name: "session.jsonl",
		file_size_bytes: 1000,
		started_at: "2025-06-01T12:00:00Z",
		ended_at: null,
		duration_seconds: null,
		title: null,
		first_user_message: null,
		total_cost: 0.5,
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

// ── get_file_sizes ──────────────────────────────────────────────────────

describe("get_file_sizes", () => {
	it("returns file sizes for accessible paths", () => {
		vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats);

		const result = get_file_sizes(["/a.ts", "/b.ts"]);
		expect(result).toEqual([
			{ path: "/a.ts", size_bytes: 1024 },
			{ path: "/b.ts", size_bytes: 1024 },
		]);
	});

	it("returns null for inaccessible paths", () => {
		vi.mocked(fs.statSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});

		const result = get_file_sizes(["/missing.ts"]);
		expect(result).toEqual([{ path: "/missing.ts", size_bytes: null }]);
	});

	it("handles mixed accessible and inaccessible paths", () => {
		vi.mocked(fs.statSync).mockImplementation((p) => {
			if (p === "/exists.ts") return { size: 512 } as fs.Stats;
			throw new Error("ENOENT");
		});

		const result = get_file_sizes(["/exists.ts", "/missing.ts"]);
		expect(result[0].size_bytes).toBe(512);
		expect(result[1].size_bytes).toBeNull();
	});

	it("returns empty for empty input", () => {
		expect(get_file_sizes([])).toEqual([]);
	});
});

// ── list_projects ───────────────────────────────────────────────────────

describe("list_projects", () => {
	it("groups sessions by project_path", () => {
		const sessions = [
			make_session({
				project_path: "/a",
				project_name: "a",
				total_cost: 1,
				total_tokens: 100,
			}),
			make_session({
				project_path: "/a",
				project_name: "a",
				total_cost: 2,
				total_tokens: 200,
			}),
			make_session({
				project_path: "/b",
				project_name: "b",
				total_cost: 0.5,
				total_tokens: 50,
			}),
		];

		const projects = list_projects(sessions);
		expect(projects).toHaveLength(2);

		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const proj_a = projects.find((p) => p.path === "/a")!;
		expect(proj_a.session_count).toBe(2);
		expect(proj_a.total_cost).toBe(3);
		expect(proj_a.total_tokens).toBe(300);
	});

	it("sorts by session_count descending", () => {
		const sessions = [
			make_session({ project_path: "/few" }),
			make_session({ project_path: "/many" }),
			make_session({ project_path: "/many" }),
			make_session({ project_path: "/many" }),
		];

		const projects = list_projects(sessions);
		expect(projects[0].path).toBe("/many");
		expect(projects[1].path).toBe("/few");
	});

	it("tracks last_active as most recent started_at", () => {
		const sessions = [
			make_session({ project_path: "/a", started_at: "2025-01-01T00:00:00Z" }),
			make_session({ project_path: "/a", started_at: "2025-06-01T00:00:00Z" }),
			make_session({ project_path: "/a", started_at: "2025-03-01T00:00:00Z" }),
		];

		const projects = list_projects(sessions);
		expect(projects[0].last_active).toBe("2025-06-01T00:00:00Z");
	});

	it("returns empty for empty sessions", () => {
		expect(list_projects([])).toEqual([]);
	});

	it("uses project_name from first session for each project", () => {
		const sessions = [
			make_session({ project_path: "/p", project_name: "my-project" }),
		];

		const projects = list_projects(sessions);
		expect(projects[0].name).toBe("my-project");
	});
});
