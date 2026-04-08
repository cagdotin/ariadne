/**
 * Static helpers — faithful port of utility functions from
 * the legacy analytics cache implementation
 */

import * as fs from "node:fs";
import type { SessionSummary } from "./session-types.js";

export interface FileSizeResult {
  path: string;
  size_bytes: number | null;
}

export interface ProjectSummary {
  name: string;
  path: string;
  session_count: number;
  total_cost: number;
  total_tokens: number;
  last_active: string;
}

/**
 * Stat file sizes for a list of paths.
 * Returns null for paths that cannot be statted (deleted, inaccessible, etc.).
 */
export function get_file_sizes(paths: string[]): FileSizeResult[] {
  return paths.map((p) => {
    let size_bytes: number | null = null;
    try {
      const stat = fs.statSync(p);
      size_bytes = stat.size;
    } catch {
      // Leave as null on error
    }
    return { path: p, size_bytes };
  });
}

/**
 * List all projects (lightweight, for selector).
 * Groups by project_path, counts sessions, sums cost/tokens, tracks last_active.
 */
export function list_projects(sessions: SessionSummary[]): ProjectSummary[] {
  const project_map = new Map<string, ProjectSummary>();

  for (const session of sessions) {
    let entry = project_map.get(session.project_path);
    if (!entry) {
      entry = {
        name: session.project_name,
        path: session.project_path,
        session_count: 0,
        total_cost: 0,
        total_tokens: 0,
        last_active: session.started_at,
      };
      project_map.set(session.project_path, entry);
    }

    entry.session_count += 1;
    entry.total_cost += session.total_cost;
    entry.total_tokens += session.total_tokens;

    if (session.started_at > entry.last_active) {
      entry.last_active = session.started_at;
    }
  }

  const projects = Array.from(project_map.values());
  projects.sort((a, b) => b.session_count - a.session_count);
  return projects;
}
