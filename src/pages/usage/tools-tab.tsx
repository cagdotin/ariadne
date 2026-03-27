import type { AnalyticsOverview } from "@/schemas/analytics";
import { format_number } from "@/lib/format";
import { ToolUsageBar } from "@/components/tool-usage-bar";
import { ToolDetailBreakdown } from "@/components/tool-detail-breakdown";
import { MiniStat } from "./mini-stat";
import { use_usage_context } from "./usage-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface ToolsTabProps {
  overview: AnalyticsOverview;
}

function ToolStatCards({ overview }: ToolsTabProps) {
  const error_rate =
    overview.total_tool_calls > 0
      ? (overview.total_tool_errors / overview.total_tool_calls) * 100
      : 0;

  return (
    <div className="flex flex-wrap gap-3">
      <MiniStat label="Total Calls" value={format_number(overview.total_tool_calls)} />
      <MiniStat label="Errors" value={format_number(overview.total_tool_errors)} />
      <MiniStat label="Error Rate" value={`${error_rate.toFixed(1)}%`} />
      <MiniStat label="Unique Tools" value={format_number(overview.tools.length)} />
    </div>
  );
}

function ToolErrorRates({ overview }: ToolsTabProps) {
  const tools_with_errors = overview.tools
    .filter((t) => t.total_errors > 0)
    .map((t) => ({
      name: t.name,
      calls: t.total_calls,
      errors: t.total_errors,
      rate: (t.total_errors / t.total_calls) * 100,
    }))
    .sort((a, b) => b.rate - a.rate);

  if (tools_with_errors.length === 0) return null;

  const max_rate = Math.max(...tools_with_errors.map((t) => t.rate), 1);

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-base font-semibold">Error Rates by Tool</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tools with errors, sorted by failure rate
        </p>
      </div>
      <div className="p-4 space-y-2.5">
        {tools_with_errors.map((tool) => (
          <div key={tool.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs">{tool.name}</span>
              <div className="text-right tabular-nums text-xs">
                <span className="text-destructive font-medium">
                  {tool.rate.toFixed(1)}%
                </span>
                <span className="text-muted-foreground ml-2">
                  ({tool.errors}/{tool.calls})
                </span>
              </div>
            </div>
            <Progress
              value={(tool.rate / max_rate) * 100}
              className="gap-0"
              trackClassName="h-1.5"
              indicatorClassName="bg-destructive/70"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolsTab({ overview }: ToolsTabProps) {
  return (
    <div className="space-y-4">
      <ToolStatCards overview={overview} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
        <ToolUsageBar tools={overview.tools} />
        <ToolErrorRates overview={overview} />
      </div>

      <ToolDetailBreakdown
        bash_commands={overview.top_bash_commands}
        read_files={overview.top_read_files}
        edit_files={overview.top_edit_files}
        write_files={overview.top_write_files}
      />
    </div>
  );
}

export function ToolsPage() {
  const { overview, loading, error } = use_usage_context();

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (loading || !overview) {
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

  return <ToolsTab overview={overview} />;
}
