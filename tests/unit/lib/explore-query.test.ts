import { describe, expect, it } from "vitest";
import type { FileInsight } from "../../../src/lib/file-analytics";
import {
	derive_explore_session_query,
	get_scoped_file_paths,
	parse_excludes,
} from "../../../src/pages/explore/explore-query";

function make_insight(path: string): FileInsight {
	return {
		path,
		read_count: 1,
		edit_count: 0,
		write_count: 0,
		total_count: 1,
		distinct_session_count: 1,
	};
}

describe("explore-query", () => {
	it("parses comma-separated excludes", () => {
		expect(parse_excludes("node_modules, dist , , coverage")).toEqual([
			"node_modules",
			"dist",
			"coverage",
		]);
	});

	it("returns all-session query only for the true root scope", () => {
		const query = derive_explore_session_query({
			project_path: "/project",
			selected_path: "",
			file_stats_ready: false,
			filtered_insights: [],
		});

		expect(query).toEqual({
			kind: "all",
			file_paths: [],
			request_key: "all",
		});
	});

	it("keeps scoped queries pending until file stats are ready", () => {
		const query = derive_explore_session_query({
			project_path: "/project",
			selected_path: "src/components",
			file_stats_ready: false,
			filtered_insights: [],
		});

		expect(query).toEqual({ kind: "pending" });
	});

	it("returns empty_scope when a scoped path is filtered down to zero files", () => {
		const query = derive_explore_session_query({
			project_path: "/project",
			selected_path: "src/components",
			file_stats_ready: true,
			filtered_insights: [make_insight("src/lib/utils.ts")],
		});

		expect(query).toEqual({ kind: "empty_scope" });
	});

	it("returns concrete scoped file paths for matching descendants", () => {
		const filtered_insights = [
			make_insight("src/components/button.tsx"),
			make_insight("src/components/input.tsx"),
			make_insight("src/lib/utils.ts"),
		];

		expect(get_scoped_file_paths(filtered_insights, "src/components")).toEqual([
			"src/components/button.tsx",
			"src/components/input.tsx",
		]);

		const query = derive_explore_session_query({
			project_path: "/project",
			selected_path: "src/components",
			file_stats_ready: true,
			filtered_insights,
		});

		expect(query).toEqual({
			kind: "scoped",
			file_paths: ["src/components/button.tsx", "src/components/input.tsx"],
			request_key: "src/components/button.tsx\nsrc/components/input.tsx",
		});
	});
});
