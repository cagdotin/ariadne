import { z } from "zod";

export const QmdLogEntrySchema = z.object({
  id: z.string(),
  session_id: z.string(),
  project_path: z.string(),
  project_name: z.string(),
  timestamp: z.string(),
  tool_call_id: z.string(),
  raw_command: z.string(),
  subcommand: z.string(),
  primary_argument: z.string().nullable(),
  index_name: z.string().nullable(),
  collections: z.array(z.string()),
  is_error: z.boolean(),
  has_output: z.boolean(),
  output_text: z.string(),
  output_preview: z.string(),
  output_kind: z.string(),
});
export type QmdLogEntry = z.infer<typeof QmdLogEntrySchema>;

export const QmdLogStatsSchema = z.object({
  total_calls: z.number(),
  error_calls: z.number(),
  unique_projects: z.number(),
  unique_sessions: z.number(),
  by_subcommand: z.record(z.string(), z.number()),
});
export type QmdLogStats = z.infer<typeof QmdLogStatsSchema>;
