import { useMemo, useRef } from "react";
import type { FileInsight, OperationLens } from "@/lib/file-analytics";
import {
  dominant_op,
  OP_HUE,
  intensity_bucket,
  intensity_fill,
  format_pct,
} from "@/lib/file-analytics";
import { Treemap, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format_number } from "@/lib/format";
import { strip_project_prefix } from "@/lib/path-utils";
import { use_container_width } from "@/hooks/use-container-width";
import { ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface FileHotspotTreemapProps {
  insights: FileInsight[];
  lens: OperationLens;
  project_path?: string;
}

interface TreeNode {
  name: string;
  reads: number;
  edits: number;
  writes: number;
  value: number; // lens-driven sizing metric
  total: number;
  file_count?: number;
  children?: TreeNode[];
  /** for intensity: max lens value among siblings at this level */
  _level_max?: number;
}

// ── Deep tree construction ─────────────────────────────────────────────

interface RawNode {
  name: string;
  reads: number;
  edits: number;
  writes: number;
  children: Map<string, RawNode>;
}

function new_raw(name: string): RawNode {
  return { name, reads: 0, edits: 0, writes: 0, children: new Map() };
}

function build_file_tree(
  insights: FileInsight[],
  lens: OperationLens,
  project_path?: string,
): TreeNode[] {
  const root = new_raw("root");

  for (const insight of insights) {
    const normalized = strip_project_prefix(insight.path, project_path);
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let cur = root;
    for (const seg of segments) {
      if (!cur.children.has(seg)) cur.children.set(seg, new_raw(seg));
      cur = cur.children.get(seg)!;
    }
    cur.reads += insight.read_count;
    cur.edits += insight.edit_count;
    cur.writes += insight.write_count;
  }

  aggregate(root);

  // Collapse single-child directory chains from the root
  let eff = root;
  while (eff.children.size === 1) {
    const only = [...eff.children.values()][0];
    if (only.children.size > 0) {
      eff = only;
    } else {
      break;
    }
  }

  return to_tree_nodes(eff, lens);
}

function aggregate(n: RawNode): void {
  for (const c of n.children.values()) aggregate(c);
  if (n.children.size > 0) {
    let r = 0, e = 0, w = 0;
    for (const c of n.children.values()) { r += c.reads; e += c.edits; w += c.writes; }
    n.reads = r; n.edits = e; n.writes = w;
  }
}

function lens_value(r: number, e: number, w: number, lens: OperationLens): number {
  switch (lens) {
    case "all": return r + e + w;
    case "read": return r;
    case "edit": return e;
    case "write": return w;
  }
}

function to_tree_nodes(parent: RawNode, lens: OperationLens): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const child of parent.children.values()) {
    const total = child.reads + child.edits + child.writes;
    const value = lens_value(child.reads, child.edits, child.writes, lens);

    // Skip nodes with zero value under the current lens
    if (value <= 0) continue;

    if (child.children.size > 0) {
      // Collapse inner single-child chains
      let display = child;
      let display_name = child.name;
      while (display.children.size === 1) {
        const only = [...display.children.values()][0];
        if (only.children.size > 0) {
          display_name += "/" + only.name;
          display = only;
        } else break;
      }
      const children = to_tree_nodes(display, lens);
      // Skip directories that became empty after lens filtering
      if (children.length === 0) continue;
      nodes.push({
        name: display_name,
        reads: child.reads, edits: child.edits, writes: child.writes,
        value, total,
        file_count: count_leaves(display),
        children,
      });
    } else {
      nodes.push({
        name: child.name,
        reads: child.reads, edits: child.edits, writes: child.writes,
        value, total,
      });
    }
  }
  nodes.sort((a, b) => b.value - a.value);

  // Annotate level max for intensity computation
  const level_max = nodes.reduce((m, n) => Math.max(m, n.value), 0);
  for (const n of nodes) {
    n._level_max = level_max;
  }

  return nodes;
}

function count_leaves(n: RawNode): number {
  if (n.children.size === 0) return 1;
  let c = 0;
  for (const ch of n.children.values()) c += count_leaves(ch);
  return c;
}

// ── Color for a cell ───────────────────────────────────────────────────

function get_cell_fill(
  reads: number,
  edits: number,
  writes: number,
  lens_val: number,
  level_max: number,
  lens: OperationLens,
): string {
  const bucket = intensity_bucket(lens_val, level_max);

  if (lens === "all") {
    const dom = dominant_op(reads, edits, writes);
    return intensity_fill(OP_HUE[dom], bucket);
  }
  // Single-op mode: fixed hue
  return intensity_fill(OP_HUE[lens], bucket);
}

// ── Cell Renderer ──────────────────────────────────────────────────────

interface CellProps {
  x: number; y: number; width: number; height: number; depth: number;
  name: string; reads: number; edits: number; writes: number;
  value: number; total: number;
  index: number; file_count?: number; children?: TreeNode[];
  y_scale?: number; lens?: OperationLens; _level_max?: number;
}

function TreemapCell(props: CellProps) {
  const {
    x, y, width, height, depth, name,
    reads, edits, writes, value, total,
    file_count, children,
    y_scale = 1, lens = "all", _level_max = 1,
  } = props;

  const scaled_y = y * y_scale;
  const scaled_height = height * y_scale;

  if (width < 2 || scaled_height < 2) return null;

  const fill = get_cell_fill(
    reads ?? 0, edits ?? 0, writes ?? 0,
    value ?? 0, _level_max, lens,
  );
  const has_children = children && children.length > 0;
  const is_dir = depth === 1 && has_children;
  const show_label = width > 28 && scaled_height > 14;
  const has_room = width > 100 && scaled_height > 50;
  const has_extra_room = width > 140 && scaled_height > 65;

  const max_chars = Math.floor(width / 7);
  const display = (name ?? "").length > max_chars
    ? (name ?? "").slice(0, max_chars - 1) + "…"
    : (name ?? "");

  // Mini mix indicator for large cells
  const lens_label = lens === "all" ? "ops" : lens;
  const lens_val = value ?? 0;

  return (
    <g>
      <rect
        x={x} y={scaled_y} width={width} height={scaled_height}
        fill={fill} stroke="var(--background)"
        strokeWidth={is_dir ? 2.5 : 1} opacity={0.92}
        rx={is_dir ? 4 : 1}
      />
      {show_label && (
        <>
          <text
            x={x + 5} y={scaled_y + 15}
            fontSize={is_dir ? 12 : 10} fontWeight={is_dir ? 700 : 400}
            fill="white"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)", pointerEvents: "none" }}
          >
            {display}
          </text>
          {is_dir && has_room && (
            <text x={x + 5} y={scaled_y + 30} fontSize={10} fill="rgba(255,255,255,0.75)" style={{ pointerEvents: "none" }}>
              {format_number(lens_val)} {lens_label} · {file_count ?? 0} files
            </text>
          )}
          {is_dir && has_extra_room && (
            <text x={x + 5} y={scaled_y + scaled_height - 8} fontSize={9} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>
              click to explore →
            </text>
          )}
          {!is_dir && has_room && (
            <text x={x + 5} y={scaled_y + 28} fontSize={9} fill="rgba(255,255,255,0.6)" style={{ pointerEvents: "none" }}>
              {format_number(lens_val)} {lens_label}
              {lens === "all" && total > 0
                ? ` · R:${format_pct(reads, total)} E:${format_pct(edits, total)} W:${format_pct(writes, total)}`
                : ""}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ── Breadcrumb ─────────────────────────────────────────────────────────

function NestBreadcrumb(item: { name?: string }, i: number) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      {i > 0 && <ChevronRight className="size-3 text-muted-foreground/60" />}
      <span className="px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors cursor-pointer">
        {i === 0 ? "⌂ Root" : item?.name ?? ""}
      </span>
    </span>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────

function TreemapTooltipContent({ active, payload, lens }: {
  active?: boolean;
  payload?: { payload?: Record<string, unknown> }[];
  lens?: OperationLens;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  const name = d.name as string ?? "";
  const reads = (d.reads as number) ?? 0;
  const edits = (d.edits as number) ?? 0;
  const writes = (d.writes as number) ?? 0;
  const total = (d.total as number) ?? 0;
  const file_count = d.file_count as number | undefined;
  const is_dir = Array.isArray(d.children) && d.children.length > 0;
  const current_lens = lens ?? "all";

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs space-y-1.5 max-w-xs">
      <p className="font-medium text-sm">{is_dir ? `${name}/` : name}</p>

      {/* Operation counts + percentages */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className={`text-blue-400 ${current_lens === "read" ? "font-bold" : ""}`}>
            Read
          </span>
          <span className="tabular-nums">
            {format_number(reads)}{" "}
            <span className="text-muted-foreground">({format_pct(reads, total)})</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className={`text-green-400 ${current_lens === "edit" ? "font-bold" : ""}`}>
            Edit
          </span>
          <span className="tabular-nums">
            {format_number(edits)}{" "}
            <span className="text-muted-foreground">({format_pct(edits, total)})</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className={`text-orange-400 ${current_lens === "write" ? "font-bold" : ""}`}>
            Write
          </span>
          <span className="tabular-nums">
            {format_number(writes)}{" "}
            <span className="text-muted-foreground">({format_pct(writes, total)})</span>
          </span>
        </div>
      </div>

      <div className="border-t border-border pt-1 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Total</span>
        <span className="tabular-nums font-medium">{format_number(total)}{is_dir && file_count ? ` · ${file_count} files` : ""}</span>
      </div>

      {is_dir && (
        <p className="text-muted-foreground/70 italic pt-0.5">Click to explore</p>
      )}
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────

function TreemapLegend({ lens }: { lens: OperationLens }) {
  const area_label =
    lens === "all" ? "total operations" : `${lens} count`;

  const color_label =
    lens === "all"
      ? "dominant operation type"
      : `${lens} intensity`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        <span className="font-medium text-foreground/80">Area</span> = {area_label}
      </span>
      <span>
        <span className="font-medium text-foreground/80">Color</span> = {color_label}
      </span>
      <span>
        <span className="font-medium text-foreground/80">Darker</span> = more activity
      </span>
      {lens === "all" && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: `hsl(210, 70%, 50%)` }} />
          <span>Read</span>
          <span className="inline-block size-2.5 rounded-sm" style={{ background: `hsl(145, 70%, 42%)` }} />
          <span>Edit</span>
          <span className="inline-block size-2.5 rounded-sm" style={{ background: `hsl(30, 70%, 48%)` }} />
          <span>Write</span>
        </span>
      )}
      {lens !== "all" && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: `hsl(${OP_HUE[lens]}, 70%, 45%)` }} />
          <span>{lens} operations</span>
        </span>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

const NEST_BREADCRUMB_HEIGHT = 30;

export function FileHotspotTreemap({ insights, lens, project_path }: FileHotspotTreemapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cw = use_container_width(ref);

  const tree_data = useMemo(
    () => build_file_tree(insights, lens, project_path),
    [insights, lens, project_path],
  );

  // Recharts nest treemaps subtract 30px for the breadcrumb bar,
  // but compute layout against the full height. Scale y/height so the
  // bottom row is not clipped.
  const chart_h = Math.max(Math.round(window.innerHeight * 0.6), 450);
  const y_scale = (chart_h - NEST_BREADCRUMB_HEIGHT) / chart_h;

  const lens_name = lens === "all" ? "total operations" : `${lens} operations`;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="text-base">File Treemap</CardTitle>
          <span className="text-xs text-muted-foreground">
            Sized by <span className="font-medium text-foreground/80">{lens_name}</span>
          </span>
        </div>

        <TreemapLegend lens={lens} />

        <p className="text-xs text-muted-foreground leading-relaxed">
          Click a directory to explore its files. Use the breadcrumb bar below the chart to navigate back.
        </p>
      </CardHeader>

      <CardContent ref={ref}>
        {tree_data.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              {lens === "all"
                ? "No file activity after applying current filters."
                : `No ${lens} operations found after applying current filters.`}
            </p>
          </div>
        ) : (
          <Treemap
            width={cw - 4}
            height={chart_h}
            data={tree_data}
            dataKey="value"
            nameKey="name"
            type="nest"
            nestIndexContent={NestBreadcrumb}
            content={
              <TreemapCell
                x={0} y={0} width={0} height={0} depth={0}
                name="" reads={0} edits={0} writes={0}
                value={0} total={0} index={0}
                y_scale={y_scale} lens={lens} _level_max={1}
              />
            }
            isAnimationActive={false}
          >
            <Tooltip
              content={<TreemapTooltipContent lens={lens} />}
            />
          </Treemap>
        )}
      </CardContent>
    </Card>
  );
}
