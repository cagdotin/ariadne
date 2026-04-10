import type { TimeBreakdown } from "@contracts/analytics/time";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { format_number } from "@/lib/format";
import { MiniStat } from "./mini-stat";
import { use_usage_context } from "./usage-context";

interface PatternsTabProps {
	time_data: TimeBreakdown;
	range_days: number;
}

function PatternStatCards({ time_data, range_days }: PatternsTabProps) {
	const range_label =
		range_days === 0
			? "All time"
			: range_days === 1
				? "Today"
				: `Last ${range_days}d`;

	// Find the busiest day of week and time of day
	const peak_day = time_data.by_weekday.reduce(
		(a, b) => (b.sessions > a.sessions ? b : a),
		time_data.by_weekday[0],
	);
	const peak_time = time_data.by_time_of_day.reduce(
		(a, b) => (b.sessions > a.sessions ? b : a),
		time_data.by_time_of_day[0],
	);
	const active_days = time_data.daily_sessions.length;

	return (
		<div className="flex flex-wrap gap-3">
			<MiniStat
				label="Sessions"
				value={format_number(time_data.total_sessions)}
				sub={range_label}
			/>
			<MiniStat
				label="Active Days"
				value={format_number(active_days)}
				sub={range_label}
			/>
			<MiniStat
				label="Peak Day"
				value={peak_day?.day ?? "—"}
				sub={peak_day ? `${peak_day.sessions} sessions` : undefined}
			/>
			<MiniStat
				label="Peak Time"
				value={peak_time?.label ?? "—"}
				sub={peak_time ? `${peak_time.sessions} sessions` : undefined}
			/>
		</div>
	);
}

function WeekdayChart({ time_data }: { time_data: TimeBreakdown }) {
	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Day of Week</CardTitle>
			</CardHeader>
			<CardContent>
				{time_data.by_weekday.map((stat, index) => (
					<div key={stat.day} className="mb-1.5 flex items-center gap-2">
						<div className="w-14 shrink-0 text-xs text-muted-foreground">
							{stat.day}
						</div>
						<div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
							<div
								className="h-full rounded transition-all duration-300"
								style={{
									width: `${Math.max(stat.share, 0.5)}%`,
									backgroundColor: `var(--chart-${(index % 5) + 1})`,
								}}
							/>
						</div>
						<div className="w-24 shrink-0 text-right text-xs tabular-nums">
							{stat.sessions}{" "}
							<span className="text-muted-foreground">
								({stat.share.toFixed(1)}%)
							</span>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function TimeOfDayChart({ time_data }: { time_data: TimeBreakdown }) {
	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Time of Day</CardTitle>
			</CardHeader>
			<CardContent>
				{time_data.by_time_of_day.map((stat, index) => (
					<div key={stat.label} className="mb-1.5 flex items-center gap-2">
						<div className="w-24 shrink-0 truncate text-xs text-muted-foreground">
							{stat.label}
						</div>
						<div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
							<div
								className="h-full rounded transition-all duration-300"
								style={{
									width: `${Math.max(stat.share, 0.5)}%`,
									backgroundColor: `var(--chart-${(index % 5) + 1})`,
								}}
							/>
						</div>
						<div className="w-24 shrink-0 text-right text-xs tabular-nums">
							{stat.sessions}{" "}
							<span className="text-muted-foreground">
								({stat.share.toFixed(1)}%)
							</span>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

const sessions_trend_config = {
	count: { label: "Sessions", color: "var(--chart-2)" },
} satisfies ChartConfig;

function SessionsTrend({ time_data }: { time_data: TimeBreakdown }) {
	if (time_data.daily_sessions.length === 0) return null;

	const chart_data = time_data.daily_sessions.map((d) => ({
		date: d.date,
		count: d.count,
	}));

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Sessions Over Time</CardTitle>
			</CardHeader>
			<CardContent>
				<ChartContainer
					config={sessions_trend_config}
					className="h-[200px] w-full"
				>
					<AreaChart
						data={chart_data}
						margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
					>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
							tickFormatter={(v: string) => {
								const d = new Date(v + "T00:00:00");
								return d.toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								});
							}}
							interval="preserveStartEnd"
							minTickGap={40}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
							width={30}
							allowDecimals={false}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<Area
							type="monotone"
							dataKey="count"
							stroke="var(--chart-2)"
							fill="var(--chart-2)"
							fillOpacity={0.1}
							strokeWidth={1.5}
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}

export function PatternsTab({ time_data, range_days }: PatternsTabProps) {
	return (
		<div className="space-y-4">
			<PatternStatCards time_data={time_data} range_days={range_days} />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
				<WeekdayChart time_data={time_data} />
				<TimeOfDayChart time_data={time_data} />
			</div>

			<SessionsTrend time_data={time_data} />
		</div>
	);
}

export function PatternsPage() {
	const { time_data, range_days, loading, error } = use_usage_context();

	if (error) return <p className="text-destructive text-sm">{error}</p>;

	if (loading || !time_data) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-12 w-full" />
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<Skeleton className="h-64 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	return <PatternsTab time_data={time_data} range_days={range_days} />;
}
