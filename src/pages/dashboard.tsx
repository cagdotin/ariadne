import { useState, useEffect } from "react";
import type { AnalyticsOverview } from "../schemas/analytics";
import { get_analytics_overview } from "../api/analytics";
import { format_cost, format_tokens, format_number } from "../lib/format";
import { StatCard } from "../components/stat-card";
import { ActivityHeatmap } from "../components/activity-heatmap";
import { DailyTrend } from "@/components/daily-trend";
import { TopProjects } from "@/components/top-projects";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const [data, set_data] = useState<AnalyticsOverview | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const overview = await get_analytics_overview();
        set_data(overview);
      } catch (err) {
        set_error(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        set_loading(false);
      }
    };
    fetch_data();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-40" />
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

  if (!data) {
    return <div className="text-muted-foreground">No data available</div>;
  }

  return (
    <div className="min-w-0 w-full space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Overview</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Sessions" value={format_number(data.total_sessions)} />
        <StatCard label="Total Cost" value={format_cost(data.total_cost)} />
        <StatCard label="Total Tokens" value={format_tokens(data.total_tokens)} />
        <StatCard label="Projects" value={format_number(data.total_projects)} />
      </div>

      {/* Activity Heatmap */}
      <ActivityHeatmap data={data.sessions_by_date} />

      {/* Daily Trend */}
      <DailyTrend />

      {/* Top Projects */}
      <TopProjects projects={data.projects} />
    </div>
  );
}
