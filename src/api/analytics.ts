import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { SessionSummarySchema } from "../schemas/session";
import { AnalyticsOverviewSchema, ToolDetailResponseSchema, ProjectFileStatsSchema, TimeBreakdownSchema, ProjectSummarySchema, FileSizeResultSchema } from "../schemas/analytics";
import type { SessionSummary } from "../schemas/session";
import type { AnalyticsOverview, ToolDetailResponse, ProjectFileStats, TimeBreakdown, ProjectSummary, FileSizeResult } from "../schemas/analytics";
import type { SessionEntriesResponse } from "../components/session-viewer/types";

export async function list_projects(): Promise<ProjectSummary[]> {
  const raw = await invoke("list_projects");
  return z.array(ProjectSummarySchema).parse(raw);
}

export async function get_analytics_overview(project_path?: string, range_days?: number): Promise<AnalyticsOverview> {
  const raw = await invoke("get_analytics_overview", {
    projectPath: project_path ?? null,
    rangeDays: range_days ?? null,
  });
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_session_detail(session_id: string): Promise<SessionSummary> {
  const raw = await invoke("get_session_detail", { sessionId: session_id });
  return SessionSummarySchema.parse(raw);
}

export async function get_all_sessions(project_path?: string): Promise<SessionSummary[]> {
  const raw = await invoke("get_all_sessions", { projectPath: project_path ?? null });
  return z.array(SessionSummarySchema).parse(raw);
}

export async function resync_sessions(): Promise<AnalyticsOverview> {
  const raw = await invoke("resync_sessions");
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_project_file_stats(project_path: string, range_days?: number): Promise<ProjectFileStats> {
  const raw = await invoke("get_project_file_stats", {
    projectPath: project_path,
    rangeDays: range_days ?? null,
  });
  return ProjectFileStatsSchema.parse(raw);
}

export async function get_time_breakdown(range_days: number, project_path?: string): Promise<TimeBreakdown> {
  const raw = await invoke("get_time_breakdown", { rangeDays: range_days, projectPath: project_path ?? null });
  return TimeBreakdownSchema.parse(raw);
}

export async function get_session_entries(session_id: string): Promise<SessionEntriesResponse> {
  const raw = await invoke("get_session_entries", { sessionId: session_id });
  return raw as SessionEntriesResponse;
}

export async function get_tool_details(
  tool_name: string,
  project_path?: string,
): Promise<ToolDetailResponse> {
  const raw = await invoke("get_tool_details", {
    toolName: tool_name,
    projectPath: project_path ?? null,
  });
  return ToolDetailResponseSchema.parse(raw);
}

export async function get_file_sizes(paths: string[]): Promise<FileSizeResult[]> {
  const raw = await invoke("get_file_sizes", { paths });
  return z.array(FileSizeResultSchema).parse(raw);
}
