import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  session_summary_schema,
  type SessionSummary,
} from "@contracts/sessions/summary";
import {
  session_entries_response_schema,
} from "@contracts/sessions/replay";
import {
  analytics_overview_schema,
  type AnalyticsOverview,
} from "@contracts/analytics/overview";
import {
  project_file_stats_schema,
  file_size_result_schema,
  type ProjectFileStats,
  type FileSizeResult,
} from "@contracts/analytics/files";
import {
  tool_detail_response_schema,
  type ToolDetailResponse,
} from "@contracts/analytics/tools";
import {
  time_breakdown_schema,
  type TimeBreakdown,
} from "@contracts/analytics/time";
import {
  project_summary_schema,
  type ProjectSummary,
} from "@contracts/shared/primitives";
import type { SessionEntriesResponse } from "../components/session-viewer/types";

export async function list_projects(): Promise<ProjectSummary[]> {
  const raw = await invoke("list_projects");
  return z.array(project_summary_schema).parse(raw);
}

export async function get_analytics_overview(project_path?: string, range_days?: number): Promise<AnalyticsOverview> {
  const raw = await invoke("get_analytics_overview", {
    projectPath: project_path ?? null,
    rangeDays: range_days ?? null,
  });
  return analytics_overview_schema.parse(raw);
}

export async function get_session_detail(session_id: string): Promise<SessionSummary> {
  const raw = await invoke("get_session_detail", { sessionId: session_id });
  return session_summary_schema.parse(raw);
}

export async function get_all_sessions(project_path?: string, range_days?: number): Promise<SessionSummary[]> {
  const raw = await invoke("get_all_sessions", {
    projectPath: project_path ?? null,
    rangeDays: range_days ?? null,
  });
  return z.array(session_summary_schema).parse(raw);
}

export async function resync_sessions(): Promise<AnalyticsOverview> {
  const raw = await invoke("resync_sessions");
  return analytics_overview_schema.parse(raw);
}

export async function get_project_file_stats(project_path: string, range_days?: number): Promise<ProjectFileStats> {
  const raw = await invoke("get_project_file_stats", {
    projectPath: project_path,
    rangeDays: range_days ?? null,
  });
  return project_file_stats_schema.parse(raw);
}

export async function get_time_breakdown(range_days: number, project_path?: string): Promise<TimeBreakdown> {
  const raw = await invoke("get_time_breakdown", { rangeDays: range_days, projectPath: project_path ?? null });
  return time_breakdown_schema.parse(raw);
}

export async function get_session_entries(session_id: string): Promise<SessionEntriesResponse> {
  const raw = await invoke("get_session_entries", { sessionId: session_id });
  // Validate wire structure with permissive contract schema
  session_entries_response_schema.parse(raw);
  // Return with detailed component-level types (downstream components narrow by entry.type)
  return raw as SessionEntriesResponse;
}

export async function get_tool_details(
  tool_name: string,
  project_path?: string,
  range_days?: number,
): Promise<ToolDetailResponse> {
  const raw = await invoke("get_tool_details", {
    toolName: tool_name,
    projectPath: project_path ?? null,
    rangeDays: range_days ?? null,
  });
  return tool_detail_response_schema.parse(raw);
}

export async function get_file_sizes(paths: string[]): Promise<FileSizeResult[]> {
  const raw = await invoke("get_file_sizes", { paths });
  return z.array(file_size_result_schema).parse(raw);
}
