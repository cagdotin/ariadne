export { qmd_log_cache } from "./cache.js";

// Re-export cache methods as standalone functions for parity tests
import { qmd_log_cache } from "./cache.js";

export async function get_qmd_logs(project_path: string | null): Promise<unknown> {
  return qmd_log_cache.get_qmd_logs(project_path);
}

export async function get_qmd_log_stats(project_path: string | null): Promise<unknown> {
  return qmd_log_cache.get_qmd_log_stats(project_path);
}
