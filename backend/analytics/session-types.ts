/**
 * TypeScript types for session analytics, faithfully ported from
 * src-tauri/src/models/session.rs.
 *
 * These types are structurally compatible with the Zod schemas in
 * contracts/sessions/summary.ts.
 */

export interface SessionFile {
  path: string;
  dir_name: string;
  file_name: string;
  file_size: number;
}

export interface ToolCallSummary {
  name: string;
  calls: number;
  errors: number;
}

export interface ModelUsage {
  model_id: string;
  provider: string;
  message_count: number;
}

export interface SessionSummary {
  id: string;
  project_path: string;
  project_name: string;
  session_dir: string;
  file_name: string;
  file_size_bytes: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  title: string | null;
  first_user_message: string | null;
  // Costs
  total_cost: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_write_cost: number;
  // Tokens
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  // Activity
  user_message_count: number;
  assistant_message_count: number;
  tool_result_count: number;
  turn_count: number;
  compaction_count: number;
  // Tool breakdown
  tool_calls: Record<string, ToolCallSummary>;
  // Tool call details
  bash_commands: Record<string, number>;
  read_files: Record<string, number>;
  edit_files: Record<string, number>;
  write_files: Record<string, number>;
  // Models used
  models_used: ModelUsage[];
}
