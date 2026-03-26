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

export const NameCountSchema = z.object({
  name: z.string(),
  count: z.number(),
});
export type NameCount = z.infer<typeof NameCountSchema>;

export const AnalyticsOverviewSchema = z.object({
  total_sessions: z.number(),
  total_projects: z.number(),
  total_cost: z.number(),
  input_cost: z.number(),
  output_cost: z.number(),
  cache_read_cost: z.number(),
  cache_write_cost: z.number(),
  total_tokens: z.number(),
  total_file_size_bytes: z.number(),
  sessions_by_date: z.array(DayCountSchema),
  cost_by_date: z.array(DayCostSchema),
  projects: z.array(ProjectSummarySchema),
  models: z.array(ModelAggregateSchema),
  tools: z.array(ToolAggregateSchema),
  top_bash_commands: z.array(NameCountSchema),
  top_read_files: z.array(NameCountSchema),
  top_edit_files: z.array(NameCountSchema),
  top_write_files: z.array(NameCountSchema),
  recent_sessions: z.array(SessionSummarySchema),
});
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>;

export const DirectoryStatSchema = z.object({
  path: z.string(),
  read_count: z.number(),
  edit_count: z.number(),
  write_count: z.number(),
  total: z.number(),
});
export type DirectoryStat = z.infer<typeof DirectoryStatSchema>;

export const ProjectFileStatsSchema = z.object({
  project_path: z.string(),
  total_sessions: z.number(),
  tool_distribution: z.array(NameCountSchema),
  read_files: z.array(NameCountSchema),
  edit_files: z.array(NameCountSchema),
  write_files: z.array(NameCountSchema),
  bash_commands: z.array(NameCountSchema),
  directory_stats: z.array(DirectoryStatSchema),
  activity_by_date: z.array(DayCountSchema),
});
export type ProjectFileStats = z.infer<typeof ProjectFileStatsSchema>;

export const ProjectToolSummarySchema = z.object({
  project_name: z.string(),
  total_calls: z.number(),
  items: z.array(NameCountSchema),
});
export type ProjectToolSummary = z.infer<typeof ProjectToolSummarySchema>;

export const WeekdayStatSchema = z.object({
  day: z.string(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});
export type WeekdayStat = z.infer<typeof WeekdayStatSchema>;

export const TimeOfDayStatSchema = z.object({
  label: z.string(),
  hour_start: z.number(),
  hour_end: z.number(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});
export type TimeOfDayStat = z.infer<typeof TimeOfDayStatSchema>;

export const TimeBreakdownSchema = z.object({
  range_days: z.number(),
  total_sessions: z.number(),
  total_cost: z.number(),
  avg_cost_per_session: z.number(),
  total_tokens: z.number(),
  by_weekday: z.array(WeekdayStatSchema),
  by_time_of_day: z.array(TimeOfDayStatSchema),
  daily_sessions: z.array(DayCountSchema),
  daily_cost: z.array(DayCostSchema),
});
export type TimeBreakdown = z.infer<typeof TimeBreakdownSchema>;

export const ToolDetailResponseSchema = z.object({
  tool_name: z.string(),
  total_calls: z.number(),
  total_errors: z.number(),
  items: z.array(NameCountSchema),
  by_project: z.array(ProjectToolSummarySchema),
  by_date: z.array(DayCountSchema),
});
export type ToolDetailResponse = z.infer<typeof ToolDetailResponseSchema>;