import type { SessionHeader, SessionEntry } from "../types";
import { compute_stats } from "../utils";
import { format_cost, format_tokens, format_duration } from "@/lib/format";
import { SectionLabel, MetricCell, BreakdownRow } from "./sidebar-primitives";
import {
  MessageSquare,
  Wrench,
  Coins,
  Hash,
  Clock,
  Cpu,
  ArrowUp,
  ArrowDown,
  Layers,
  FolderOpen,
  GitBranch,
} from "lucide-react";

interface SessionSidebarDetailsProps {
  header: SessionHeader | null;
  entries: SessionEntry[];
}

export function SessionSidebarDetails({ header, entries }: SessionSidebarDetailsProps) {
  const stats = compute_stats(entries);
  const total_cost =
    stats.cost.input + stats.cost.output + stats.cost.cache_read + stats.cost.cache_write;
  const total_tokens =
    stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_write;

  let duration_seconds: number | null = null;
  if (entries.length > 1) {
    const first = new Date(entries[0].timestamp).getTime();
    const last = new Date(entries[entries.length - 1].timestamp).getTime();
    if (!isNaN(first) && !isNaN(last)) {
      duration_seconds = (last - first) / 1000;
    }
  }

  const start_date = header?.timestamp
    ? new Date(header.timestamp).toLocaleString()
    : "unknown";

  const cwd = header?.cwd ?? "";
  const project_name = cwd.split("/").pop() ?? cwd;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Session identity */}
      <div className="px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{project_name}</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono leading-relaxed space-y-1">
          <div className="truncate" title={header?.id}>{header?.id ?? "—"}</div>
          <div>{start_date}</div>
          {cwd && <div className="truncate opacity-60" title={cwd}>{cwd}</div>}
        </div>
      </div>

      {/* Key metrics */}
      <div className="px-5 py-4 border-b border-border/50">
        <SectionLabel>Overview</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <MetricCell
            icon={<Clock className="size-3" />}
            label="Duration"
            value={format_duration(duration_seconds)}
          />
          <MetricCell
            icon={<Coins className="size-3" />}
            label="Cost"
            value={format_cost(total_cost)}
          />
          <MetricCell
            icon={<Hash className="size-3" />}
            label="Tokens"
            value={format_tokens(total_tokens)}
          />
          <MetricCell
            icon={<Wrench className="size-3" />}
            label="Tool Calls"
            value={String(stats.tool_calls)}
          />
          <MetricCell
            icon={<MessageSquare className="size-3" />}
            label="Messages"
            value={`${stats.user_messages}↑ ${stats.assistant_messages}↓`}
          />
          <MetricCell
            icon={<Layers className="size-3" />}
            label="Compactions"
            value={String(stats.compactions)}
          />
        </div>
      </div>

      {/* Token breakdown */}
      <div className="px-5 py-4 border-b border-border/50">
        <SectionLabel>Tokens</SectionLabel>
        <div className="mt-3 space-y-2.5">
          <BreakdownRow icon={<ArrowUp className="size-2.5" />} label="Input" value={format_tokens(stats.tokens.input)} bar_pct={total_tokens > 0 ? (stats.tokens.input / total_tokens) * 100 : 0} color="var(--chart-1)" />
          <BreakdownRow icon={<ArrowDown className="size-2.5" />} label="Output" value={format_tokens(stats.tokens.output)} bar_pct={total_tokens > 0 ? (stats.tokens.output / total_tokens) * 100 : 0} color="var(--chart-3)" />
          <BreakdownRow icon={<GitBranch className="size-2.5" />} label="Cache Read" value={format_tokens(stats.tokens.cache_read)} bar_pct={total_tokens > 0 ? (stats.tokens.cache_read / total_tokens) * 100 : 0} color="var(--chart-5)" />
          <BreakdownRow icon={<GitBranch className="size-2.5" />} label="Cache Write" value={format_tokens(stats.tokens.cache_write)} bar_pct={total_tokens > 0 ? (stats.tokens.cache_write / total_tokens) * 100 : 0} color="var(--chart-4)" />
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="px-5 py-4 border-b border-border/50">
        <SectionLabel>Cost</SectionLabel>
        <div className="mt-3 space-y-2.5">
          <BreakdownRow icon={<ArrowUp className="size-2.5" />} label="Input" value={format_cost(stats.cost.input)} bar_pct={total_cost > 0 ? (stats.cost.input / total_cost) * 100 : 0} color="var(--chart-1)" />
          <BreakdownRow icon={<ArrowDown className="size-2.5" />} label="Output" value={format_cost(stats.cost.output)} bar_pct={total_cost > 0 ? (stats.cost.output / total_cost) * 100 : 0} color="var(--chart-3)" />
          <BreakdownRow icon={<GitBranch className="size-2.5" />} label="Cache Read" value={format_cost(stats.cost.cache_read)} bar_pct={total_cost > 0 ? (stats.cost.cache_read / total_cost) * 100 : 0} color="var(--chart-5)" />
          <BreakdownRow icon={<GitBranch className="size-2.5" />} label="Cache Write" value={format_cost(stats.cost.cache_write)} bar_pct={total_cost > 0 ? (stats.cost.cache_write / total_cost) * 100 : 0} color="var(--chart-4)" />
        </div>
      </div>

      {/* Models */}
      <div className="px-5 py-4">
        <SectionLabel>Models</SectionLabel>
        <div className="mt-3 space-y-1.5">
          {stats.models.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">—</span>
          ) : (
            stats.models.map((model) => (
              <div key={model} className="flex items-center gap-2">
                <Cpu className="size-2.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-mono text-foreground truncate" title={model}>
                  {model}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
