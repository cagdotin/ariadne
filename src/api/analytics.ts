import {
	type FileSessionsResponse,
	file_sessions_response_schema,
} from "@contracts/analytics/file-sessions";
import {
	type FileSizeResult,
	file_size_result_schema,
	type ProjectFileStats,
	project_file_stats_schema,
} from "@contracts/analytics/files";
import {
	type AnalyticsOverview,
	analytics_overview_schema,
} from "@contracts/analytics/overview";
import {
	type TimeBreakdown,
	time_breakdown_schema,
} from "@contracts/analytics/time";
import {
	type ToolDetailResponse,
	tool_detail_response_schema,
} from "@contracts/analytics/tools";
import { session_entries_response_schema } from "@contracts/sessions/replay";
import {
	type SessionSummary,
	session_summary_schema,
} from "@contracts/sessions/summary";
import {
	type ProjectSummary,
	project_summary_schema,
} from "@contracts/shared/primitives";
import { z } from "zod";
import type { SessionEntriesResponse } from "@/components/session-viewer/types";
import { commands } from "@/platform/ipc";

export async function list_projects(): Promise<ProjectSummary[]> {
	const raw = await commands.analytics.list_projects();
	return z.array(project_summary_schema).parse(raw);
}

export async function get_analytics_overview(
	project_path?: string,
	range_days?: number,
): Promise<AnalyticsOverview> {
	const raw = await commands.analytics.get_analytics_overview({
		projectPath: project_path ?? null,
		rangeDays: range_days ?? null,
	});
	return analytics_overview_schema.parse(raw);
}

export async function get_session_detail(
	session_id: string,
): Promise<SessionSummary> {
	const raw = await commands.analytics.get_session_detail({
		sessionId: session_id,
	});
	return session_summary_schema.parse(raw);
}

export async function get_all_sessions(
	project_path?: string,
	range_days?: number,
): Promise<SessionSummary[]> {
	const raw = await commands.analytics.get_all_sessions({
		projectPath: project_path ?? null,
		rangeDays: range_days ?? null,
	});
	return z.array(session_summary_schema).parse(raw);
}

export async function resync_sessions(): Promise<AnalyticsOverview> {
	const raw = await commands.analytics.resync_sessions();
	return analytics_overview_schema.parse(raw);
}

export async function get_project_file_stats(
	project_path: string,
	range_days?: number,
): Promise<ProjectFileStats> {
	const raw = await commands.analytics.get_project_file_stats({
		projectPath: project_path,
		rangeDays: range_days ?? null,
	});
	return project_file_stats_schema.parse(raw);
}

export async function get_time_breakdown(
	range_days: number,
	project_path?: string,
): Promise<TimeBreakdown> {
	const raw = await commands.analytics.get_time_breakdown({
		rangeDays: range_days,
		projectPath: project_path ?? null,
	});
	return time_breakdown_schema.parse(raw);
}

export async function get_session_entries(
	session_id: string,
): Promise<SessionEntriesResponse> {
	const raw = await commands.analytics.get_session_entries({
		sessionId: session_id,
	});
	// Validate with strict discriminated-union schema, then return as
	// component-level types (structurally identical, downstream narrows by entry.type)
	return session_entries_response_schema.parse(raw) as SessionEntriesResponse;
}

export async function get_tool_details(
	tool_name: string,
	project_path?: string,
	range_days?: number,
): Promise<ToolDetailResponse> {
	const raw = await commands.analytics.get_tool_details({
		toolName: tool_name,
		projectPath: project_path ?? null,
		rangeDays: range_days ?? null,
	});
	return tool_detail_response_schema.parse(raw);
}

export async function get_file_sizes(
	paths: string[],
): Promise<FileSizeResult[]> {
	const raw = await commands.analytics.get_file_sizes({ paths });
	return z.array(file_size_result_schema).parse(raw);
}

export async function get_sessions_for_files(
	project_path: string,
	file_paths: string[],
	range_days?: number,
): Promise<FileSessionsResponse> {
	const raw = await commands.analytics.get_sessions_for_files({
		projectPath: project_path,
		filePaths: file_paths,
		rangeDays: range_days ?? null,
	});
	return file_sessions_response_schema.parse(raw);
}
