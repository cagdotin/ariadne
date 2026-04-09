import { useMemo } from "react";
import type { SessionSummary, ToolCallSummary } from "@contracts/sessions/summary";
import { format_number } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SectionLabel, EmptyState, ToolRow, DetailSection } from "./sidebar-primitives";
import {
  Terminal,
  FileText,
  FilePen,
  FilePlus2,
  Cpu,
  AlertCircle,
} from "lucide-react";

interface SessionSidebarAnalyticsProps {
  session: SessionSummary;
}

interface NameCount {
  name: string;
  count: number;
}

interface ToolAgg {
  name: string;
  total_calls: number;
  total_errors: number;
}

function to_name_counts(map: Record<string, number>): NameCount[] {
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function to_tool_aggregates(map: Record<string, ToolCallSummary>): ToolAgg[] {
  return Object.values(map)
    .map((tc) => ({
      name: tc.name,
      total_calls: tc.calls,
      total_errors: tc.errors,
    }))
    .sort((a, b) => b.total_calls - a.total_calls);
}

const TOOL_COLORS: Record<string, string> = {
  bash: "var(--chart-1)",
  read: "var(--chart-2)",
  edit: "var(--chart-3)",
  write: "var(--chart-4)",
  grep: "var(--chart-5)",
  find: "var(--chart-1)",
  ls: "var(--chart-2)",
  todo: "var(--chart-3)",
  expertise: "var(--chart-4)",
  track: "var(--chart-5)",
};

function get_tool_color(name: string, index: number): string {
  return TOOL_COLORS[name] ?? `var(--chart-${(index % 5) + 1})`;
}

export function SessionSidebarAnalytics({ session }: SessionSidebarAnalyticsProps) {
  const tools = useMemo(() => to_tool_aggregates(session.tool_calls), [session.tool_calls]);
  const bash_commands = useMemo(() => to_name_counts(session.bash_commands), [session.bash_commands]);
  const read_files = useMemo(() => to_name_counts(session.read_files), [session.read_files]);
  const edit_files = useMemo(() => to_name_counts(session.edit_files), [session.edit_files]);
  const write_files = useMemo(() => to_name_counts(session.write_files), [session.write_files]);

  const max_tool_calls = tools.length > 0 ? tools[0].total_calls : 1;
  const total_tool_calls = tools.reduce((sum, t) => sum + t.total_calls, 0);
  const total_errors = tools.reduce((sum, t) => sum + t.total_errors, 0);

  const models = session.models_used;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Tool calls overview */}
      <div className="px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Tool Calls</SectionLabel>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {format_number(total_tool_calls)} total
            </span>
            {total_errors > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                <AlertCircle className="size-2.5" />
                {total_errors}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {tools.map((tool, i) => (
            <ToolRow
              key={tool.name}
              name={tool.name}
              calls={tool.total_calls}
              errors={tool.total_errors}
              max={max_tool_calls}
              color={get_tool_color(tool.name, i)}
            />
          ))}
          {tools.length === 0 && (
            <EmptyState>No tool calls in this session</EmptyState>
          )}
        </div>
      </div>

      {/* Models */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-1.5 mb-3">
          <Cpu className="size-3 text-muted-foreground" />
          <SectionLabel>Models Used</SectionLabel>
        </div>
        {models.length === 0 ? (
          <EmptyState>No model data</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {models.map((m) => (
              <div key={`${m.provider}/${m.model_id}`} className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-foreground truncate min-w-0" title={`${m.provider}/${m.model_id}`}>
                  {m.model_id}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 tabular-nums">
                  {m.message_count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bash commands */}
      <DetailSection icon={<Terminal className="size-3" />} label="Bash Commands" items={bash_commands} />

      {/* Read files */}
      <DetailSection icon={<FileText className="size-3" />} label="Files Read" items={read_files} shorten_paths />

      {/* Edit files */}
      <DetailSection icon={<FilePen className="size-3" />} label="Files Edited" items={edit_files} shorten_paths />

      {/* Write files */}
      <DetailSection icon={<FilePlus2 className="size-3" />} label="Files Written" items={write_files} shorten_paths />
    </div>
  );
}
