import { useNavigate } from "@tanstack/react-router";
import type { ToolAggregate } from "../schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Cell } from "recharts";

interface ToolUsageBarProps {
  tools: ToolAggregate[];
}

const CLICKABLE_TOOLS = new Set(["bash", "read", "edit", "write"]);

const chart_config = {
  success: {
    label: "Success",
    color: "var(--chart-1)",
  },
  errors: {
    label: "Errors",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

export function ToolUsageBar({ tools }: ToolUsageBarProps) {
  const navigate = useNavigate();

  const sorted_tools = [...tools]
    .sort((a, b) => b.total_calls - a.total_calls)
    .slice(0, 12);

  const chart_data = sorted_tools.map((tool) => ({
    name: tool.name,
    success: tool.total_calls - tool.total_errors,
    errors: tool.total_errors,
  }));

  const handle_click = (data: { name?: string }) => {
    if (data.name && CLICKABLE_TOOLS.has(data.name)) {
      navigate({ to: `/tools/${data.name}` });
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Tool Usage</CardTitle>
        <p className="text-xs text-muted-foreground">
          Click bash, read, edit, or write for details
        </p>
      </CardHeader>
      <CardContent className="min-w-0">
        <ChartContainer config={chart_config} className="h-[300px] w-full">
          <BarChart
            data={chart_data}
            layout="vertical"
            margin={{ left: 8, right: 8 }}
            onClick={(e) => {
              if (e?.activeLabel) handle_click({ name: e.activeLabel });
            }}
            style={{ cursor: "pointer" }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              interval={0}
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
                const is_clickable = CLICKABLE_TOOLS.has(payload.value);
                return (
                  <text
                    x={x}
                    y={y}
                    dy={4}
                    textAnchor="end"
                    fontSize={11}
                    fill={is_clickable ? "var(--chart-1)" : "var(--muted-foreground)"}
                    style={{ cursor: is_clickable ? "pointer" : "default" }}
                    onClick={() => {
                      if (is_clickable) navigate({ to: `/tools/${payload.value}` });
                    }}
                  >
                    {payload.value}
                  </text>
                );
              }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="success" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="errors" stackId="a" fill="var(--destructive)" radius={[0, 2, 2, 0]}>
              {chart_data.map((_, i) => (
                <Cell key={i} fill="var(--destructive)" />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
