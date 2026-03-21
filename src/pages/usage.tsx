import { useState, useEffect } from "react";
import type { AnalyticsOverview, TimeBreakdown as TimeBreakdownType } from "@/schemas/analytics";
import { get_analytics_overview, get_time_breakdown } from "@/api/analytics";
import { format_cost } from "@/lib/format";
import { ToolUsageBar } from "@/components/tool-usage-bar";
import { ModelDistribution } from "@/components/model-distribution";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ToolDetailBreakdown } from "@/components/tool-detail-breakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function Usage() {
  const [data, set_data] = useState<AnalyticsOverview | null>(null);
  const [time_data, set_time_data] = useState<TimeBreakdownType | null>(null);
  const [time_range, set_time_range] = useState(30);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const [overview, breakdown] = await Promise.all([
          get_analytics_overview(),
          get_time_breakdown(time_range),
        ]);
        set_data(overview);
        set_time_data(breakdown);
      } catch (err) {
        set_error(error_message(err, "Failed to load usage data"));
      } finally {
        set_loading(false);
      }
    };
    fetch_data();
  }, []);

  useEffect(() => {
    if (!data) return;
    get_time_breakdown(time_range).then(set_time_data).catch(console.error);
  }, [time_range]);

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
            <div className="flex gap-1">
              {[{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '90d', value: 90 }, { label: 'All', value: 0 }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set_time_range(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    time_range === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>
          {time_data && (
            <p className="text-xs text-muted-foreground mt-1">
              {time_range === 0 ? 'All time' : `Last ${time_range} days`}: {time_data.total_sessions} sessions · {format_cost(time_data.total_cost)} · avg {format_cost(time_data.avg_cost_per_session)}/session
            </p>
          )}
        </CardHeader>
        <CardContent>
          {time_data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Day of Week</h3>
                {time_data.by_weekday.map((s, i) => (
                  <div key={s.day} className="flex items-center gap-2 mb-1.5">
                    <div className="w-24 text-xs text-muted-foreground truncate shrink-0">{s.day}</div>
                    <div className="flex-1 bg-muted rounded-sm h-4 overflow-hidden min-w-0">
                      <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${Math.max(s.share, 0.5)}%`, backgroundColor: `var(--chart-${(i % 5) + 1})` }} />
                    </div>
                    <div className="text-xs tabular-nums text-right shrink-0 w-20">
                      {s.sessions} <span className="text-muted-foreground">({s.share.toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Time of Day</h3>
                {time_data.by_time_of_day.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-2 mb-1.5">
                    <div className="w-24 text-xs text-muted-foreground truncate shrink-0">{s.label}</div>
                    <div className="flex-1 bg-muted rounded-sm h-4 overflow-hidden min-w-0">
                      <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${Math.max(s.share, 0.5)}%`, backgroundColor: `var(--chart-${(i % 5) + 1})` }} />
                    </div>
                    <div className="text-xs tabular-nums text-right shrink-0 w-20">
                      {s.sessions} <span className="text-muted-foreground">({s.share.toFixed(1)}%)</span>
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
    </div>
  );
}
