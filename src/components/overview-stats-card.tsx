import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OverviewStatsRow {
  label: string;
  value: string;
  context?: string;
  href?: string;
}

interface OverviewStatsCardProps {
  rows: OverviewStatsRow[];
}

function OverviewStatsCardRow({ row }: { row: OverviewStatsRow }) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "w-full px-2 text-left",
        row.href &&
          "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
      onClick={() => (row.href ? navigate({ to: row.href }) : null)}
    >
      <div className={cn("space-y-0.5 text-sm pb-1")}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate lowercase text-muted-foreground text-xs">
            {row.label}
          </div>
          <div className="shrink-0 tabular-nums text-foreground text-sm">
            {row.value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverviewStatsCard({ rows }: OverviewStatsCardProps) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <CardContent className="px-0 py-2">
        {rows.map((row) => (
          <OverviewStatsCardRow key={row.label} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}
