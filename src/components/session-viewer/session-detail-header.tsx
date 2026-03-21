import type { SessionHeader, SessionEntry } from "./types";
import { compute_stats } from "./utils";
import { format_cost, format_tokens, format_duration } from "@/lib/format";
import {
  MessageSquare,
  Wrench,
  Coins,
  Cpu,
  Hash,
  Clock,
} from "lucide-react";

interface SessionDetailHeaderProps {
  header: SessionHeader | null;
  entries: SessionEntry[];
}

export function SessionDetailHeader({ header, entries }: SessionDetailHeaderProps) {
  const stats = compute_stats(entries);
  const total_cost =
    stats.cost.input + stats.cost.output + stats.cost.cache_read + stats.cost.cache_write;
  const total_tokens =
    stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_write;

  // Compute duration from first to last timestamp
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

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            Session: {header?.id ?? "unknown"}
          </h2>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {start_date}
            {header?.cwd && (
              <span className="ml-3 font-mono opacity-60">{header.cwd}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatPill
          icon={<MessageSquare className="size-3.5" />}
          label="Messages"
          value={`${stats.user_messages}↑ ${stats.assistant_messages}↓`}
        />
        <StatPill
          icon={<Wrench className="size-3.5" />}
          label="Tool Calls"
          value={String(stats.tool_calls)}
        />
        <StatPill
          icon={<Hash className="size-3.5" />}
          label="Tokens"
          value={format_tokens(total_tokens)}
          sub={`↑${format_tokens(stats.tokens.input)} ↓${format_tokens(stats.tokens.output)}`}
        />
        <StatPill
          icon={<Coins className="size-3.5" />}
          label="Cost"
          value={format_cost(total_cost)}
        />
        <StatPill
          icon={<Clock className="size-3.5" />}
          label="Duration"
          value={format_duration(duration_seconds)}
        />
        <StatPill
          icon={<Cpu className="size-3.5" />}
          label="Models"
          value={stats.models.length ? stats.models.join(", ") : "—"}
          truncate
        />
      </div>
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  sub,
  truncate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  truncate?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div
        className={`text-sm font-semibold text-foreground ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
