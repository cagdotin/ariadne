import type { DailyModelUsage, TimeBreakdown } from "@contracts/analytics/time";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { format_cost, format_number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";

const session_bar_color = "var(--chart-1)";
const model_stack_colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
const max_model_series = 5;
const other_series_key = "__other_models";
const compact_number_formatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  message_count: number;
  session_equivalent_count: number;
  total_cost: number;
  share: number;
}

/** Format a local Date as YYYY-MM-DD using local date parts (avoids UTC shift). */
function format_local_date(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fill missing dates in a DayCount array so every day in the range has an entry. */
function fill_daily_range(
  sparse: Array<{ date: string; count: number }>,
  range_days: number,
): Array<{ date: string; count: number }> {
  if (range_days === 0) return sparse;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count_by_date = new Map<string, number>();
  for (const d of sparse) {
    count_by_date.set(d.date, d.count);
  }

  const filled: Array<{ date: string; count: number }> = [];
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

function format_date_label(value: string): string {
  return value.slice(5);
}

function format_session_value(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function format_message_count(value: number): string {
  if (value >= 10_000) return compact_number_formatter.format(value);
  return format_number(value);
}

function get_model_key(
  model_usage: Pick<DailyModelUsage, "provider" | "model_id">,
): string {
  return `${model_usage.provider}\0${model_usage.model_id}`;
}

function get_model_label(
  model_usage: Pick<DailyModelUsage, "provider" | "model_id">,
): string {
  if (model_usage.model_id === "unknown") return "unknown model";
  return model_usage.model_id;
}

function build_model_series(
  daily_model_usage: DailyModelUsage[],
  total_sessions: number,
): TrendSeries[] {
  const totals_by_model = new Map<
    string,
    Omit<TrendSeries, "color" | "share">
  >();

  for (const entry of daily_model_usage) {
    const key = get_model_key(entry);
    const existing = totals_by_model.get(key) ?? {
      key,
      label: get_model_label(entry),
      message_count: 0,
      session_equivalent_count: 0,
      total_cost: 0,
    };
    existing.message_count += entry.message_count;
    existing.session_equivalent_count += entry.session_equivalent_count;
    existing.total_cost += entry.total_cost;
    totals_by_model.set(key, existing);
  }

  const sorted_models = Array.from(totals_by_model.values()).sort((a, b) => {
    if (b.session_equivalent_count !== a.session_equivalent_count) {
      return b.session_equivalent_count - a.session_equivalent_count;
    }
    if (b.message_count !== a.message_count) {
      return b.message_count - a.message_count;
    }
    return a.label.localeCompare(b.label);
  });

  const visible_models =
    sorted_models.length > max_model_series
      ? [
          ...sorted_models.slice(0, max_model_series - 1),
          sorted_models.slice(max_model_series - 1).reduce(
            (other, model) => ({
              key: other_series_key,
              label: "other models",
              message_count: other.message_count + model.message_count,
              session_equivalent_count:
                other.session_equivalent_count + model.session_equivalent_count,
              total_cost: other.total_cost + model.total_cost,
            }),
            {
              key: other_series_key,
              label: "other models",
              message_count: 0,
              session_equivalent_count: 0,
              total_cost: 0,
            },
          ),
        ]
      : sorted_models;

  return visible_models.map((model, index) => ({
    ...model,
    color: model_stack_colors[index % model_stack_colors.length],
    share:
      total_sessions > 0
        ? (model.session_equivalent_count / total_sessions) * 100
        : 0,
  }));
}

function build_model_chart_config(series: TrendSeries[]): ChartConfig {
  return series.reduce<ChartConfig>((config, item) => {
    config[item.key] = {
      label: item.label,
      color: item.color,
    };
    return config;
  }, {});
}

function TrendLegend({ series }: { series: TrendSeries[] }) {
  return (
    <div className="space-y-2 border-t border-border/60 pt-4 pr-3 pl-2">
      {series.map((item) => (
        <div
          key={item.key}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
        >
          <div
            className="size-3 rounded-[4px]"
            style={{ backgroundColor: item.color }}
          />
          <div className="min-w-0 truncate text-foreground">{item.label}</div>
          <div className="text-right font-mono text-muted-foreground tabular-nums">
            {format_message_count(item.message_count)} msgs ·{" "}
            {format_cost(item.total_cost)}
          </div>
          <div className="text-right font-mono text-foreground tabular-nums">
            {item.share.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

interface DailyTrendProps {
  data: TimeBreakdown | null;
  range_days: number;
}

export function DailyTrend({ data, range_days }: DailyTrendProps) {
  const is_today = range_days === 1;
  const navigate = useNavigate();

  const filled_sessions = useMemo(
    () => (data ? fill_daily_range(data.daily_sessions, range_days) : []),
    [data, range_days],
  );

  const hourly_sessions = useMemo(
    () => (data && is_today ? data.hourly_sessions : []),
    [data, is_today],
  );

  const model_series = useMemo(
    () =>
      !data || is_today
        ? []
        : build_model_series(data.daily_model_usage, data.total_sessions),
    [data, is_today],
  );

  const chart_config = useMemo<ChartConfig>(() => {
    if (is_today || model_series.length === 0) {
      return {
        count: { label: "Sessions", color: session_bar_color },
      };
    }
    return build_model_chart_config(model_series);
  }, [is_today, model_series]);

  const chart_data = useMemo(() => {
    if (!data) return [];

    if (is_today) {
      return hourly_sessions.map((entry) => ({
        date: entry.hour,
        count: entry.count,
      }));
    }

    if (model_series.length === 0) {
      return filled_sessions;
    }

    const top_series_keys = new Set(model_series.map((item) => item.key));
    const has_other_series = top_series_keys.has(other_series_key);
    const usage_by_date = new Map<string, Map<string, number>>();

    for (const entry of data.daily_model_usage) {
      const series_key = get_model_key(entry);
      const target_key =
        top_series_keys.has(series_key) || !has_other_series
          ? series_key
          : other_series_key;
      const date_usage =
        usage_by_date.get(entry.date) ?? new Map<string, number>();
      date_usage.set(
        target_key,
        (date_usage.get(target_key) ?? 0) + entry.session_equivalent_count,
      );
      usage_by_date.set(entry.date, date_usage);
    }

    return filled_sessions.map((entry) => {
      const row: Record<string, number | string> = {
        date: entry.date,
        count: entry.count,
      };
      for (const series of model_series) {
        row[series.key] = 0;
      }

      const date_usage = usage_by_date.get(entry.date);
      let assigned_total = 0;
      if (date_usage) {
        for (const [series_key, value] of date_usage.entries()) {
          row[series_key] = (row[series_key] as number) + value;
          assigned_total += value;
        }
      }

      if (has_other_series && assigned_total < entry.count) {
        row[other_series_key] =
          (row[other_series_key] as number) + (entry.count - assigned_total);
      }

      return row;
    });
  }, [data, filled_sessions, hourly_sessions, is_today, model_series]);

  const show_model_stack = !is_today && model_series.length > 0;

  if (!data) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Usage Trend
        </span>
        <Separator className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/usage" })}
        >
          Details
        </Button>
      </div>
      <ChartContainer
        config={chart_config}
        className={cn("w-full", show_model_stack ? "h-52" : "h-36")}
      >
        <BarChart data={chart_data} barCategoryGap={show_model_stack ? 6 : 8}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            className="stroke-muted"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => {
              if (typeof value !== "string") return String(value ?? "");
              return is_today
                ? format_hour_label(value)
                : format_date_label(value);
            }}
            interval="preserveStartEnd"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
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
                labelFormatter={(value) => {
                  if (typeof value !== "string") return value;
                  return is_today
                    ? format_hour_label(value)
                    : format_date_label(value);
                }}
                formatter={(value, name, item) => (
                  <>
                    <div
                      className="size-2.5 rounded-[2px]"
                      style={{
                        backgroundColor:
                          item.color ?? item.payload?.fill ?? session_bar_color,
                      }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">
                        {chart_config[String(name)]?.label ?? String(name)}
                      </span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {typeof value === "number"
                          ? format_session_value(value)
                          : String(value)}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          {show_model_stack ? (
            model_series.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId="models"
                fill={series.color}
                radius={
                  index === model_series.length - 1
                    ? [2, 2, 0, 0]
                    : [0, 0, 0, 0]
                }
              />
            ))
          ) : (
            <Bar
              dataKey="count"
              fill={session_bar_color}
              radius={[2, 2, 0, 0]}
            />
          )}
        </BarChart>
      </ChartContainer>

      {show_model_stack ? <TrendLegend series={model_series} /> : null}
    </div>
  );
}
