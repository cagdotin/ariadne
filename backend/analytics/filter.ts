/**
 * Session filtering — faithful port of
 * the legacy analytics cache implementation :: session_matches() / filter_sessions()
 */

import type { SessionSummary } from "./session-types.js";

/**
 * Returns true if a session matches the given optional project path
 * and range_days constraints.
 *
 * `range_days === 0` means "all time" (no time filter).
 */
export function session_matches(
  session: SessionSummary,
  project_path: string | null,
  range_days: number,
  now: Date,
): boolean {
  if (project_path !== null) {
    if (session.project_path !== project_path) {
      return false;
    }
  }

  if (range_days === 0) {
    return true;
  }

  const dt = new Date(session.started_at);
  if (isNaN(dt.getTime())) {
    return false;
  }

  const age_ms = now.getTime() - dt.getTime();
  const age_days = Math.floor(age_ms / (1000 * 60 * 60 * 24));
  return age_days < range_days;
}

/**
 * Filter a list of sessions by project_path + range_days.
 */
export function filter_sessions(
  sessions: SessionSummary[],
  project_path: string | null,
  range_days: number,
): SessionSummary[] {
  const now = new Date();
  return sessions.filter((s) => session_matches(s, project_path, range_days, now));
}
