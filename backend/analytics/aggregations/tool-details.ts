/**
 * Tool detail aggregation — faithful port of
 * the tool-details aggregation logic.
 */

import type { SessionSummary } from "../session-types.js";
import { session_cache } from "../session-cache.js";
import { filter_sessions } from "../filter.js";
import { format_local_date, parse_timestamp } from "../date-utils.js";

export interface NameCount {
  name: string;
  count: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface ProjectToolSummary {
  project_path: string;
  project_name: string;
  total_calls: number;
  items: NameCount[];
}

export interface ToolDetailResponse {
  tool_name: string;
  total_calls: number;
  total_errors: number;
  items: NameCount[];
  by_project: ProjectToolSummary[];
  by_date: DayCount[];
}

function get_tool_source(session: SessionSummary, tool_name: string): Record<string, number> | null {
  switch (tool_name) {
    case "bash": return session.bash_commands;
    case "read": return session.read_files;
    case "edit": return session.edit_files;
    case "write": return session.write_files;
    default: return null;
  }
}

export async function get_tool_details(
  tool_name: string,
  project_path: string | null,
  range_days: number,
): Promise<ToolDetailResponse> {
  const all = await session_cache.get_or_init();
  const filtered = filter_sessions(all, project_path, range_days);

  // Aggregate tool calls/errors
  let total_calls = 0;
  let total_errors = 0;
  for (const s of filtered) {
    const tc = s.tool_calls[tool_name];
    if (tc) {
      total_calls += tc.calls;
      total_errors += tc.errors;
    }
  }

  // Aggregate items (bash_commands or *_files)
  const items_map = new Map<string, number>();
  for (const s of filtered) {
    const source = get_tool_source(s, tool_name);
    if (source === null) continue;
    for (const [key, count] of Object.entries(source)) {
      items_map.set(key, (items_map.get(key) ?? 0) + count);
    }
  }
  const items: NameCount[] = Array.from(items_map.entries())
    .map(([name, count]) => ({ name, count }));
  items.sort((a, b) => b.count - a.count);

  // By project breakdown (keyed by project_path for correct identity)
  const project_items_map = new Map<string, Map<string, number>>();
  const project_calls_map = new Map<string, number>();
  const project_names_map = new Map<string, string>();

  for (const s of filtered) {
    const source = get_tool_source(s, tool_name);
    if (source === null) continue;
    if (Object.keys(source).length === 0) continue;

    if (!project_names_map.has(s.project_path)) {
      project_names_map.set(s.project_path, s.project_name);
    }

    let pmap = project_items_map.get(s.project_path);
    if (!pmap) {
      pmap = new Map<string, number>();
      project_items_map.set(s.project_path, pmap);
    }

    for (const [key, count] of Object.entries(source)) {
      pmap.set(key, (pmap.get(key) ?? 0) + count);
      project_calls_map.set(s.project_path, (project_calls_map.get(s.project_path) ?? 0) + count);
    }
  }

  const by_project: ProjectToolSummary[] = Array.from(project_items_map.entries())
    .map(([ppath, imap]) => {
      let pitems: NameCount[] = Array.from(imap.entries())
        .map(([name, count]) => ({ name, count }));
      pitems.sort((a, b) => b.count - a.count);
      pitems = pitems.slice(0, 5);
      return {
        project_path: ppath,
        project_name: project_names_map.get(ppath) ?? "",
        total_calls: project_calls_map.get(ppath) ?? 0,
        items: pitems,
      };
    });
  by_project.sort((a, b) => b.total_calls - a.total_calls);

  // By date
  const date_map = new Map<string, number>();
  for (const s of filtered) {
    const source = get_tool_source(s, tool_name);
    if (source === null) continue;
    const day_total = Object.values(source).reduce((sum, v) => sum + v, 0);
    if (day_total === 0) continue;

    const dt = parse_timestamp(s.started_at);
    if (dt !== null) {
      const date = format_local_date(dt);
      date_map.set(date, (date_map.get(date) ?? 0) + day_total);
    }
  }
  const by_date: DayCount[] = Array.from(date_map.entries())
    .map(([date, count]) => ({ date, count }));
  by_date.sort((a, b) => a.date.localeCompare(b.date));

  return {
    tool_name,
    total_calls,
    total_errors,
    items,
    by_project,
    by_date,
  };
}
