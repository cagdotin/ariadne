import { z } from "zod";
import { SessionSummarySchema } from "./session";

export const DayCountSchema = z.object({
  date: z.string(),
  count: z.number(),
});
export type DayCount = z.infer<typeof DayCountSchema>;

export const DayCostSchema = z.object({
  date: z.string(),
  cost: z.number(),
});
export type DayCost = z.infer<typeof DayCostSchema>;

export const ProjectSummarySchema = z.object({
  name: z.string(),
  path: z.string(),
  session_count: z.number(),
  total_cost: z.number(),
  total_tokens: z.number(),
  last_active: z.string(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ModelAggregateSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
  total_cost: z.number(),
});
export type ModelAggregate = z.infer<typeof ModelAggregateSchema>;

export const ToolAggregateSchema = z.object({
  name: z.string(),
  total_calls: z.number(),
  total_errors: z.number(),
});
export type ToolAggregate = z.infer<typeof ToolAggregateSchema>;

export const AnalyticsOverviewSchema = z.object({
  total_sessions: z.number(),
  total_projects: z.number(),
  total_cost: z.number(),
  total_tokens: z.number(),
  sessions_by_date: z.array(DayCountSchema),
  cost_by_date: z.array(DayCostSchema),
  projects: z.array(ProjectSummarySchema),
  models: z.array(ModelAggregateSchema),
  tools: z.array(ToolAggregateSchema),
  recent_sessions: z.array(SessionSummarySchema),
});
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>;