import { z } from "zod";
import {
  day_count_schema,
  name_count_schema,
} from "../shared/primitives";

export const file_insight_record_schema = z.object({
  path: z.string(),
  read_count: z.number(),
  edit_count: z.number(),
  write_count: z.number(),
  total_count: z.number(),
  distinct_session_count: z.number(),
});
export type FileInsightRecord = z.infer<typeof file_insight_record_schema>;

export const file_size_result_schema = z.object({
  path: z.string(),
  size_bytes: z.number().nullable(),
});
export type FileSizeResult = z.infer<typeof file_size_result_schema>;

export const directory_stat_schema = z.object({
  path: z.string(),
  read_count: z.number(),
  edit_count: z.number(),
  write_count: z.number(),
  total: z.number(),
});
export type DirectoryStat = z.infer<typeof directory_stat_schema>;

export const project_file_stats_schema = z.object({
  project_path: z.string(),
  total_sessions: z.number(),
  tool_distribution: z.array(name_count_schema),
  read_files: z.array(name_count_schema),
  edit_files: z.array(name_count_schema),
  write_files: z.array(name_count_schema),
  bash_commands: z.array(name_count_schema),
  directory_stats: z.array(directory_stat_schema),
  activity_by_date: z.array(day_count_schema),
  file_insights: z.array(file_insight_record_schema),
});
export type ProjectFileStats = z.infer<typeof project_file_stats_schema>;
