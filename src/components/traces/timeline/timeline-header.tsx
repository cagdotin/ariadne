interface TimelineHeaderProps {
  total_duration_ms: number;
  scale: number;
  offset_x: number;
  container_width: number;
}

function format_tick(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const total_seconds = ms / 1000;
  const minutes = Math.floor(total_seconds / 60);
  const seconds = total_seconds % 60;
  if (minutes === 0) return `${seconds.toFixed(1)}s`;
  return `${minutes}:${String(Math.floor(seconds)).padStart(2, "0")}`;
}

function compute_tick_interval(visible_duration_ms: number): number {
  const target_ticks = 10;
  const raw_interval = visible_duration_ms / target_ticks;

  const nice_intervals = [
    100, 200, 500,
    1000, 2000, 5000,
    10000, 15000, 30000,
    60000, 120000, 300000,
    600000,
  ];

  for (const interval of nice_intervals) {
    if (interval >= raw_interval) return interval;
  }
  return nice_intervals[nice_intervals.length - 1];
}

export function TimelineHeader({
  total_duration_ms,
  scale,
  offset_x,
  container_width,
}: TimelineHeaderProps) {
  const visible_duration_ms = container_width / scale;
  const tick_interval = compute_tick_interval(visible_duration_ms);

  const first_tick = Math.ceil((offset_x / scale) / tick_interval) * tick_interval;
  const ticks: number[] = [];

  for (let ms = first_tick; ms <= total_duration_ms; ms += tick_interval) {
    const x = ms * scale - offset_x;
    if (x > container_width + 50) break;
    if (x >= -50) ticks.push(ms);
  }

  return (
    <div className="flex border-b border-border">
      {/* Spacer matching lane label width */}
      <div className="w-[110px] shrink-0 border-r border-border bg-card" />

      {/* Tick marks */}
      <div className="flex-1 relative h-6 min-w-0 bg-card/50">
        {ticks.map((ms) => {
          const x = ms * scale - offset_x;
          return (
            <div
              key={ms}
              className="absolute top-0 bottom-0"
              style={{ left: `${x}px` }}
            >
              <div className="h-full w-px bg-border/60" />
              <span className="absolute top-1 left-1 text-[9px] font-mono text-muted-foreground whitespace-nowrap tabular-nums">
                {format_tick(ms)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
