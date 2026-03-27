import { useState, useEffect, useCallback, useMemo } from "react";
import type { VisibilityState } from "@tanstack/react-table";
import type { QmdLogEntry, QmdLogStats } from "@/schemas/qmd-logs";
import { get_qmd_logs, get_qmd_log_stats } from "@/api/qmd-logs";
import { use_project_scope } from "@/components/project-scope-provider";
import { QmdLogStatsDisplay } from "@/components/qmd-logs/qmd-log-stats";
import { QmdLogsToolbar } from "@/components/qmd-logs/qmd-logs-toolbar";
import { QmdLogsTable } from "@/components/qmd-logs/qmd-logs-table";
import { QmdLogOutputDialog } from "@/components/qmd-logs/qmd-log-output-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";
import { Terminal } from "lucide-react";

export function QmdLogs() {
  const { scope } = use_project_scope();

  const [logs, set_logs] = useState<QmdLogEntry[]>([]);
  const [stats, set_stats] = useState<QmdLogStats | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Filter state
  const [search, set_search] = useState("");
  const [subcommand_filter, set_subcommand_filter] = useState<string | null>(null);
  const [error_only, set_error_only] = useState(false);

  // Modal state
  const [selected_entry, set_selected_entry] = useState<QmdLogEntry | null>(null);

  const project_path = scope?.project_path;

  const fetch_data = useCallback(async () => {
    try {
      set_loading(true);
      set_error(null);
      const [logs_result, stats_result] = await Promise.all([
        get_qmd_logs(project_path),
        get_qmd_log_stats(project_path),
      ]);
      set_logs(logs_result);
      set_stats(stats_result);
    } catch (err) {
      set_error(error_message(err, "Failed to load QMD logs"));
    } finally {
      set_loading(false);
    }
  }, [project_path]);

  useEffect(() => {
    fetch_data();
  }, [fetch_data]);

  // Derive available subcommands from the full data set
  const available_subcommands = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.subcommand && log.subcommand !== "unknown") {
        set.add(log.subcommand);
      }
    }
    return Array.from(set).sort();
  }, [logs]);

  // Derived filtered rows
  const filtered_logs = useMemo(() => {
    let result = logs;

    if (subcommand_filter) {
      result = result.filter((l) => l.subcommand === subcommand_filter);
    }

    if (error_only) {
      result = result.filter((l) => l.is_error);
    }

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.raw_command.toLowerCase().includes(term) ||
          (l.primary_argument?.toLowerCase().includes(term) ?? false) ||
          l.output_preview.toLowerCase().includes(term) ||
          l.subcommand.toLowerCase().includes(term) ||
          l.project_name.toLowerCase().includes(term),
      );
    }

    return result;
  }, [logs, search, subcommand_filter, error_only]);

  // Hide project column when scoped to a single project
  const column_visibility: VisibilityState = useMemo(
    () => ({
      project_name: !project_path,
    }),
    [project_path],
  );

  const handle_view_output = useCallback((entry: QmdLogEntry) => {
    set_selected_entry(entry);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[88px] flex-1 min-w-[140px]" />
          ))}
        </div>
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/20 border border-destructive p-4 text-destructive">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats && <QmdLogStatsDisplay stats={stats} />}

      <QmdLogsToolbar
        search={search}
        on_search_change={set_search}
        subcommand_filter={subcommand_filter}
        on_subcommand_filter_change={set_subcommand_filter}
        error_only={error_only}
        on_error_only_change={set_error_only}
        available_subcommands={available_subcommands}
      />

      {filtered_logs.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center space-y-3">
          <Terminal className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground text-sm">
            {logs.length === 0
              ? "No QMD CLI calls detected in any session."
              : "No logs match the current filters."}
          </p>
          {logs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              QMD logs are extracted from agent session files. Once agents use the QMD CLI, their
              calls will appear here.
            </p>
          )}
        </div>
      ) : (
        <QmdLogsTable
          data={filtered_logs}
          on_view_output={handle_view_output}
          column_visibility={column_visibility}
        />
      )}

      {selected_entry && (
        <QmdLogOutputDialog
          entry={selected_entry}
          on_close={() => set_selected_entry(null)}
        />
      )}
    </div>
  );
}
