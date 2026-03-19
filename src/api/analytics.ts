import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { SessionSummarySchema } from "../schemas/session";
import { AnalyticsOverviewSchema } from "../schemas/analytics";
import type { SessionSummary } from "../schemas/session";
import type { AnalyticsOverview } from "../schemas/analytics";

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