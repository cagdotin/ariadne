import { useMemo, useRef } from "react";
import type { FileInsight } from "@/lib/file-analytics";
import { OP_HUE, intensity_fill } from "@/lib/file-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format_number } from "@/lib/format";
import { strip_project_prefix } from "@/lib/path-utils";
import { use_container_width } from "@/hooks/use-container-width";

// ── Types ──────────────────────────────────────────────────────────────

interface FileImbalanceChartProps {
  insights: FileInsight[];
  project_path?: string;
}

interface ImbalanceRow {
  name: string;
  full_path: string;
  reads: number;
  edits: number;
  writes: number;
  total: number;
  change_ratio: number; // (edits + writes) / total
  read_ratio: number;   // reads / total
}

const MAX_ROWS = 25;

// ── Main ───────────────────────────────────────────────────────────────

export function FileImbalanceChart({ insights, project_path }: FileImbalanceChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cw = use_container_width(ref);

  const rows = useMemo(() => {
    // Only include files with meaningful activity
    const min_ops = 2;
    const eligible = insights.filter((f) => f.total_count >= min_ops);

    const mapped: ImbalanceRow[] = eligible.map((f) => {
      const name = strip_project_prefix(f.path, project_path);
      const changes = f.edit_count + f.write_count;
      return {
        name,
        full_path: f.path,
        reads: f.read_count,
        edits: f.edit_count,
        writes: f.write_count,
        total: f.total_count,
        change_ratio: f.total_count > 0 ? changes / f.total_count : 0,
        read_ratio: f.total_count > 0 ? f.read_count / f.total_count : 0,
      };
    });

    // Sort by the most "imbalanced" — highest change_ratio first, then highest read_ratio
    // This surfaces files that are almost all mutations or almost all reads
    mapped.sort((a, b) => {
      // Imbalance score: how far from 50/50 read vs change
      const a_skew = Math.abs(a.change_ratio - 0.5);
      const b_skew = Math.abs(b.change_ratio - 0.5);
      if (Math.abs(b_skew - a_skew) > 0.01) return b_skew - a_skew;
      return b.total - a.total;
    });

    return mapped.slice(0, MAX_ROWS);
  }, [insights, project_path]);

  if (rows.length === 0) {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Read vs Change Imbalance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-none border border-dashed">
            <p className="text-sm text-muted-foreground">
              No file activity to analyze.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Bar layout constants
  const label_width = Math.min(Math.max(Math.round(cw * 0.3), 120), 240);
  const bar_width = cw - label_width - 80; // 80 for padding/counts
  const row_h = 24;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Read vs Change Imbalance</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Files ranked by how skewed their operation mix is.
          Bars show the <span className="text-blue-400 font-medium">read</span> vs{" "}
          <span className="text-green-400 font-medium">edit</span>+<span className="text-orange-400 font-medium">write</span> split.
          Files near the extremes are unusual — either read-only references or heavily mutated.
        </p>
      </CardHeader>
      <CardContent ref={ref}>
        <div className="space-y-px">
          {rows.map((row) => {
            const read_w = bar_width > 0 ? Math.round(row.read_ratio * bar_width) : 0;
            const change_w = bar_width > 0 ? bar_width - read_w : 0;

            // Intensity: brighter if the dominant side has more ops
            const read_intensity = row.read_ratio > 0 ? 0.4 + row.read_ratio * 0.6 : 0;
            const change_intensity = row.change_ratio > 0 ? 0.4 + row.change_ratio * 0.6 : 0;

            const read_fill = intensity_fill(OP_HUE.read, read_intensity);
            const edit_ratio = row.total > 0 ? row.edits / row.total : 0;
            const write_ratio = row.total > 0 ? row.writes / row.total : 0;
            // Blend edit/write hue for the change portion
            const change_hue = edit_ratio >= write_ratio ? OP_HUE.edit : OP_HUE.write;
            const change_fill = intensity_fill(change_hue, change_intensity);

            return (
              <div
                key={row.full_path}
                className="flex items-center gap-1.5 group hover:bg-muted/30 rounded-sm transition-colors"
                style={{ height: row_h }}
                title={`${row.full_path}\nR: ${row.reads}  E: ${row.edits}  W: ${row.writes}  Total: ${row.total}`}
              >
                <div
                  className="shrink-0 truncate text-[11px] font-mono text-foreground/70 text-right pr-1"
                  style={{ width: label_width }}
                >
                  {row.name}
                </div>
                <div className="flex" style={{ width: bar_width, height: 16 }}>
                  {read_w > 0 && (
                    <div
                      className="rounded-l-sm"
                      style={{ width: read_w, height: "100%", background: read_fill }}
                    />
                  )}
                  {change_w > 0 && (
                    <div
                      className={read_w > 0 ? "rounded-r-sm" : "rounded-sm"}
                      style={{ width: change_w, height: "100%", background: change_fill }}
                    />
                  )}
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground w-12 text-right">
                  {format_number(row.total)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
