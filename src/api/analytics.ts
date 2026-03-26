import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { SessionSummarySchema } from "../schemas/session";
import { AnalyticsOverviewSchema, ToolDetailResponseSchema, ProjectFileStatsSchema, TimeBreakdownSchema, ProjectSummarySchema } from "../schemas/analytics";
import type { SessionSummary } from "../schemas/session";
import type { AnalyticsOverview, ToolDetailResponse, ProjectFileStats, TimeBreakdown, ProjectSummary } from "../schemas/analytics";
import type { SessionEntriesResponse } from "../components/session-viewer/types";

export async function list_projects(): Promise<ProjectSummary[]> {
  const raw = await invoke("list_projects");
  return z.array(ProjectSummarySchema).parse(raw);
}

export async function get_analytics_overview(project_path?: string): Promise<AnalyticsOverview> {
  const raw = await invoke("get_analytics_overview", { projectPath: project_path ?? null });
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_project_sessions(project_name: string): Promise<SessionSummary[]> {
  const raw = await invoke("get_project_sessions", { projectName: project_name });
  return z.array(SessionSummarySchema).parse(raw);
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

export async function get_project_file_stats(project_name: string): Promise<ProjectFileStats> {
  const raw = await invoke("get_project_file_stats", { projectName: project_name });
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
