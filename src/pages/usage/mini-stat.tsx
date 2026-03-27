interface MiniStatProps {
  label: string;
  value: string;
  sub?: string;
}

export function MiniStat({ label, value, sub }: MiniStatProps) {
  return (
    <div className="flex-1 min-w-[120px] rounded-lg border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
