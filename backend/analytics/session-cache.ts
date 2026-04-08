/**
 * Session cache — faithful port of
 * src-tauri/src/cache.rs :: SessionCache
 */

import type { SessionSummary } from "./session-types.js";
import { discover_session_files } from "./discovery.js";
import { parse_session_file } from "./session-parser.js";
import { invalidate_qmd_log_cache } from "../qmd-logs/cache.js";

class SessionCache {
  private data: SessionSummary[] | null = null;

  /**
   * Get all sessions from cache, initializing if needed.
   */
  async get_or_init(): Promise<SessionSummary[]> {
    if (this.data !== null) {
      return this.data;
    }
    return this.resync();
  }

  /**
   * Force resync — clear cache and re-parse all sessions.
   */
  async resync(): Promise<SessionSummary[]> {
    const session_files = discover_session_files();
    const all_sessions: SessionSummary[] = [];

    for (const session_file of session_files) {
      const session = parse_session_file(session_file);
      if (session !== null) {
        all_sessions.push(session);
      }
    }

    this.data = all_sessions;

    // Invalidate QMD log cache so it rebuilds on next request
    try {
      invalidate_qmd_log_cache();
    } catch {
      // QMD log cache may not be wired yet — skip
    }

    return all_sessions;
  }
}

/** Singleton cache instance. */
export const session_cache = new SessionCache();
