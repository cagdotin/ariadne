/**
 * Strip a project base path from a raw file path so only the
 * project-relative portion remains.
 *
 * Handles:
 * - Direct prefix stripping when the project path matches
 * - Fallback: scanning for the project directory name as a marker
 *   when the raw path includes a redundant absolute prefix
 */
export function strip_project_prefix(raw: string, project_path?: string): string {
  let p = raw;

  if (project_path) {
    const base = project_path.endsWith("/") ? project_path : project_path + "/";
    if (p.startsWith(base)) {
      p = p.slice(base.length);
    }
  }

  if (p.startsWith("/")) p = p.slice(1);

  if (project_path) {
    const project_name = project_path.replace(/\/$/, "").split("/").pop() ?? "";
    if (project_name) {
      const marker = project_name + "/";
      const idx = p.lastIndexOf(marker);
      if (idx !== -1) p = p.slice(idx + marker.length);
    }
  }

  return p || raw;
}
