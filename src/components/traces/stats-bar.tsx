import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TraceStats } from "./types";

interface StatsBarProps {
  stats: TraceStats;
}

function StatCell({ label, value, variant }: {
  label: string;
  value: string | number;
  variant?: "default" | "destructive";
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
        {label}
      </span>
      <Badge variant={variant === "destructive" ? "destructive" : "secondary"} className="font-mono text-[11px]">
        {value}
      </Badge>
    </div>
  );
}

function format_started(iso: string): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " at " + d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="flex items-center border-b border-border bg-card shrink-0 overflow-x-auto">
      <StatCell label="Started" value={format_started(stats.started_at)} />
      <Separator orientation="vertical" className="h-5" />
      <StatCell label="Duration" value={stats.duration_formatted} />
      <Separator orientation="vertical" className="h-5" />
      <StatCell label="Events" value={stats.event_count} />
      <Separator orientation="vertical" className="h-5" />
      <StatCell label="Tools" value={stats.tool_count} />
      <Separator orientation="vertical" className="h-5" />
      <StatCell
        label="Errors"
        value={stats.error_count}
        variant={stats.error_count > 0 ? "destructive" : "default"}
      />
      <Separator orientation="vertical" className="h-5" />
      <StatCell label="Model" value={stats.model || "\u2014"} />
    </div>
  );
}
