import type { AnalyticsOverview } from "@contracts/analytics/overview";
import type { TimeBreakdown } from "@contracts/analytics/time";
import type { DayCount } from "@contracts/shared";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { get_analytics_overview, get_time_breakdown } from "@/api/analytics";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { DailyTrend } from "@/components/daily-trend";
import { OverviewStatsCard } from "@/components/overview-stats-card";
import { use_project_scope } from "@/components/project-scope-provider";
import { ProviderLimitsSummaryCard } from "@/components/provider-limits-summary-card";
import { RecentSessionsCard } from "@/components/recent-sessions-card";
import { TopProjects } from "@/components/top-projects";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
	format_cost,
	format_file_size,
	format_number,
	format_tokens,
} from "@/lib/format";
import { error_message } from "@/lib/utils";

export function Dashboard() {
	const { scope } = use_project_scope();
	const { range_days } = use_analytics_time_range();
	const project_path = scope?.project_path;

	const [overview, set_overview] = useState<AnalyticsOverview | null>(null);
	const [time_data, set_time_data] = useState<TimeBreakdown | null>(null);
	const [heatmap_data, set_heatmap_data] = useState<DayCount[] | null>(null);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);

	// Track previous scope to distinguish scope changes from range changes.
	// Scope change → show loading skeleton; range change → silent update.
	const prev_project_path = useRef(project_path);
	const has_loaded_data = useRef(false);

	useEffect(() => {
		let cancelled = false;
		const scope_changed = prev_project_path.current !== project_path;
		prev_project_path.current = project_path;

		const fetch_data = async () => {
			try {
				// Show loading skeleton on scope change or initial mount.
				// Range-only changes keep the current data visible while refreshing.
				if (scope_changed || !has_loaded_data.current) set_loading(true);
				set_error(null);

				const overview_promise = get_analytics_overview(
					project_path,
					range_days,
				);
				const heatmap_overview_promise =
					range_days === 0
						? overview_promise
						: get_analytics_overview(project_path, 0);

				const [next_overview, next_time_data, heatmap_overview] =
					await Promise.all([
						overview_promise,
						get_time_breakdown(range_days, project_path),
						heatmap_overview_promise,
					]);
				if (cancelled) return;
				set_overview(next_overview);
				set_time_data(next_time_data);
				set_heatmap_data(heatmap_overview.sessions_by_date);
				has_loaded_data.current = true;
			} catch (err) {
				if (cancelled) return;
				set_error(error_message(err, "Failed to load analytics"));
			} finally {
				if (!cancelled) set_loading(false);
			}
		};

		fetch_data();

		return () => {
			cancelled = true;
		};
	}, [project_path, range_days]);

	if (loading) {
		return (
			<div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] xl:items-start">
				<div className="order-2 space-y-4 xl:order-1">
					<Skeleton className="h-64 w-full" />
					<Skeleton className="h-72 w-full" />
					<Skeleton className="h-44 w-full" />
				</div>
				<div className="order-1 space-y-4 xl:order-2">
					<Skeleton className="h-[360px] w-full" />
					<Skeleton className="h-[240px] w-full" />
					<Skeleton className="h-[220px] w-full" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="size-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (!overview || !time_data || !heatmap_data) {
		return <div className="text-muted-foreground">No data available</div>;
	}

	const is_all = range_days === 0;
	const overview_rows = [
		{
			label: "Sessions",
			value: format_number(
				is_all ? overview.total_sessions : time_data.total_sessions,
			),
			href: "/sessions",
		},
		{
			label: "Total Cost",
			value: format_cost(is_all ? overview.total_cost : time_data.total_cost),
			href: "/usage",
		},
		{
			label: "Total Tokens",
			value: format_tokens(
				is_all ? overview.total_tokens : time_data.total_tokens,
			),
			href: "/usage",
		},
		{
			label: "Avg / Session",
			value: format_cost(time_data.avg_cost_per_session),
		},
		{
			label: "Projects",
			value: format_number(overview.total_projects),
		},
		{
			label: "Tool Calls",
			value: format_number(overview.total_tool_calls),
			href: "/usage",
		},
		{
			label: "Disk Usage",
			value: format_file_size(overview.total_file_size_bytes),
		},
	];

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] xl:items-start">
			<div className="order-2 min-w-0 space-y-4 xl:order-1">
				<DailyTrend data={time_data} range_days={range_days} />
				<RecentSessionsCard sessions={overview.recent_sessions} />
				{!scope && <TopProjects projects={overview.projects} />}
			</div>
			<div className="order-1 min-w-0 space-y-4 xl:order-2">
				<OverviewStatsCard rows={overview_rows} />
				<ActivityHeatmap data={heatmap_data} />
				<ProviderLimitsSummaryCard />
			</div>
		</div>
	);
}
