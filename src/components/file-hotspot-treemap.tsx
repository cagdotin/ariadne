import { useMemo, useRef, useState, useEffect } from "react";
import type { NameCount } from "@/schemas/analytics";
import { Treemap, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format_number } from "@/lib/format";
import { ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface FileHotspotTreemapProps {
  read_files: NameCount[];
  edit_files: NameCount[];
  write_files: NameCount[];
  project_path?: string;
}

interface TreeNode {
  name: string;
  reads: number;
  edits: number;
  writes: number;
  total: number;
  file_count?: number;
  children?: TreeNode[];
}

// ── Color ──────────────────────────────────────────────────────────────

function get_cell_color(reads: number, edits: number, writes: number): string {
  const total = reads + edits + writes;
  if (total === 0) return "var(--muted)";
  const r = reads / total;
  const e = edits / total;
  const w = writes / total;
  if (r >= e && r >= w) return `hsl(210, ${50 + r * 40}%, 55%)`;
  if (e >= r && e >= w) return `hsl(145, ${50 + e * 40}%, 45%)`;
  return `hsl(30, ${50 + w * 40}%, 50%)`;
}

// ── Path normalization ─────────────────────────────────────────────────

/**
 * Strip the project path (and common absolute prefixes like /Users/xxx/)
 * from file paths so the tree shows only project-relative paths.
 */
function normalize_path(raw: string, project_path?: string): string {
  let p = raw;

  // Strip project path prefix if provided
  if (project_path) {
    const base = project_path.endsWith("/") ? project_path : project_path + "/";
    if (p.startsWith(base)) {
      p = p.slice(base.length);
    }
  }

  // Strip leading /
  if (p.startsWith("/")) p = p.slice(1);

  // If still starts with an absolute-looking home dir, strip up to the
  // last recognizable project root marker.
  // e.g. "Users/cgn/git/dev/0xcgn/ariadne/ariadne/src/foo.tsx" → "src/foo.tsx"
  if (project_path) {
    const project_name = project_path.replace(/\/$/, "").split("/").pop() ?? "";
    if (project_name) {
      const marker = project_name + "/";
      const idx = p.lastIndexOf(marker);
      if (idx !== -1) {
        p = p.slice(idx + marker.length);
      }
    }
  }

  return p || raw;
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
  read_files: NameCount[],
  edit_files: NameCount[],
  write_files: NameCount[],
  project_path?: string,
): TreeNode[] {
  const root = new_raw("root");

  const insert = (path: string, r: number, e: number, w: number) => {
    const normalized = normalize_path(path, project_path);
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) return;

    let cur = root;
    for (const seg of segments) {
      if (!cur.children.has(seg)) cur.children.set(seg, new_raw(seg));
      cur = cur.children.get(seg)!;
    }
    cur.reads += r;
    cur.edits += e;
    cur.writes += w;
  };

  for (const { name, count } of read_files) insert(name, count, 0, 0);
  for (const { name, count } of edit_files) insert(name, 0, count, 0);
  for (const { name, count } of write_files) insert(name, 0, 0, count);

  aggregate(root);

  // Collapse single-child chains from the root
  let eff = root;
  while (eff.children.size === 1) {
    const only = [...eff.children.values()][0];
    if (only.children.size > 0) {
      eff = only;
    } else {
      break;
    }
  }

  return to_tree_nodes(eff);
}

function aggregate(n: RawNode): void {
  for (const c of n.children.values()) aggregate(c);
  if (n.children.size > 0) {
    let r = 0, e = 0, w = 0;
    for (const c of n.children.values()) { r += c.reads; e += c.edits; w += c.writes; }
    n.reads = r; n.edits = e; n.writes = w;
  }
}

function to_tree_nodes(parent: RawNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const child of parent.children.values()) {
    const total = child.reads + child.edits + child.writes;
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
      nodes.push({
        name: display_name,
        reads: child.reads, edits: child.edits, writes: child.writes, total,
        file_count: count_leaves(display),
        children: to_tree_nodes(display),
      });
    } else {
      nodes.push({ name: child.name, reads: child.reads, edits: child.edits, writes: child.writes, total });
    }
  }
  nodes.sort((a, b) => b.total - a.total);
  return nodes;
}

function count_leaves(n: RawNode): number {
  if (n.children.size === 0) return 1;
  let c = 0;
  for (const ch of n.children.values()) c += count_leaves(ch);
  return c;
}

// ── Cell Renderer ──────────────────────────────────────────────────────

interface CellProps {
  x: number; y: number; width: number; height: number; depth: number;
  name: string; reads: number; edits: number; writes: number; total: number;
  index: number; file_count?: number; children?: TreeNode[]; y_scale?: number;
}

function TreemapCell(props: CellProps) {
  const { x, y, width, height, depth, name, reads, edits, writes, total, file_count, children, y_scale = 1 } = props;

  const scaled_y = y * y_scale;
  const scaled_height = height * y_scale;

  if (width < 2 || scaled_height < 2) return null;

  const fill = get_cell_color(reads ?? 0, edits ?? 0, writes ?? 0);
  const has_children = children && children.length > 0;
  const is_dir = depth === 1 && has_children;
  const show_label = width > 28 && scaled_height > 14;
  const has_room = width > 100 && scaled_height > 50;

  const max_chars = Math.floor(width / 7);
  const display = (name ?? "").length > max_chars
    ? (name ?? "").slice(0, max_chars - 1) + "…"
    : (name ?? "");

  return (
    <g>
      <rect
        x={x} y={scaled_y} width={width} height={scaled_height}
        fill={fill} stroke="var(--background)"
        strokeWidth={is_dir ? 2.5 : 1} opacity={0.88}
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
            <>
              <text x={x + 5} y={scaled_y + 30} fontSize={10} fill="rgba(255,255,255,0.75)" style={{ pointerEvents: "none" }}>
                {format_number(total)} ops · {file_count ?? 0} files
              </text>
              <text x={x + 5} y={scaled_y + scaled_height - 8} fontSize={9} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>
                click to explore →
              </text>
            </>
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
      <span className="px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors">
        {i === 0 ? "All" : item?.name ?? ""}
      </span>
    </span>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────

function TreemapTooltipContent({ active, payload }: {
  active?: boolean;
  payload?: { payload?: Record<string, unknown> }[];
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

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs space-y-1">
      <p className="font-medium text-sm">{is_dir ? `${name}/` : name}</p>
      <div className="flex gap-3">
        <span className="text-blue-400">R: {format_number(reads)}</span>
        <span className="text-green-400">E: {format_number(edits)}</span>
        <span className="text-orange-400">W: {format_number(writes)}</span>
      </div>
      <p className="text-muted-foreground">
        {format_number(total)} total{is_dir && file_count ? ` · ${file_count} files` : ""}
      </p>
      {is_dir && <p className="text-muted-foreground/70 italic">Click to explore</p>}
    </div>
  );
}

// ── Responsive Width ───────────────────────────────────────────────────

function use_container_width(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, set_w] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) set_w(Math.floor(e.contentRect.width));
    });
    obs.observe(el);
    set_w(Math.floor(el.clientWidth));
    return () => obs.disconnect();
  }, [ref]);
  return w;
}

// ── Main ───────────────────────────────────────────────────────────────

const NEST_BREADCRUMB_HEIGHT = 30;

export function FileHotspotTreemap({ read_files, edit_files, write_files, project_path }: FileHotspotTreemapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cw = use_container_width(ref);

  const tree_data = useMemo(
    () => build_file_tree(read_files, edit_files, write_files, project_path),
    [read_files, edit_files, write_files, project_path],
  );

  if (tree_data.length === 0) return null;

  // Recharts nest treemaps subtract 30px from the rendered SVG for the breadcrumb bar,
  // but still compute node layout against the full height. Scale y/height into the visible
  // plot area so the bottom row is not clipped.
  const chart_h = Math.max(Math.round(window.innerHeight * 0.6), 450);
  const y_scale = (chart_h - NEST_BREADCRUMB_HEIGHT) / chart_h;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">File Treemap</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Each rectangle is a file or directory, sized by total operations.{" "}
          <span className="text-blue-400 font-medium">Blue = read-heavy</span>,{" "}
          <span className="text-green-400 font-medium">green = edit-heavy</span>,{" "}
          <span className="text-orange-400 font-medium">orange = write-heavy</span>.
          Click a directory to explore its files. Use the breadcrumb bar to navigate back.
        </p>
      </CardHeader>
      <CardContent ref={ref}>
        <Treemap
          width={cw - 4}
          height={chart_h}
          data={tree_data}
          dataKey="total"
          nameKey="name"
          type="nest"
          nestIndexContent={NestBreadcrumb}
          content={<TreemapCell x={0} y={0} width={0} height={0} depth={0} name="" reads={0} edits={0} writes={0} total={0} index={0} y_scale={y_scale} />}
          isAnimationActive={false}
        >
          <Tooltip content={<TreemapTooltipContent />} />
        </Treemap>
      </CardContent>
    </Card>
  );
}
