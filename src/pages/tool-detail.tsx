import { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import type { ToolDetailResponse } from "../schemas/analytics";
import { get_tool_details } from "../api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { format_number } from "../lib/format";
import { error_message } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "../components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, BarChart, Bar } from "recharts";
import { DataTable } from "@/components/data-table";
import { create_tool_item_columns } from "@/components/columns/tool-item-columns";

const ITEM_LABEL: Record<string, string> = {
  bash: "Program",
  read: "File",
  edit: "File",
  write: "File",
};

export function ToolDetail() {
  const { tool_name } = useParams({ strict: false }) as { tool_name: string };
  const { scope } = use_project_scope();
  const project_path = scope?.project_path;

  const [data, set_data] = useState<ToolDetailResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Fetch tool details when tool or scope changes
  useEffect(() => {
    if (!tool_name) return;
    let cancelled = false;
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const result = await get_tool_details(tool_name, project_path);
        if (cancelled) return;
        set_data(result);
      } catch (err) {
        if (cancelled) return;
        set_error(
          error_message(err, "Failed to load tool details"),
        );
      } finally {
        if (!cancelled) set_loading(false);
      }
    };
    fetch_data();
    return () => { cancelled = true; };
  }, [tool_name, project_path]);

  if (loading) {
    return (
      <div className="min-w-0 w-full space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
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

  if (!data) return null;

  const item_label = ITEM_LABEL[tool_name ?? ""] ?? "Item";

  const max_item_count = data.items.length > 0
    ? Math.max(...data.items.map((i) => i.count))
    : 1;

  const area_config: ChartConfig = {
    count: { label: "Calls", color: "var(--chart-1)" },
  };

  const bar_config: ChartConfig = {
    total_calls: { label: "Calls", color: "var(--chart-1)" },
  };

  return (
    <div className="min-w-0 w-full space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Calls" value={format_number(data.total_calls)} />
        <StatCard label="Errors" value={format_number(data.total_errors)} />
        <StatCard
          label={`Unique ${item_label}s`}
          value={format_number(data.items.length)}
        />
      </div>

      {/* Usage over time */}
      {data.by_date.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ChartContainer config={area_config} className="h-[200px] w-full">
              <AreaChart data={data.by_date} margin={{ left: 0, right: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--chart-1)"
                  fill="var(--chart-1)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Top items table */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">
            {tool_name === "bash" ? "Programs" : "Files"} ({data.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="max-h-[400px] overflow-y-auto">
            <DataTable
              columns={create_tool_item_columns(max_item_count)}
              data={data.items}
              filter_column="name"
              filter_placeholder={`Search ${tool_name === "bash" ? "programs" : "files"}...`}
            />
          </div>
        </CardContent>
      </Card>

      {/* By project — only in all-projects mode */}
      {!scope && data.by_project.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">By Project</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ChartContainer
              config={bar_config}
              className="h-[300px] w-full"
            >
              <BarChart
                data={data.by_project.slice(0, 15)}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="project_name"
                  width={120}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="total_calls"
                  fill="var(--chart-1)"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ChartContainer>

            {/* Project details table */}
            <div className="w-full overflow-x-auto mt-4">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[25%]">Project</TableHead>
                    <TableHead className="w-[15%] text-right">Calls</TableHead>
                    <TableHead className="w-[60%]">
                      Top {item_label}s
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_project.map((p) => (
                    <TableRow key={p.project_name}>
                      <TableCell className="truncate font-medium">
                        {p.project_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {format_number(p.total_calls)}
                      </TableCell>
                      <TableCell className="truncate text-xs text-muted-foreground font-mono">
                        {p.items.map((i) => i.name).join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
