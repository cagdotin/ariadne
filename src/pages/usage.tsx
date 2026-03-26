import { useEffect, useRef, useState } from "react";
import type {
  AnalyticsOverview,
  TimeBreakdown as TimeBreakdownType,
} from "@/schemas/analytics";
import { get_analytics_overview, get_time_breakdown } from "@/api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { format_cost } from "@/lib/format";
import { ToolUsageBar } from "@/components/tool-usage-bar";
import { ModelDistribution } from "@/components/model-distribution";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ToolDetailBreakdown } from "@/components/tool-detail-breakdown";
import { ScopedFileAnalytics } from "@/components/scoped-file-analytics/index";
import { RangePicker } from "@/components/range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

const time_range_options = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

export function Usage() {
  const { scope } = use_project_scope();
  const project_path = scope?.project_path;

  const [data, set_data] = useState<AnalyticsOverview | null>(null);
  const [time_data, set_time_data] = useState<TimeBreakdownType | null>(null);
  const [time_range, set_time_range] = useState(30);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Track previous scope to distinguish scope changes from range changes.
  // Scope change → show loading skeleton; range change → silent update.
  const prev_project_path = useRef(project_path);

  useEffect(() => {
    let cancelled = false;
    const scope_changed = prev_project_path.current !== project_path;
    prev_project_path.current = project_path;

    const fetch_data = async () => {
      try {
        // Show loading skeleton on scope change or initial mount (data is null).
        // Range-only changes keep the current data visible while refreshing.
        if (scope_changed || !data) set_loading(true);
        set_error(null);
        const [overview, breakdown] = await Promise.all([
          get_analytics_overview(project_path),
          get_time_breakdown(time_range, project_path),
        ]);
        if (cancelled) return;
        set_data(overview);
        set_time_data(breakdown);
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load usage data"));
      } finally {
        if (!cancelled) set_loading(false);
      }
    };

    fetch_data();

    return () => {
      cancelled = true;
    };
  }, [project_path, time_range]);

  if (error) {
    return (
      <div className="min-w-0 w-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-w-0 w-full space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 min-w-0">
        <ToolUsageBar tools={data.tools} />
        <ModelDistribution models={data.models} />
      </div>

      <CostBreakdown
        input_cost={data.input_cost}
        output_cost={data.output_cost}
        cache_read_cost={data.cache_read_cost}
        cache_write_cost={data.cache_write_cost}
      />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Time Patterns</CardTitle>
            <RangePicker
              options={time_range_options}
              value={time_range}
              on_change={set_time_range}
            />
          </div>
          {time_data && (
            <p className="mt-1 text-xs text-muted-foreground">
              {time_range === 0 ? "All time" : `Last ${time_range} days`}: {time_data.total_sessions} sessions · {format_cost(time_data.total_cost)} · avg {format_cost(time_data.avg_cost_per_session)}/session
            </p>
          )}
        </CardHeader>
        <CardContent>
          {time_data && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Day of Week
                </h3>
                {time_data.by_weekday.map((stat, index) => (
                  <div key={stat.day} className="mb-1.5 flex items-center gap-2">
                    <div className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                      {stat.day}
                    </div>
                    <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm transition-all duration-300"
                        style={{
                          width: `${Math.max(stat.share, 0.5)}%`,
                          backgroundColor: `var(--chart-${(index % 5) + 1})`,
                        }}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right text-xs tabular-nums">
                      {stat.sessions}{" "}
                      <span className="text-muted-foreground">
                        ({stat.share.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Time of Day
                </h3>
                {time_data.by_time_of_day.map((stat, index) => (
                  <div key={stat.label} className="mb-1.5 flex items-center gap-2">
                    <div className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                      {stat.label}
                    </div>
                    <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm transition-all duration-300"
                        style={{
                          width: `${Math.max(stat.share, 0.5)}%`,
                          backgroundColor: `var(--chart-${(index % 5) + 1})`,
                        }}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right text-xs tabular-nums">
                      {stat.sessions}{" "}
                      <span className="text-muted-foreground">
                        ({stat.share.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ToolDetailBreakdown
        bash_commands={data.top_bash_commands}
        read_files={data.top_read_files}
        edit_files={data.top_edit_files}
        write_files={data.top_write_files}
      />

      {project_path && <ScopedFileAnalytics project_path={project_path} />}
    </div>
  );
}
