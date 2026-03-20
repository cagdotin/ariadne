import { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import type { ToolDetailResponse, AnalyticsOverview } from "../schemas/analytics";
import { get_tool_details, get_analytics_overview } from "../api/analytics";
import { format_number } from "../lib/format";
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

const TOOL_LABELS: Record<string, string> = {
  bash: "Bash Commands",
  read: "Read Files",
  edit: "Edit Files",
  write: "Write Files",
};

const ITEM_LABEL: Record<string, string> = {
  bash: "Program",
  read: "File",
  edit: "File",
  write: "File",
};

export function ToolDetail() {
  const { tool_name } = useParams({ strict: false }) as { tool_name: string };

  const [data, set_data] = useState<ToolDetailResponse | null>(null);
  const [projects, set_projects] = useState<string[]>([]);
  const [selected_project, set_selected_project] = useState<string>("");
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Fetch project list once
  useEffect(() => {
    get_analytics_overview().then((overview: AnalyticsOverview) => {
      const names = overview.projects
        .sort((a, b) => b.session_count - a.session_count)
        .map((p) => p.name);
      set_projects(names);
    });
  }, []);

  // Fetch tool details when tool or project changes
  useEffect(() => {
    if (!tool_name) return;
    const fetch = async () => {
      try {
        set_loading(true);
        set_error(null);
        const result = await get_tool_details(
          tool_name,
          selected_project || undefined,
        );
        set_data(result);
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "Failed to load tool details",
        );
      } finally {
        set_loading(false);
      }
    };
    fetch();
  }, [tool_name, selected_project]);

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

  const label = TOOL_LABELS[tool_name ?? ""] ?? tool_name;
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
    <div className="min-w-0 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">{label}</h1>

        {/* Project filter */}
        <select
          value={selected_project}
          onChange={(e) => set_selected_project(e.target.value)}
          className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground min-w-[180px]"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Calls" value={format_number(data.total_calls)} />
        <StatCard label="Errors" value={format_number(data.total_errors)} />
        <StatCard
          label={`Unique ${item_label}s`}
          value={format_number(data.items.length)}
        />
      </div>

      {/* Usage over time */}
      {data.by_date.length > 0 && (
        <Card className="mb-6 min-w-0 overflow-hidden">
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
      <Card className="mb-6 min-w-0 overflow-hidden">
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

      {/* By project */}
      {data.by_project.length > 0 && (
        <Card className="mb-6 min-w-0 overflow-hidden">
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
