import { useMemo, useState } from "react";
import type { ProjectFileStats } from "@contracts/analytics/files";
import type { NameCount } from "@contracts/shared";
import { format_number } from "@/lib/format";
import {
  type OperationLens,
  type FileInsight,
  OPERATION_LENS_OPTIONS,
  from_backend_insights,
} from "@/lib/file-analytics";
import { MiniStat } from "./mini-stat";
import { use_usage_context } from "./usage-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileHotspotTreemap } from "@/components/file-hotspot-treemap";
import { FileHotspotGrid } from "@/components/file-hotspot-grid";
import { FileImbalanceChart } from "@/components/file-imbalance-chart";
import { FileSessionBreadthChart } from "@/components/file-session-breadth-chart";
import { FileSizeActivityScatter } from "@/components/file-size-activity-scatter";
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

function filter_insights(insights: FileInsight[], excludes: string[]): FileInsight[] {
  if (excludes.length === 0) return insights;
  return insights.filter((f) => !is_excluded(f.path, excludes));
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

function OperationLensPicker({
  value,
  on_change,
}: {
  value: OperationLens;
  on_change: (v: OperationLens) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => on_change(v as OperationLens)} className="shrink-0">
      <TabsList>
        {OPERATION_LENS_OPTIONS.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function FilesTab({ file_stats }: FilesTabProps) {
  const [exclude_paths, set_exclude_paths] = useState(DEFAULT_EXCLUDES);
  const [lens, set_lens] = useState<OperationLens>("all");

  const excludes = useMemo(() => parse_excludes(exclude_paths), [exclude_paths]);

  // Unified file insights from backend (includes distinct_session_count)
  const all_insights = useMemo(
    () =>
      file_stats
        ? from_backend_insights(file_stats.file_insights)
        : [],
    [file_stats],
  );

  const filtered_insights = useMemo(
    () => filter_insights(all_insights, excludes),
    [all_insights, excludes],
  );

  // Legacy filtered arrays for grid (which still uses NameCount[])
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
    return all_insights.length - filtered_insights.length;
  }, [all_insights, filtered_insights]);

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

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <OperationLensPicker value={lens} on_change={set_lens} />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <label className="shrink-0 text-sm text-muted-foreground">Exclude paths:</label>
          <Input
            value={exclude_paths}
            onChange={(e) => set_exclude_paths(e.target.value)}
            placeholder="node_modules, .git, dist (comma-separated)"
            className="min-w-0 flex-1"
          />
          {hidden_count > 0 && (
            <Badge variant="secondary">{hidden_count} hidden</Badge>
          )}
        </div>
      </div>

      {/* Primary explorer */}
      <FileHotspotTreemap
        insights={filtered_insights}
        lens={lens}
        project_path={file_stats.project_path}
      />

      {/* Companion charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FileImbalanceChart
          insights={filtered_insights}
          project_path={file_stats.project_path}
        />
        <FileSessionBreadthChart
          insights={filtered_insights}
          lens={lens}
          project_path={file_stats.project_path}
        />
      </div>

      <FileSizeActivityScatter
        insights={filtered_insights}
        lens={lens}
        project_path={file_stats.project_path}
      />

      {/* Precise lookup table */}
      <FileHotspotGrid
        read_files={filtered_read}
        edit_files={filtered_edit}
        write_files={filtered_write}
        project_path={file_stats.project_path}
      />
    </div>
  );
}

export function FilesPage() {
  const { file_stats, loading, error } = use_usage_context();

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return <FilesTab file_stats={file_stats} />;
}
