/**
 * QMD log cache — faithful port of
 * src-tauri/src/qmd_log_cache.rs :: QmdLogCache
 */

import type { QmdLogEntry, QmdLogStats } from "../../contracts/qmd-logs/entries.js";

import { discover_session_files } from "../analytics/discovery.js";
import { parse_qmd_logs_from_session } from "./parser.js";

class QmdLogCache {
  private data: QmdLogEntry[] | null = null;

  /**
   * Lazily initialize the cache on first request.
   */
  async get_or_init(): Promise<QmdLogEntry[]> {
    if (this.data !== null) {
      return this.data;
    }

    const entries = this.build_entries();
    this.data = entries;
    return entries;
  }

  /**
   * Scan session files and build the full entry list.
   */
  private build_entries(): QmdLogEntry[] {
    const session_files = discover_session_files();
    const all_entries: QmdLogEntry[] = [];

    for (const session_file of session_files) {
      try {
        const entries = parse_qmd_logs_from_session(
          session_file.path,
          session_file.dir_name,
        );
        all_entries.push(...entries);
      } catch (e) {
        console.error(
          `Failed to parse QMD logs from ${session_file.path}: ${e}`,
        );
      }
    }

    // Sort by timestamp descending (newest first)
    all_entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return all_entries;
  }

  /**
   * Get all QMD log entries, optionally filtered by project path.
   */
  async get_qmd_logs(project_path: string | null): Promise<QmdLogEntry[]> {
    const all = await this.get_or_init();

    if (project_path !== null) {
      return all.filter((e) => e.project_path === project_path);
    }
    return all;
  }

  /**
   * Get lightweight stats, optionally filtered by project path.
   */
  async get_qmd_log_stats(project_path: string | null): Promise<QmdLogStats> {
    const all = await this.get_or_init();

    const filtered =
      project_path !== null
        ? all.filter((e) => e.project_path === project_path)
        : all;

    const total_calls = filtered.length;
    const error_calls = filtered.filter((e) => e.is_error).length;

    const projects = new Set<string>();
    const sessions = new Set<string>();
    const by_subcommand: Record<string, number> = {};

    for (const entry of filtered) {
      projects.add(entry.project_path);
      sessions.add(entry.session_id);
      by_subcommand[entry.subcommand] =
        (by_subcommand[entry.subcommand] ?? 0) + 1;
    }

    return {
      total_calls,
      error_calls,
      unique_projects: projects.size,
      unique_sessions: sessions.size,
      by_subcommand,
    };
  }

  /**
   * Invalidate the cache. Next request will rebuild it lazily.
   */
  invalidate(): void {
    this.data = null;
  }
}

/** Singleton cache instance. */
export const qmd_log_cache = new QmdLogCache();

/** Convenience: invalidate the QMD log cache (called from analytics resync). */
export function invalidate_qmd_log_cache(): void {
  qmd_log_cache.invalidate();
}
