import { Badge } from "@/components/ui/badge";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {children}
    </h3>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground/60 italic">{children}</p>;
}

export function MetricCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xs font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

export function BreakdownRow({
  icon,
  label,
  value,
  bar_pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bar_pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 w-[5.5rem] shrink-0">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 min-w-0 bg-muted/40 rounded-sm h-2 overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${Math.max(bar_pct, 0.5)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-foreground font-medium w-14 text-right shrink-0">
        {value}
      </span>
    </div>
  );
}

export function ToolRow({
  name,
  calls,
  errors,
  max,
  color,
}: {
  name: string;
  calls: number;
  errors: number;
  max: number;
  color: string;
}) {
  const success = calls - errors;

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[4.5rem] shrink-0">
        <span className="text-[11px] font-mono text-foreground">{name}</span>
      </div>
      <div className="flex-1 min-w-0 bg-muted/40 rounded-sm h-3.5 overflow-hidden flex">
        {success > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(success / max) * 100}%`,
              backgroundColor: color,
            }}
          />
        )}
        {errors > 0 && (
          <div
            className="h-full bg-destructive transition-all duration-500"
            style={{ width: `${(errors / max) * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-1 w-12 shrink-0 justify-end">
        <span className="text-[10px] tabular-nums text-foreground font-medium">
          {calls}
        </span>
        {errors > 0 && (
          <span className="text-[9px] tabular-nums text-destructive">
            ({errors})
          </span>
        )}
      </div>
    </div>
  );
}

interface NameCount {
  name: string;
  count: number;
}

function shorten_path(p: string): string {
  if (p.startsWith("/Users/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/Users/" + parts[2]).length);
  }
  if (p.startsWith("/home/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/home/" + parts[2]).length);
  }
  return p;
}

export function DetailSection({
  icon,
  label,
  items,
  max_visible = 10,
  shorten_paths = false,
}: {
  icon: React.ReactNode;
  label: string;
  items: NameCount[];
  max_visible?: number;
  shorten_paths?: boolean;
}) {
  if (items.length === 0) return null;

  const max_count = items[0]?.count ?? 1;
  const visible = items.slice(0, max_visible);
  const remaining = items.length - max_visible;

  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          <SectionLabel>{label}</SectionLabel>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {items.length} unique
        </span>
      </div>
      <div className="space-y-2">
        {visible.map((item) => {
          const display_name = shorten_paths ? shorten_path(item.name) : item.name;
          const bar_width = (item.count / max_count) * 100;
          return (
            <div key={item.name}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className="text-[10px] font-mono text-foreground/80 truncate min-w-0"
                  title={item.name}
                >
                  {display_name}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 shrink-0 tabular-nums">
                  {item.count}
                </Badge>
              </div>
              <div className="w-full bg-muted/30 rounded-sm h-0.5 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{ width: `${bar_width}%`, backgroundColor: "var(--chart-2)" }}
                />
              </div>
            </div>
          );
        })}
        {remaining > 0 && (
          <p className="text-[10px] text-muted-foreground/50 pt-0.5">
            +{remaining} more
          </p>
        )}
      </div>
    </div>
  );
}
