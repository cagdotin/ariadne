import { useMemo, useState } from "react";
import type { DayCount } from "../schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ActivityHeatmapProps {
  data: DayCount[];
}

/** Format a Date as "YYYY-MM-DD" in UTC */
function format_utc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Create a UTC midnight date */
function utc_date(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Add days to a UTC date */
function add_days(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Get day of week: 0=Mon, 6=Sun */
function utc_weekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

interface TooltipInfo {
  date: string;
  count: number;
  x: number;
  y: number;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const weeks = 52;
  const [tooltip, set_tooltip] = useState<TooltipInfo | null>(null);

  const { grid, month_labels, max_count } = useMemo(() => {
    // Build lookup map: "YYYY-MM-DD" -> count
    const data_map = new Map<string, number>();
    for (const item of data) {
      data_map.set(item.date, item.count);
    }

    // Today at midnight UTC
    const now = new Date();
    const today = utc_date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const today_day = utc_weekday(today); // 0=Mon, 6=Sun

    // End of grid is this Saturday (end of current week)
    const end = add_days(today, 6 - today_day);

    // Start of grid is 52 weeks before the start of current week
    const start = add_days(end, -(weeks * 7) + 1);

    // Build grid: weeks × 7 days
    const grid: Array<{ date: string; count: number; day: number; week: number }> = [];
    let mx = 0;

    for (let i = 0; i < weeks * 7; i++) {
      const d = add_days(start, i);
      const week = Math.floor(i / 7);
      const day = i % 7; // 0=Mon, 6=Sun
      const date_str = format_utc(d);
      const count = data_map.get(date_str) ?? 0;
      if (count > mx) mx = count;
      grid.push({ date: date_str, count, day, week });
    }

    // Month labels: check the first Monday of each week
    const labels: Array<{ label: string; week: number }> = [];
    let prev_month = -1;
    for (let w = 0; w < weeks; w++) {
      const d = add_days(start, w * 7);
      const month = d.getUTCMonth();
      if (month !== prev_month) {
        labels.push({
          label: d.toLocaleDateString("en", { month: "short", timeZone: "UTC" }),
          week: w,
        });
        prev_month = month;
      }
    }

    return { grid, month_labels: labels, max_count: mx };
  }, [data]);

  const get_level = (count: number): number => {
    if (count === 0) return 0;
    if (max_count <= 4) {
      return Math.min(count, 4);
    }
    const q = max_count / 4;
    if (count <= q) return 1;
    if (count <= q * 2) return 2;
    if (count <= q * 3) return 3;
    return 4;
  };

  const day_labels = ["Mon", "", "Wed", "", "Fri", "", ""];

  // Build a column-oriented lookup: grid[week][day]
  const by_week: Array<Array<(typeof grid)[0]>> = Array.from({ length: weeks }, () => []);
  for (const cell of grid) {
    by_week[cell.week][cell.day] = cell;
  }

  const format_display_date = (date_str: string): string => {
    const [y, m, d] = date_str.split("-");
    const dt = utc_date(+y, +m - 1, +d);
    return dt.toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <Card className="mb-6 min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto min-w-0 relative">
        {/* Month labels row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `28px repeat(${weeks}, 13px)`,
            gap: "2px",
            marginBottom: "2px",
          }}
        >
          <div />
          {Array.from({ length: weeks }, (_, w) => {
            const label = month_labels.find((m) => m.week === w);
            return (
              <div
                key={w}
                style={{
                  fontSize: "10px",
                  color: "var(--muted-foreground)",
                  lineHeight: "14px",
                }}
              >
                {label?.label ?? ""}
              </div>
            );
          })}
        </div>

        {/* Heatmap: 7 rows (Mon–Sun), each row = day label + 52 cells */}
        {Array.from({ length: 7 }, (_, day) => (
          <div
            key={day}
            style={{
              display: "grid",
              gridTemplateColumns: `28px repeat(${weeks}, 13px)`,
              gap: "2px",
              marginBottom: "2px",
            }}
          >
            {/* Day label */}
            <div
              style={{
                fontSize: "10px",
                color: "var(--muted-foreground)",
                display: "flex",
                alignItems: "center",
                lineHeight: "12px",
              }}
            >
              {day_labels[day]}
            </div>

            {/* Cells for this day across all weeks */}
            {Array.from({ length: weeks }, (_, week) => {
              const cell = by_week[week]?.[day];
              if (!cell) return <div key={week} style={{ width: 11, height: 11 }} />;
              const level = get_level(cell.count);
              return (
                <div
                  key={week}
                  className={`heatmap-cell level-${level}`}
                  style={{ width: 11, height: 11, borderRadius: 2, cursor: "default" }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const container = e.currentTarget.closest("[data-slot='card']");
                    const container_rect = container?.getBoundingClientRect() ?? rect;
                    set_tooltip({
                      date: cell.date,
                      count: cell.count,
                      x: rect.left - container_rect.left + rect.width / 2,
                      y: rect.top - container_rect.top - 4,
                    });
                  }}
                  onMouseLeave={() => set_tooltip(null)}
                />
              );
            })}
          </div>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              zIndex: 50,
            }}
          >
            <div
              className="bg-popover text-popover-foreground border border-border shadow-md"
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                whiteSpace: "nowrap",
                lineHeight: 1.4,
              }}
            >
              <div className="font-medium">{format_display_date(tooltip.date)}</div>
              <div className="text-muted-foreground">
                {tooltip.count} session{tooltip.count !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--muted-foreground)",
          }}
        >
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`heatmap-cell level-${level}`}
              style={{ width: 11, height: 11, borderRadius: 2 }}
            />
          ))}
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
