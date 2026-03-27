import { useMemo } from "react";
import type { TimeBreakdown, DayCount } from "@/schemas/analytics";
import { format_cost } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

const trend_config: ChartConfig = {
  count: { label: "Sessions", color: "var(--chart-1)" },
};

function get_range_label(range_days: number): string {
  if (range_days === 0) return "All time";
  if (range_days === 1) return "Today";
  return `Last ${range_days} days`;
}

/** Format a local Date as YYYY-MM-DD using local date parts (avoids UTC shift). */
function format_local_date(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fill missing dates in a DayCount array so every day in the range has an entry. */
function fill_daily_range(sparse: DayCount[], range_days: number): DayCount[] {
  // For "all" (range_days === 0), return sparse data as-is
  if (range_days === 0) return sparse;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a lookup from existing data
  const count_by_date = new Map<string, number>();
  for (const d of sparse) {
    count_by_date.set(d.date, d.count);
  }

  const filled: DayCount[] = [];
  for (let i = range_days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date_str = format_local_date(d);
    filled.push({ date: date_str, count: count_by_date.get(date_str) ?? 0 });
  }

  return filled;
}

/** Format hour string "00"-"23" into a 12h display like "12a", "1p", "5p". */
function format_hour_label(hour_str: string): string {
  const h = parseInt(hour_str, 10);
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

interface DailyTrendProps {
  data: TimeBreakdown | null;
  range_days: number;
}

export function DailyTrend({ data, range_days }: DailyTrendProps) {
  const is_today = range_days === 1;

  const filled_sessions = useMemo(
    () => (data ? fill_daily_range(data.daily_sessions, range_days) : []),
    [data, range_days],
  );

  const hourly_sessions = useMemo(
    () => (data && is_today ? data.hourly_sessions : []),
    [data, is_today],
  );

  const chart_data = is_today ? hourly_sessions : filled_sessions;
  const data_key = is_today ? "hour" : "date";

  const total_sessions =
    data?.daily_sessions.reduce((s: number, d: { count: number }) => s + d.count, 0) ?? 0;
  const total_cost =
    data?.daily_cost.reduce((s: number, d: { cost: number }) => s + d.cost, 0) ?? 0;
  const avg_cost_per_session = total_sessions > 0 ? total_cost / total_sessions : 0;

  const title = is_today ? "Hourly Trend" : "Daily Trend";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            {get_range_label(range_days)}: {total_sessions} sessions ·{" "}
            {format_cost(total_cost)} · avg {format_cost(avg_cost_per_session)}/session
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : (
          <ChartContainer config={trend_config} className="h-36 w-full">
            <AreaChart data={chart_data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={data_key}
                tickFormatter={
                  is_today
                    ? (v: string) => format_hour_label(v)
                    : (v: string) => v.slice(5)
                }
                interval="preserveStartEnd"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                width={28}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                allowDecimals={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={
                      is_today
                        ? (v: string) => format_hour_label(v)
                        : undefined
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
