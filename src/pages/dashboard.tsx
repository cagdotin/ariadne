import { useState, useEffect, useMemo } from "react";
import type { AnalyticsOverview, TimeBreakdown } from "../schemas/analytics";
import { get_analytics_overview, get_time_breakdown } from "../api/analytics";
import { format_cost, format_tokens, format_number, format_file_size } from "../lib/format";
import { use_project_scope } from "@/components/project-scope-provider";
import { StatCard } from "../components/stat-card";
import { ActivityHeatmap } from "../components/activity-heatmap";
import { DailyTrend } from "@/components/daily-trend";
import { TopProjects } from "@/components/top-projects";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

const RANGE_OPTIONS = [
  { label: "Today", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

export function Dashboard() {
  const { scope } = use_project_scope();
  const project_path = scope?.project_path;

  const [overview, set_overview] = useState<AnalyticsOverview | null>(null);
  const [time_data, set_time_data] = useState<TimeBreakdown | null>(null);
  const [range_days, set_range_days] = useState(30);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Load overview (always all-time) + initial time breakdown
  useEffect(() => {
    let cancelled = false;
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const [ov, tb] = await Promise.all([
          get_analytics_overview(project_path),
          get_time_breakdown(range_days, project_path),
        ]);
        if (cancelled) return;
        set_overview(ov);
        set_time_data(tb);
      } catch (err) {
        if (cancelled) return;
        set_error(
          error_message(err, "Failed to load analytics"),
        );
      } finally {
        if (!cancelled) set_loading(false);
      }
    };
    fetch_data();
    return () => { cancelled = true; };
  }, [project_path]);

  // Reload time breakdown when range changes (skip initial load)
  useEffect(() => {
    if (!overview) return;
    get_time_breakdown(range_days, project_path).then(set_time_data).catch(console.error);
  }, [range_days, project_path]);

  const total_tool_calls = useMemo(() => {
    if (!overview) return 0;
    return overview.tools.reduce((sum, t) => sum + t.total_calls, 0);
  }, [overview]);

  // Compute stats: time-filtered for sessions/cost/tokens, all-time for structural
  const stats = useMemo(() => {
    if (!overview || !time_data) return null;
    const is_all = range_days === 0;
    return {
      sessions: is_all ? overview.total_sessions : time_data.total_sessions,
      cost: is_all ? overview.total_cost : time_data.total_cost,
      tokens: is_all ? overview.total_tokens : time_data.total_tokens,
      avg_cost: time_data.avg_cost_per_session,
      projects: overview.total_projects,
      tool_calls: total_tool_calls,
    };
  }, [overview, time_data, range_days, total_tool_calls]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="flex flex-wrap gap-3">
          {[...Array(7)].map((_, i) => (
            <Skeleton
              key={i}
              className="h-[88px] min-w-[140px] flex-1 basis-[calc(50%-0.375rem)] sm:basis-[calc(33.333%-0.5rem)] xl:basis-0"
            />
          ))}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-52" />
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

  if (!overview || !stats) {
    return <div className="text-muted-foreground">No data available</div>;
  }

  const range_label =
    range_days === 0
      ? ""
      : range_days === 1
        ? " today"
        : ` last ${range_days}d`;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Range picker */}
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-1 shrink-0">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set_range_days(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                range_days === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Sessions"
          value={format_number(stats.sessions)}
          href="/sessions"
          sub_label={
            range_days !== 0
              ? `${format_number(overview.total_sessions)} all time`
              : undefined
          }
        />
        <StatCard
          label="Total Cost"
          value={format_cost(stats.cost)}
          href="/usage"
          sub_label={
            range_days !== 0
              ? `${format_cost(overview.total_cost)} all time`
              : undefined
          }
        />
        <StatCard
          label="Total Tokens"
          value={format_tokens(stats.tokens)}
          href="/usage"
          sub_label={
            range_days !== 0
              ? `${format_tokens(overview.total_tokens)} all time`
              : undefined
          }
        />
        <StatCard
          label="Avg / Session"
          value={format_cost(stats.avg_cost)}
          sub_label={range_label ? `avg${range_label}` : undefined}
        />
        <StatCard
          label="Projects"
          value={format_number(stats.projects)}
        />
        <StatCard
          label="Tool Calls"
          value={format_number(stats.tool_calls)}
          href="/usage"
        />
        <StatCard
          label="Disk Usage"
          value={format_file_size(overview.total_file_size_bytes)}
          sub_label={`${format_number(overview.total_sessions)} session files`}
        />
      </div>

      {/* Daily Trend — follows selected range */}
      <DailyTrend data={time_data} range_days={range_days} />

      {/* Top Projects — only in all-projects mode */}
      {!scope && <TopProjects projects={overview.projects} />}

      {/* Activity Heatmap — always all-time */}
      <ActivityHeatmap data={overview.sessions_by_date} />
    </div>
  );
}
