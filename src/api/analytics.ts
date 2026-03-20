import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { SessionSummarySchema } from "../schemas/session";
import { AnalyticsOverviewSchema, ToolDetailResponseSchema, ProjectFileStatsSchema, TimeBreakdownSchema } from "../schemas/analytics";
import type { SessionSummary } from "../schemas/session";
import type { AnalyticsOverview, ToolDetailResponse, ProjectFileStats, TimeBreakdown } from "../schemas/analytics";

export async function get_analytics_overview(): Promise<AnalyticsOverview> {
  const raw = await invoke("get_analytics_overview");
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

export async function get_all_sessions(project_name?: string): Promise<SessionSummary[]> {
  const raw = await invoke("get_all_sessions", { projectName: project_name ?? null });
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

export async function get_time_breakdown(range_days: number): Promise<TimeBreakdown> {
  const raw = await invoke("get_time_breakdown", { rangeDays: range_days });
  return TimeBreakdownSchema.parse(raw);
}

export async function get_tool_details(
  tool_name: string,
  project_name?: string,
): Promise<ToolDetailResponse> {
  const raw = await invoke("get_tool_details", {
    toolName: tool_name,
    projectName: project_name ?? null,
  });
  return ToolDetailResponseSchema.parse(raw);
}