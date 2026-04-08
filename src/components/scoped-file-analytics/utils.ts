import type { DirectoryStat, ProjectFileStats } from "@contracts/analytics/files";
import type { NameCount } from "@contracts/shared";
import type { FileTab } from "./types";

export function parse_excludes(raw: string): string[] {
  return raw
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function is_excluded(path: string, excludes: string[]): boolean {
  return excludes.some((exclude_path) => path.includes(exclude_path));
}

function get_parent_directory(path: string): string {
  const last_separator_index = path.lastIndexOf("/");
  return last_separator_index > 0 ? path.slice(0, last_separator_index) : ".";
}

export function recompute_directory_stats(
  read_files: NameCount[],
  edit_files: NameCount[],
  write_files: NameCount[],
  excludes: string[],
): DirectoryStat[] {
  const dir_read: Record<string, number> = {};
  const dir_edit: Record<string, number> = {};
  const dir_write: Record<string, number> = {};

  for (const { name, count } of read_files) {
    if (is_excluded(name, excludes)) continue;
    const directory = get_parent_directory(name);
    dir_read[directory] = (dir_read[directory] ?? 0) + count;
  }

  for (const { name, count } of edit_files) {
    if (is_excluded(name, excludes)) continue;
    const directory = get_parent_directory(name);
    dir_edit[directory] = (dir_edit[directory] ?? 0) + count;
  }

  for (const { name, count } of write_files) {
    if (is_excluded(name, excludes)) continue;
    const directory = get_parent_directory(name);
    dir_write[directory] = (dir_write[directory] ?? 0) + count;
  }

  const all_directories = new Set([
    ...Object.keys(dir_read),
    ...Object.keys(dir_edit),
    ...Object.keys(dir_write),
  ]);

  return [...all_directories]
    .map((path) => {
      const read_count = dir_read[path] ?? 0;
      const edit_count = dir_edit[path] ?? 0;
      const write_count = dir_write[path] ?? 0;

      return {
        path,
        read_count,
        edit_count,
        write_count,
        total: read_count + edit_count + write_count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function get_active_file_list(
  active_tab: FileTab,
  filtered_read: NameCount[],
  filtered_edit: NameCount[],
  filtered_write: NameCount[],
): NameCount[] {
  if (active_tab === "read") return filtered_read;
  if (active_tab === "edit") return filtered_edit;
  return filtered_write;
}

export function get_hidden_count(
  file_stats: ProjectFileStats | null,
  excludes: string[],
): number {
  if (!file_stats) return 0;

  const all_files = new Set([
    ...file_stats.read_files.map((file) => file.name),
    ...file_stats.edit_files.map((file) => file.name),
    ...file_stats.write_files.map((file) => file.name),
  ]);

  return [...all_files].filter((path) => is_excluded(path, excludes)).length;
}
