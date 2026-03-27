import { useMemo, useRef } from "react";
import type { FileInsight, OperationLens } from "@/lib/file-analytics";
import { OP_HUE, dominant_op, intensity_bucket, intensity_fill, get_lens_value } from "@/lib/file-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format_number } from "@/lib/format";
import { strip_project_prefix } from "@/lib/path-utils";
import { use_container_width } from "@/hooks/use-container-width";

// ── Types ──────────────────────────────────────────────────────────────

interface FileSessionBreadthChartProps {
  insights: FileInsight[];
  lens: OperationLens;
  project_path?: string;
}

interface BreadthRow {
  name: string;
  full_path: string;
  session_count: number;
  lens_value: number;
  total: number;
  reads: number;
  edits: number;
  writes: number;
  ops_per_session: number;
}

const MAX_ROWS = 25;

// ── Main ───────────────────────────────────────────────────────────────

export function FileSessionBreadthChart({ insights, lens, project_path }: FileSessionBreadthChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cw = use_container_width(ref);

  const has_breadth_data = useMemo(
    () => insights.some((f) => f.distinct_session_count != null && f.distinct_session_count > 0),
    [insights],
  );

  const rows = useMemo(() => {
    if (!has_breadth_data) return [];

    const eligible = insights.filter(
      (f) => f.distinct_session_count != null && f.distinct_session_count > 0 && get_lens_value(f, lens) > 0,
    );

    const mapped: BreadthRow[] = eligible.map((f) => {
      const sc = f.distinct_session_count ?? 1;
      const lv = get_lens_value(f, lens);
      return {
        name: strip_project_prefix(f.path, project_path),
        full_path: f.path,
        session_count: sc,
        lens_value: lv,
        total: f.total_count,
        reads: f.read_count,
        edits: f.edit_count,
        writes: f.write_count,
        ops_per_session: sc > 0 ? lv / sc : lv,
      };
    });

    // Sort by session count descending — broadest first
    mapped.sort((a, b) => {
      if (b.session_count !== a.session_count) return b.session_count - a.session_count;
      return b.lens_value - a.lens_value;
    });

    return mapped.slice(0, MAX_ROWS);
  }, [insights, lens, project_path, has_breadth_data]);

  if (!has_breadth_data) {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Session Breadth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              Session breadth data is not available yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Session Breadth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              No files with {lens === "all" ? "" : `${lens} `}activity in the current scope.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const max_sessions = rows.reduce((m, r) => Math.max(m, r.session_count), 1);
  const max_ops = rows.reduce((m, r) => Math.max(m, r.lens_value), 1);
  const label_width = Math.min(Math.max(Math.round(cw * 0.3), 120), 240);
  const bar_area = cw - label_width - 100;
  const row_h = 26;

  const lens_label = lens === "all" ? "ops" : lens;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Session Breadth</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Files ranked by how many distinct sessions touched them.
          Bar width = sessions, color intensity = {lens_label} per session.
          Broadly important files appear at the top; one-session noise sinks to the bottom.
        </p>
      </CardHeader>
      <CardContent ref={ref}>
        <div className="space-y-px">
          {rows.map((row) => {
            const bar_w = bar_area > 0 ? Math.max(4, Math.round((row.session_count / max_sessions) * bar_area)) : 4;
            const per_session = row.ops_per_session;
            const max_per_session = max_ops / Math.max(1, Math.sqrt(max_sessions));
            const bucket = intensity_bucket(per_session, max_per_session > 0 ? max_per_session : 1);
            const hue = lens === "all"
              ? OP_HUE[dominant_op(row.reads, row.edits, row.writes)]
              : OP_HUE[lens];
            const fill = intensity_fill(hue, Math.max(bucket, 0.3));

            return (
              <div
                key={row.full_path}
                className="flex items-center gap-1.5 hover:bg-muted/30 rounded-sm transition-colors"
                style={{ height: row_h }}
                title={`${row.full_path}\nSessions: ${row.session_count}  R: ${row.reads}  E: ${row.edits}  W: ${row.writes}  Total: ${row.total}`}
              >
                <div
                  className="shrink-0 truncate text-[11px] font-mono text-foreground/70 text-right pr-1"
                  style={{ width: label_width }}
                >
                  {row.name}
                </div>
                <div
                  className="rounded-sm"
                  style={{ width: bar_w, height: 14, background: fill }}
                />
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {row.session_count} sess
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                  · {format_number(row.lens_value)} {lens_label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
