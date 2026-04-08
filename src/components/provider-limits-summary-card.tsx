import { RefreshCw, Clock, AlertCircle, Gauge } from "lucide-react";
import { use_provider_limits } from "@/components/provider-limits-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProviderLimitSnapshot, ProviderLimitWindow } from "@contracts/provider-limits";

function format_reset_time(resets_at: string | null): string | null {
  if (!resets_at) return null;
  const reset = new Date(resets_at);
  const now = new Date();
  const diff_ms = reset.getTime() - now.getTime();

  if (diff_ms <= 0) return "resetting…";

  const mins = Math.floor(diff_ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remaining_mins = mins % 60;
  if (hrs < 24) return remaining_mins > 0 ? `${hrs}h ${remaining_mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remaining_hrs = hrs % 24;
  return remaining_hrs > 0 ? `${days}d ${remaining_hrs}h` : `${days}d`;
}

function usage_color(used_percent: number): string {
  if (used_percent >= 90) return "var(--chart-5)";
  if (used_percent >= 70) return "var(--chart-4)";
  return "var(--chart-1)";
}

function source_label(source: string): string {
  switch (source) {
    case "codex-app-server":
      return "App Server";
    case "codex-session-log":
      return "Session Log";
    default:
      return source;
  }
}

function WindowRow({ window: w }: { window: ProviderLimitWindow }) {
  const used = w.used_percent ?? 0;
  const reset = format_reset_time(w.resets_at);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{w.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-foreground tabular-nums font-medium">
            {used.toFixed(0)}% used
          </span>
          {reset && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              {reset}
            </span>
          )}
        </div>
      </div>
      <Progress
        value={used}
        trackClassName="h-2"
        indicatorStyle={{ backgroundColor: usage_color(used) }}
      />
    </div>
  );
}

function ProviderSummary({ snapshot }: { snapshot: ProviderLimitSnapshot }) {
  const is_error = snapshot.status === "error";
  const is_stale = snapshot.status === "stale";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{snapshot.provider_label}</span>
        {snapshot.plan_type && (
          <Badge variant="secondary" className="text-[10px] uppercase">
            {snapshot.plan_type}
          </Badge>
        )}
        {is_stale && (
          <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">
            stale
          </Badge>
        )}
        {is_error && (
          <Badge variant="destructive" className="text-[10px]">
            error
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          via {source_label(snapshot.source)}
        </span>
      </div>

      {snapshot.account_label && (
        <p className="text-xs text-muted-foreground -mt-1">{snapshot.account_label}</p>
      )}

      {is_error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{snapshot.error_message ?? "Failed to fetch limits"}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshot.windows.map((w) => (
            <WindowRow key={w.id} window={w} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProviderLimitsSummaryCard() {
  const { snapshots, loading, refreshing, refresh } = use_provider_limits();

  if (loading && snapshots.length === 0) {
    return <Skeleton className="h-[140px]" />;
  }

  if (snapshots.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="size-4" />
          Provider Limits
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="h-7 px-2"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="ml-1.5 text-xs">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {snapshots.map((s) => (
          <ProviderSummary key={s.provider_id} snapshot={s} />
        ))}
      </CardContent>
    </Card>
  );
}
