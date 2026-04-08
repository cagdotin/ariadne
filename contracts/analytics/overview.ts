import { z } from "zod";
import { session_summary_schema } from "../sessions/summary";
import {
  day_count_schema,
  day_cost_schema,
  name_count_schema,
  project_summary_schema,
} from "../shared/primitives";

export const model_aggregate_schema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
  total_cost: z.number(),
});
export type ModelAggregate = z.infer<typeof model_aggregate_schema>;

export const tool_aggregate_schema = z.object({
  name: z.string(),
  total_calls: z.number(),
  total_errors: z.number(),
});
export type ToolAggregate = z.infer<typeof tool_aggregate_schema>;

export const analytics_overview_schema = z.object({
  total_sessions: z.number(),
  total_projects: z.number(),
  total_cost: z.number(),
  input_cost: z.number(),
  output_cost: z.number(),
  cache_read_cost: z.number(),
  cache_write_cost: z.number(),
  total_tokens: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  total_file_size_bytes: z.number(),
  total_tool_calls: z.number(),
  total_tool_errors: z.number(),
  avg_session_duration_seconds: z.number(),
  avg_turns_per_session: z.number(),
  total_compactions: z.number(),
  sessions_by_date: z.array(day_count_schema),
  cost_by_date: z.array(day_cost_schema),
  projects: z.array(project_summary_schema),
  models: z.array(model_aggregate_schema),
  tools: z.array(tool_aggregate_schema),
  top_bash_commands: z.array(name_count_schema),
  top_read_files: z.array(name_count_schema),
  top_edit_files: z.array(name_count_schema),
  top_write_files: z.array(name_count_schema),
  recent_sessions: z.array(session_summary_schema),
});
export type AnalyticsOverview = z.infer<typeof analytics_overview_schema>;
