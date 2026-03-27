import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { QmdLogEntrySchema, QmdLogStatsSchema } from "@/schemas/qmd-logs";
import type { QmdLogEntry, QmdLogStats } from "@/schemas/qmd-logs";

export async function get_qmd_logs(project_path?: string): Promise<QmdLogEntry[]> {
  const raw = await invoke("get_qmd_logs", {
    projectPath: project_path ?? null,
  });
  return z.array(QmdLogEntrySchema).parse(raw);
}

export async function get_qmd_log_stats(project_path?: string): Promise<QmdLogStats> {
  const raw = await invoke("get_qmd_log_stats", {
    projectPath: project_path ?? null,
  });
  return QmdLogStatsSchema.parse(raw);
}
