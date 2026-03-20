import { z } from "zod";

export const ToolCallSummarySchema = z.object({
  name: z.string(),
  calls: z.number(),
  errors: z.number(),
});
export type ToolCallSummary = z.infer<typeof ToolCallSummarySchema>;

export const ModelUsageSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
});
export type ModelUsage = z.infer<typeof ModelUsageSchema>;

export const SessionSummarySchema = z.object({
  id: z.string(),
  project_path: z.string(),
  project_name: z.string(),
  session_dir: z.string(),
  file_name: z.string(),
  file_size_bytes: z.number(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  title: z.string().nullable(),
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
  user_message_count: z.number(),
  assistant_message_count: z.number(),
  tool_result_count: z.number(),
  turn_count: z.number(),
  compaction_count: z.number(),
  tool_calls: z.record(z.string(), ToolCallSummarySchema),
  bash_commands: z.record(z.string(), z.number()),
  read_files: z.record(z.string(), z.number()),
  edit_files: z.record(z.string(), z.number()),
  write_files: z.record(z.string(), z.number()),
  models_used: z.array(ModelUsageSchema),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;