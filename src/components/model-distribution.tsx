import type { ModelAggregate } from "../schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

interface ModelDistributionProps {
  models: ModelAggregate[];
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--ring)",
  "var(--primary)",
  "var(--muted-foreground)",
];

export function ModelDistribution({ models }: ModelDistributionProps) {
  const sorted_models = [...models]
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 8);

  const chart_config: ChartConfig = Object.fromEntries(
    sorted_models.map((m, i) => [
      m.model_id,
      { label: m.model_id, color: COLORS[i % COLORS.length] },
    ])
  );

  const chart_data = sorted_models.map((m, i) => ({
    name: m.model_id,
    messages: m.message_count,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Model Distribution</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <ChartContainer config={chart_config} className="h-[300px] w-full">
          <BarChart
            data={chart_data}
            layout="vertical"
            margin={{ left: 8, right: 8 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              interval={0}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="messages" radius={[0, 2, 2, 0]}>
              {chart_data.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
