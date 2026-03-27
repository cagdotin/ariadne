import { useMemo, useState } from "react";
import type { ProjectFileStats, NameCount } from "@/schemas/analytics";
import { format_number } from "@/lib/format";
import { MiniStat } from "./mini-stat";
import { FileHotspotTreemap } from "@/components/file-hotspot-treemap";
import { FileHotspotGrid } from "@/components/file-hotspot-grid";
import { Input } from "@/components/ui/input";

interface FilesTabProps {
  file_stats: ProjectFileStats | null;
}

const DEFAULT_EXCLUDES = "node_modules, .git, dist, build, .next, __pycache__, target, .cache, .turbo, coverage";

function parse_excludes(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function is_excluded(path: string, excludes: string[]): boolean {
  return excludes.some((ex) => path.includes(ex));
}

function filter_files(files: NameCount[], excludes: string[]): NameCount[] {
  if (excludes.length === 0) return files;
  return files.filter((f) => !is_excluded(f.name, excludes));
}

function FileSummaryCards({ stats }: { stats: ProjectFileStats }) {
  return (
    <div className="flex flex-wrap gap-3">
      <MiniStat label="Sessions" value={format_number(stats.total_sessions)} />
      <MiniStat label="Files Read" value={format_number(stats.read_files.length)} />
      <MiniStat label="Files Edited" value={format_number(stats.edit_files.length)} />
      <MiniStat label="Files Written" value={format_number(stats.write_files.length)} />
    </div>
  );
}

export function FilesTab({ file_stats }: FilesTabProps) {
  const [exclude_paths, set_exclude_paths] = useState(DEFAULT_EXCLUDES);

  const excludes = useMemo(() => parse_excludes(exclude_paths), [exclude_paths]);

  const filtered_read = useMemo(
    () => filter_files(file_stats?.read_files ?? [], excludes),
    [file_stats, excludes],
  );
  const filtered_edit = useMemo(
    () => filter_files(file_stats?.edit_files ?? [], excludes),
    [file_stats, excludes],
  );
  const filtered_write = useMemo(
    () => filter_files(file_stats?.write_files ?? [], excludes),
    [file_stats, excludes],
  );

  const hidden_count = useMemo(() => {
    if (!file_stats) return 0;
    const all = new Set([
      ...file_stats.read_files.map((f) => f.name),
      ...file_stats.edit_files.map((f) => f.name),
      ...file_stats.write_files.map((f) => f.name),
    ]);
    return [...all].filter((p) => is_excluded(p, excludes)).length;
  }, [file_stats, excludes]);

  if (!file_stats) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          Select a project to view file analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FileSummaryCards stats={file_stats} />

      <div className="flex min-w-0 items-center gap-3">
        <label className="shrink-0 text-sm text-muted-foreground">Exclude paths:</label>
        <Input
          value={exclude_paths}
          onChange={(e) => set_exclude_paths(e.target.value)}
          placeholder="node_modules, .git, dist (comma-separated)"
          className="min-w-0 flex-1"
        />
        {hidden_count > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            {hidden_count} hidden
          </span>
        )}
      </div>

      <FileHotspotTreemap
        read_files={filtered_read}
        edit_files={filtered_edit}
        write_files={filtered_write}
        project_path={file_stats.project_path}
      />

      <FileHotspotGrid
        read_files={filtered_read}
        edit_files={filtered_edit}
        write_files={filtered_write}
        project_path={file_stats.project_path}
      />
    </div>
  );
}
