import { useState, useEffect, useMemo } from "react";
import type { ProjectFileStats, DirectoryStat, NameCount } from "@/schemas/analytics";
import { get_project_file_stats } from "@/api/analytics";
import { DirectoryHotspots } from "@/components/directory-hotspots";
import { DataTable } from "@/components/data-table";
import { file_activity_columns } from "@/components/columns/file-activity-columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

type FileTab = "read" | "edit" | "write";

function parse_excludes(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function is_excluded(path: string, excludes: string[]): boolean {
  return excludes.some((ex) => path.includes(ex));
}

function recompute_directory_stats(
  read_files: NameCount[],
  edit_files: NameCount[],
  write_files: NameCount[],
  excludes: string[],
): DirectoryStat[] {
  const parent = (p: string) => {
    const idx = p.lastIndexOf("/");
    return idx > 0 ? p.slice(0, idx) : ".";
  };

  const dir_read: Record<string, number> = {};
  const dir_edit: Record<string, number> = {};
  const dir_write: Record<string, number> = {};

  for (const { name, count } of read_files) {
    if (!is_excluded(name, excludes)) {
      const d = parent(name);
      dir_read[d] = (dir_read[d] ?? 0) + count;
    }
  }
  for (const { name, count } of edit_files) {
    if (!is_excluded(name, excludes)) {
      const d = parent(name);
      dir_edit[d] = (dir_edit[d] ?? 0) + count;
    }
  }
  for (const { name, count } of write_files) {
    if (!is_excluded(name, excludes)) {
      const d = parent(name);
      dir_write[d] = (dir_write[d] ?? 0) + count;
    }
  }

  const all_dirs = new Set([
    ...Object.keys(dir_read),
    ...Object.keys(dir_edit),
    ...Object.keys(dir_write),
  ]);

  const result: DirectoryStat[] = [];
  for (const path of all_dirs) {
    const read_count = dir_read[path] ?? 0;
    const edit_count = dir_edit[path] ?? 0;
    const write_count = dir_write[path] ?? 0;
    result.push({ path, read_count, edit_count, write_count, total: read_count + edit_count + write_count });
  }
  result.sort((a, b) => b.total - a.total);
  return result;
}

interface ScopedFileAnalyticsProps {
  project_path: string;
}

export function ScopedFileAnalytics({ project_path }: ScopedFileAnalyticsProps) {
  const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [exclude_paths, set_exclude_paths] = useState("");
  const [active_tab, set_active_tab] = useState<FileTab>("read");

  useEffect(() => {
    let cancelled = false;
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const stats = await get_project_file_stats(project_path);
        if (cancelled) return;
        set_file_stats(stats);
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load file analytics"));
      } finally {
        if (!cancelled) set_loading(false);
      }
    };
    fetch_data();
    return () => { cancelled = true; };
  }, [project_path]);

  const excludes = useMemo(() => parse_excludes(exclude_paths), [exclude_paths]);

  const filtered_read = useMemo(
    () => (file_stats?.read_files ?? []).filter((f) => !is_excluded(f.name, excludes)),
    [file_stats, excludes],
  );
  const filtered_edit = useMemo(
    () => (file_stats?.edit_files ?? []).filter((f) => !is_excluded(f.name, excludes)),
    [file_stats, excludes],
  );
  const filtered_write = useMemo(
    () => (file_stats?.write_files ?? []).filter((f) => !is_excluded(f.name, excludes)),
    [file_stats, excludes],
  );
  const filtered_dirs = useMemo(
    () =>
      file_stats
        ? recompute_directory_stats(
            file_stats.read_files,
            file_stats.edit_files,
            file_stats.write_files,
            excludes,
          )
        : [],
    [file_stats, excludes],
  );

  const hidden_count = useMemo(() => {
    if (!file_stats) return 0;
    const all_files = new Set([
      ...file_stats.read_files.map((f) => f.name),
      ...file_stats.edit_files.map((f) => f.name),
      ...file_stats.write_files.map((f) => f.name),
    ]);
    return [...all_files].filter((p) => is_excluded(p, excludes)).length;
  }, [file_stats, excludes]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!file_stats) return null;

  const active_file_list =
    active_tab === "read" ? filtered_read : active_tab === "edit" ? filtered_edit : filtered_write;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <h2 className="text-lg font-semibold text-foreground">Project File Analytics</h2>

      {/* Path filter bar */}
      <div className="flex items-center gap-3 min-w-0">
        <label className="text-sm text-muted-foreground shrink-0">Exclude paths:</label>
        <Input
          value={exclude_paths}
          onChange={(e) => set_exclude_paths(e.target.value)}
          placeholder="node_modules, .git, dist (comma-separated)"
          className="flex-1 min-w-0"
        />
        {hidden_count > 0 && (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full shrink-0">
            {hidden_count} hidden
          </span>
        )}
      </div>

      {/* Tool Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {file_stats.tool_distribution.slice(0, 12).map((tool) => {
            const max = file_stats.tool_distribution[0]?.count ?? 1;
            const pct = (tool.count / max) * 100;
            return (
              <div key={tool.name} className="flex items-center gap-3 min-w-0">
                <span className="w-32 shrink-0 text-sm text-muted-foreground truncate">{tool.name}</span>
                <div className="flex-1 min-w-0 h-2 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 text-right text-sm text-foreground shrink-0">{tool.count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Directory Hotspots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Directory Hotspots</CardTitle>
        </CardHeader>
        <CardContent>
          <DirectoryHotspots stats={filtered_dirs} />
        </CardContent>
      </Card>

      {/* File Activity Table */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4">File Activity</h3>
        <div className="flex gap-2 mb-4">
          {(["read", "edit", "write"] as FileTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => set_active_tab(tab)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                active_tab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-xs opacity-70">
                ({active_tab === tab ? active_file_list.length : tab === "read" ? filtered_read.length : tab === "edit" ? filtered_edit.length : filtered_write.length})
              </span>
            </button>
          ))}
        </div>
        <DataTable
          columns={file_activity_columns}
          data={active_file_list.slice(0, 50)}
          filter_column="name"
          filter_placeholder="Search files..."
        />
      </div>
    </div>
  );
}
