import type { ProjectSummary } from "@/schemas/analytics";
import { format_date_relative, format_number } from "@/lib/format";
import type { ProjectFilterMode, ProjectGroup } from "./types";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function normalize_path_segments(path: string) {
  return path.replace(/\/$/, "").split("/").filter(Boolean);
}

export function get_workspace_label(path: string) {
  const segments = normalize_path_segments(path);
  if (segments.length >= 3) {
    return `${segments[segments.length - 3]} / ${segments[segments.length - 2]}`;
  }
  if (segments.length >= 2) {
    return segments[segments.length - 2];
  }
  return "other";
}

export function get_project_subtitle(path: string) {
  const segments = normalize_path_segments(path);
  if (segments.length <= 1) return path;
  const parent_segments = segments.slice(Math.max(0, segments.length - 4), -1);
  return `…/${parent_segments.join("/")}`;
}

// ---------------------------------------------------------------------------
// Project display helpers
// ---------------------------------------------------------------------------

export function get_project_meta(project: ProjectSummary) {
  return `${format_number(project.session_count)} · ${format_date_relative(project.last_active)}`;
}

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

export function matches_project_query(project: ProjectSummary, query: string) {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  return (
    project.name.toLowerCase().includes(q) ||
    project.path.toLowerCase().includes(q) ||
    get_workspace_label(project.path).toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Sorting — spread + sort for immutability (lib targets ES2020, no toSorted)
// ---------------------------------------------------------------------------

export function sort_projects_by_recent(projects: ProjectSummary[]) {
  return [...projects].sort(
    (a, b) =>
      new Date(b.last_active).getTime() - new Date(a.last_active).getTime() ||
      b.session_count - a.session_count ||
      a.name.localeCompare(b.name),
  );
}

export function sort_projects_by_activity(projects: ProjectSummary[]) {
  return [...projects].sort(
    (a, b) =>
      b.session_count - a.session_count ||
      new Date(b.last_active).getTime() - new Date(a.last_active).getTime() ||
      a.name.localeCompare(b.name),
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export function build_workspace_groups(
  projects: ProjectSummary[],
): ProjectGroup[] {
  const groups = new Map<string, ProjectSummary[]>();
  for (const project of projects) {
    const label = get_workspace_label(project.path);
    const list = groups.get(label) ?? [];
    list.push(project);
    groups.set(label, list);
  }
  return [...groups.entries()]
    .map(([label, items]) => ({
      id: `ws-${label}`,
      label,
      projects: sort_projects_by_activity(items),
    }))
    .sort((a, b) => {
      const a_total = a.projects.reduce((s, p) => s + p.session_count, 0);
      const b_total = b.projects.reduce((s, p) => s + p.session_count, 0);
      return b_total - a_total || a.label.localeCompare(b.label);
    });
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function is_filter_mode(value: string): value is ProjectFilterMode {
  return value === "all" || value === "recent" || value === "active";
}
