import type { AnalyticsOverview, TimeBreakdown } from "@/schemas/analytics";
import { format_cost, format_tokens, format_number } from "@/lib/format";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ModelDistribution } from "@/components/model-distribution";
import { MiniStat } from "./mini-stat";
import { use_usage_context } from "./usage-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

interface CostTabProps {
  overview: AnalyticsOverview;
  time_data: TimeBreakdown;
}

const cost_trend_config = {
  cost: { label: "Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

function TokenBreakdown({ overview }: { overview: AnalyticsOverview }) {
  const categories = [
    { key: "input", name: "Input", tokens: overview.input_tokens, color: "var(--chart-1)" },
    { key: "output", name: "Output", tokens: overview.output_tokens, color: "var(--chart-3)" },
    { key: "cache_read", name: "Cache Read", tokens: overview.cache_read_tokens, color: "var(--chart-5)" },
    { key: "cache_write", name: "Cache Write", tokens: overview.cache_write_tokens, color: "var(--chart-4)" },
  ].filter((c) => c.tokens > 0);

  const max_tokens = Math.max(...categories.map((c) => c.tokens), 1);

  const cache_total = overview.cache_read_tokens + overview.input_tokens;
  const cache_hit_rate = cache_total > 0
    ? (overview.cache_read_tokens / cache_total) * 100
    : 0;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Token Breakdown</CardTitle>
        <p className="text-xs text-muted-foreground">
          {format_tokens(overview.total_tokens)} total tokens
          {cache_hit_rate > 0 && (
            <span className="ml-2">
              · {cache_hit_rate.toFixed(1)}% cache hit rate
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {categories.map((cat) => {
          const pct = (cat.tokens / overview.total_tokens) * 100;
          const width = (cat.tokens / max_tokens) * 100;

          return (
            <div key={cat.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 rounded-sm"
                    style={{ background: cat.color }}
                  />
                  <span className="text-muted-foreground">{cat.name}</span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="text-foreground">{format_tokens(cat.tokens)}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${width}%`, backgroundColor: cat.color }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CostTrend({ time_data }: { time_data: TimeBreakdown }) {
  if (time_data.daily_cost.length === 0) return null;

  const chart_data = time_data.daily_cost.map((d) => ({
    date: d.date,
    cost: d.cost,
  }));

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Cost Over Time</CardTitle>
        <p className="text-xs text-muted-foreground">
          {format_cost(time_data.total_cost)} total · avg {format_cost(time_data.avg_cost_per_session)}/session
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={cost_trend_config} className="h-[200px] w-full">
          <AreaChart data={chart_data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: string) => {
                const d = new Date(v + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              width={50}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.1}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function CostStatCards({ overview, time_data }: CostTabProps) {
  const avg_cost = time_data.avg_cost_per_session;
  const total_sessions = overview.total_sessions;

  return (
    <div className="flex flex-wrap gap-3">
      <MiniStat label="Total Cost" value={format_cost(overview.total_cost)} />
      <MiniStat label="Sessions" value={format_number(total_sessions)} />
      <MiniStat label="Avg / Session" value={format_cost(avg_cost)} />
      <MiniStat label="Total Tokens" value={format_tokens(overview.total_tokens)} />
    </div>
  );
}

export function CostTab({ overview, time_data }: CostTabProps) {
  return (
    <div className="space-y-4">
      <CostStatCards overview={overview} time_data={time_data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
        <CostBreakdown
          input_cost={overview.input_cost}
          output_cost={overview.output_cost}
          cache_read_cost={overview.cache_read_cost}
          cache_write_cost={overview.cache_write_cost}
        />
        <TokenBreakdown overview={overview} />
      </div>

      <CostTrend time_data={time_data} />

      <ModelDistribution models={overview.models} />
    </div>
  );
}

export function CostPage() {
  const { overview, time_data, loading, error } = use_usage_context();

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (loading || !overview || !time_data) {
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

  return <CostTab overview={overview} time_data={time_data} />;
}
