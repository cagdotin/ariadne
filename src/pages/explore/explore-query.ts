import type { FileSessionsResponse } from "@contracts/analytics/file-sessions";
import type { FileInsight } from "@/lib/file-analytics";

export const DEFAULT_EXPLORE_EXCLUDES =
	"node_modules, .git, dist, build, .next, __pycache__, target, .cache, .turbo, coverage";

export function parse_excludes(raw: string): string[] {
	return raw
		.split(",")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

export function filter_by_excludes(
	insights: FileInsight[],
	excludes: string[],
): FileInsight[] {
	if (excludes.length === 0) return insights;
	return insights.filter(
		(insight) => !excludes.some((exclude) => insight.path.includes(exclude)),
	);
}

export function get_scoped_file_paths(
	insights: FileInsight[],
	scope: string,
): string[] {
	if (!scope) return [];
	return [
		...new Set(
			insights
				.filter(
					(insight) =>
						insight.path === scope || insight.path.startsWith(`${scope}/`),
				)
				.map((insight) => insight.path),
		),
	];
}

export type ExploreSessionQuery =
	| {
			kind: "idle";
	  }
	| {
			kind: "pending";
	  }
	| {
			kind: "all";
			file_paths: string[];
			request_key: string;
	  }
	| {
			kind: "scoped";
			file_paths: string[];
			request_key: string;
	  }
	| {
			kind: "empty_scope";
	  };

export function derive_explore_session_query(options: {
	project_path: string | null;
	selected_path: string;
	file_stats_ready: boolean;
	filtered_insights: FileInsight[];
}): ExploreSessionQuery {
	const { project_path, selected_path, file_stats_ready, filtered_insights } =
		options;

	if (!project_path) {
		return { kind: "idle" };
	}

	if (!selected_path) {
		return {
			kind: "all",
			file_paths: [],
			request_key: "all",
		};
	}

	if (!file_stats_ready) {
		return { kind: "pending" };
	}

	const file_paths = get_scoped_file_paths(filtered_insights, selected_path);
	if (file_paths.length === 0) {
		return { kind: "empty_scope" };
	}

	return {
		kind: "scoped",
		file_paths,
		request_key: file_paths.join("\n"),
	};
}

export function make_empty_file_sessions_response(
	project_path: string,
): FileSessionsResponse {
	return {
		project_path,
		queried_paths: [],
		sessions: [],
	};
}
