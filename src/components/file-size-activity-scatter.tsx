import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { FileInsight, OperationLens } from "@/lib/file-analytics";
import { get_lens_value, dominant_op, OP_HUE, enrich_with_sizes } from "@/lib/file-analytics";
import { get_file_sizes } from "@/api/analytics";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell } from "recharts";
import { strip_project_prefix } from "@/lib/path-utils";
import { use_container_width } from "@/hooks/use-container-width";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format_number } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────

interface FileSizeActivityScatterProps {
  insights: FileInsight[];
  lens: OperationLens;
  project_path?: string;
}

interface ScatterPoint {
  name: string;
  full_path: string;
  size_bytes: number;
  size_kb: number;
  ops: number;
  reads: number;
  edits: number;
  writes: number;
  total: number;
  fill: string;
}

// ── Size formatting ────────────────────────────────────────────────────

function format_size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Tooltip ────────────────────────────────────────────────────────────

function ScatterTooltipContent({ active, payload, lens }: {
  active?: boolean;
  payload?: { payload?: ScatterPoint }[];
  lens?: OperationLens;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  const current_lens = lens ?? "all";

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs space-y-1 max-w-xs">
      <p className="font-medium text-sm font-mono">{d.name}</p>
      <p className="text-muted-foreground">Size: {format_size(d.size_bytes)}</p>
      <div className="flex gap-3">
        <span className={`text-blue-400 ${current_lens === "read" ? "font-bold" : ""}`}>R: {format_number(d.reads)}</span>
        <span className={`text-green-400 ${current_lens === "edit" ? "font-bold" : ""}`}>E: {format_number(d.edits)}</span>
        <span className={`text-orange-400 ${current_lens === "write" ? "font-bold" : ""}`}>W: {format_number(d.writes)}</span>
      </div>
      <p className="text-muted-foreground">{format_number(d.total)} total ops</p>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "loaded" | "error";

export function FileSizeActivityScatter({ insights, lens, project_path }: FileSizeActivityScatterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cw = use_container_width(ref);

  const [enriched, set_enriched] = useState<FileInsight[]>([]);
  const [load_state, set_load_state] = useState<LoadState>("idle");
  const [skipped_count, set_skipped_count] = useState(0);

  // Stable reference to insight paths for the effect dependency
  const paths_key = useMemo(
    () => insights.map((i) => i.path).sort().join("\n"),
    [insights],
  );

  const fetch_sizes = useCallback(async () => {
    if (insights.length === 0) {
      set_enriched([]);
      set_load_state("loaded");
      return;
    }
    set_load_state("loading");
    try {
      const paths = insights.map((i) => i.path);
      const sizes = await get_file_sizes(paths);
      const result = enrich_with_sizes(insights, sizes);
      set_enriched(result);
      const missing = result.filter((r) => r.file_size_bytes == null || r.file_size_bytes === undefined).length;
      set_skipped_count(missing);
      set_load_state("loaded");
    } catch {
      set_load_state("error");
    }
  }, [paths_key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch_sizes();
  }, [fetch_sizes]);

  const points = useMemo((): ScatterPoint[] => {
    if (load_state !== "loaded") return [];

    return enriched
      .filter((f) => {
        if (f.file_size_bytes == null || f.file_size_bytes <= 0) return false;
        return get_lens_value(f, lens) > 0;
      })
      .map((f) => {
        const ops = get_lens_value(f, lens);
        const hue = lens === "all"
          ? OP_HUE[dominant_op(f.read_count, f.edit_count, f.write_count)]
          : OP_HUE[lens];
        const sat = lens === "all" ? 65 : 70;
        return {
          name: strip_project_prefix(f.path, project_path),
          full_path: f.path,
          size_bytes: f.file_size_bytes!,
          size_kb: Math.max(0.1, f.file_size_bytes! / 1024),
          ops,
          reads: f.read_count,
          edits: f.edit_count,
          writes: f.write_count,
          total: f.total_count,
          fill: `hsl(${hue}, ${sat}%, 55%)`,
        };
      });
  }, [enriched, lens, project_path, load_state]);

  const lens_label = lens === "all" ? "total operations" : `${lens} count`;
  const chart_h = 320;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Size vs Activity</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Each dot is a file. X = file size, Y = {lens_label}.
          Small-but-hot files appear in the top-left. Large quiet files appear in the bottom-right.
          {lens === "all" && (
            <span>
              {" "}Color shows dominant operation type:{" "}
              <span className="text-blue-400 font-medium">read</span>,{" "}
              <span className="text-green-400 font-medium">edit</span>,{" "}
              <span className="text-orange-400 font-medium">write</span>.
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent ref={ref}>
        {load_state === "loading" && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground animate-pulse">Loading file sizes…</p>
          </div>
        )}

        {load_state === "error" && (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">Failed to load file sizes.</p>
          </div>
        )}

        {load_state === "loaded" && points.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              No files with both known size and {lens === "all" ? "" : `${lens} `}activity.
            </p>
          </div>
        )}

        {load_state === "loaded" && points.length > 0 && (
          <>
            <ScatterChart
              width={cw - 4}
              height={chart_h}
              margin={{ top: 8, right: 12, bottom: 24, left: 8 }}
            >
              <XAxis
                type="number"
                dataKey="size_kb"
                name="Size"
                scale="log"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => format_size(v * 1024)}
                label={{ value: "File size", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                type="number"
                dataKey="ops"
                name="Ops"
                scale="log"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => format_number(v)}
                label={{ value: lens_label, angle: -90, position: "insideLeft", offset: 4, fontSize: 11, fill: "var(--muted-foreground)" }}
                width={48}
              />
              <ZAxis range={[30, 180]} />
              <Tooltip
                content={<ScatterTooltipContent lens={lens} />}
                cursor={{ strokeDasharray: "3 3", stroke: "var(--muted-foreground)" }}
              />
              <Scatter data={points} isAnimationActive={false}>
                {points.map((p) => (
                  <Cell key={p.full_path} fill={p.fill} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>

            {skipped_count > 0 && (
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                {skipped_count} file{skipped_count !== 1 ? "s" : ""} excluded — size unavailable (deleted or inaccessible).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
