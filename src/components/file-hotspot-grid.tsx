import { useMemo, useState } from "react";
import type { NameCount } from "@/schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format_number } from "@/lib/format";
import { strip_project_prefix } from "@/lib/path-utils";

// ── Types ──────────────────────────────────────────────────────────────

interface FileHotspotGridProps {
  read_files: NameCount[];
  edit_files: NameCount[];
  write_files: NameCount[];
  project_path?: string;
}

interface FileRow {
  name: string;
  short_name: string;
  dir: string;
  reads: number;
  edits: number;
  writes: number;
  total: number;
}

type SortKey = "total" | "reads" | "edits" | "writes" | "name";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

// ── Color ──────────────────────────────────────────────────────────────

function heat_color(hue: number, intensity: number): string {
  if (intensity === 0) return "transparent";
  const t = Math.min(Math.max(intensity, 0), 1);
  const sat = 55 + t * 35;
  const light = 75 - t * 30;
  const alpha = 0.25 + t * 0.7;
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

// ── Data Construction ──────────────────────────────────────────────────

function build_grid_data(
  read_files: NameCount[],
  edit_files: NameCount[],
  write_files: NameCount[],
  project_path?: string,
): FileRow[] {
  const file_map = new Map<string, { reads: number; edits: number; writes: number }>();

  for (const { name, count } of read_files) {
    const e = file_map.get(name) ?? { reads: 0, edits: 0, writes: 0 };
    e.reads += count;
    file_map.set(name, e);
  }
  for (const { name, count } of edit_files) {
    const e = file_map.get(name) ?? { reads: 0, edits: 0, writes: 0 };
    e.edits += count;
    file_map.set(name, e);
  }
  for (const { name, count } of write_files) {
    const e = file_map.get(name) ?? { reads: 0, edits: 0, writes: 0 };
    e.writes += count;
    file_map.set(name, e);
  }

  const rows: FileRow[] = [];

  for (const [full_path, counts] of file_map) {
    const relative = strip_project_prefix(full_path, project_path);
    const total = counts.reads + counts.edits + counts.writes;
    const last_slash = relative.lastIndexOf("/");
    const dir = last_slash >= 0 ? relative.slice(0, last_slash) : ".";
    const short_name = last_slash >= 0 ? relative.slice(last_slash + 1) : relative;

    rows.push({
      name: relative,
      short_name,
      dir,
      reads: counts.reads,
      edits: counts.edits,
      writes: counts.writes,
      total,
    });
  }

  return rows;
}

// ── Sort helpers ───────────────────────────────────────────────────────

function sort_rows(rows: FileRow[], key: SortKey, dir: SortDir): FileRow[] {
  const sorted = [...rows];
  const mult = dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    if (key === "name") return mult * a.name.localeCompare(b.name);
    return mult * (a[key] - b[key]);
  });
  return sorted;
}

// ── Directory summary row ──────────────────────────────────────────────

interface DirSummary {
  dir: string;
  reads: number;
  edits: number;
  writes: number;
  total: number;
  file_count: number;
}

function compute_dir_summaries(rows: FileRow[]): Map<string, DirSummary> {
  const map = new Map<string, DirSummary>();
  for (const row of rows) {
    const s = map.get(row.dir) ?? { dir: row.dir, reads: 0, edits: 0, writes: 0, total: 0, file_count: 0 };
    s.reads += row.reads;
    s.edits += row.edits;
    s.writes += row.writes;
    s.total += row.total;
    s.file_count += 1;
    map.set(row.dir, s);
  }
  return map;
}

// ── Sort header ────────────────────────────────────────────────────────

function SortHeader({
  label,
  sort_key,
  current_key,
  current_dir,
  on_sort,
  className,
}: {
  label: string;
  sort_key: SortKey;
  current_key: SortKey;
  current_dir: SortDir;
  on_sort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current_key === sort_key;
  const arrow = active ? (current_dir === "desc" ? " ↓" : " ↑") : "";

  return (
    <button
      type="button"
      onClick={() => on_sort(sort_key)}
      className={`text-xs font-medium text-muted-foreground hover:text-foreground transition-colors text-center cursor-pointer select-none ${className ?? ""} ${active ? "text-foreground" : ""}`}
    >
      {label}{arrow}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function FileHotspotGrid({
  read_files,
  edit_files,
  write_files,
  project_path,
}: FileHotspotGridProps) {
  const [search, set_search] = useState("");
  const [sort_key, set_sort_key] = useState<SortKey>("total");
  const [sort_dir, set_sort_dir] = useState<SortDir>("desc");
  const [page, set_page] = useState(0);

  const all_rows = useMemo(
    () => build_grid_data(read_files, edit_files, write_files, project_path),
    [read_files, edit_files, write_files, project_path],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return all_rows;
    const q = search.toLowerCase();
    return all_rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [all_rows, search]);

  const sorted = useMemo(
    () => sort_rows(filtered, sort_key, sort_dir),
    [filtered, sort_key, sort_dir],
  );

  const total_pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clamped_page = Math.min(page, total_pages - 1);
  const page_rows = sorted.slice(clamped_page * PAGE_SIZE, (clamped_page + 1) * PAGE_SIZE);

  // Directory summaries for current page (to render group headers)
  const dir_summaries = useMemo(() => compute_dir_summaries(all_rows), [all_rows]);

  const max_values = useMemo(() => ({
    reads: Math.max(...all_rows.map((r) => r.reads), 1),
    edits: Math.max(...all_rows.map((r) => r.edits), 1),
    writes: Math.max(...all_rows.map((r) => r.writes), 1),
  }), [all_rows]);

  const handle_sort = (key: SortKey) => {
    if (key === sort_key) {
      set_sort_dir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      set_sort_key(key);
      set_sort_dir("desc");
    }
    set_page(0);
  };

  const handle_search = (v: string) => {
    set_search(v);
    set_page(0);
  };

  if (all_rows.length === 0) return null;

  const columns: { key: "reads" | "edits" | "writes"; label: string; hue: number; sort_key: SortKey }[] = [
    { key: "reads", label: "Read", hue: 210, sort_key: "reads" },
    { key: "edits", label: "Edit", hue: 145, sort_key: "edits" },
    { key: "writes", label: "Write", hue: 30, sort_key: "writes" },
  ];

  // Track directory separators
  let prev_dir = "";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">File Activity</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format_number(all_rows.length)} files · {format_number(dir_summaries.size)} directories ·
              Cell intensity shows relative frequency per column.{" "}
              <span className="text-blue-400 font-medium">Blue = reads</span>,{" "}
              <span className="text-green-400 font-medium">green = edits</span>,{" "}
              <span className="text-orange-400 font-medium">orange = writes</span>.
            </p>
          </div>
          <Input
            value={search}
            onChange={(e) => handle_search(e.target.value)}
            placeholder="Search files..."
            className="w-56 shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Header */}
        <div
          className="grid items-end gap-px mb-1 sticky top-0 bg-card z-10 pb-1 border-b border-border"
          style={{ gridTemplateColumns: "1fr 56px 56px 56px 56px" }}
        >
          <SortHeader label="File" sort_key="name" current_key={sort_key} current_dir={sort_dir} on_sort={handle_sort} className="text-left px-1" />
          {columns.map((col) => (
            <SortHeader key={col.key} label={col.label} sort_key={col.sort_key} current_key={sort_key} current_dir={sort_dir} on_sort={handle_sort} />
          ))}
          <SortHeader label="Total" sort_key="total" current_key={sort_key} current_dir={sort_dir} on_sort={handle_sort} />
        </div>

        {/* Rows */}
        <div className="space-y-px">
          {page_rows.map((row) => {
            const show_dir = row.dir !== prev_dir;
            prev_dir = row.dir;
            const dir_info = show_dir ? dir_summaries.get(row.dir) : null;

            return (
              <div key={row.name}>
                {show_dir && dir_info && (
                  <div className="pt-2 pb-1 px-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider truncate">
                      {row.dir === "." ? "root" : row.dir}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                      {dir_info.file_count} files · R:{dir_info.reads} E:{dir_info.edits} W:{dir_info.writes}
                    </span>
                  </div>
                )}
                <div
                  className="grid items-center gap-px rounded-sm hover:bg-muted/30 transition-colors"
                  style={{ gridTemplateColumns: "1fr 56px 56px 56px 56px" }}
                >
                  <div
                    className="text-xs font-mono text-foreground/80 truncate px-1 py-0.5"
                    title={row.name}
                  >
                    {row.short_name}
                  </div>
                  {columns.map((col) => {
                    const value = row[col.key];
                    const intensity = value / max_values[col.key];
                    const bg = heat_color(col.hue, intensity);

                    return (
                      <div
                        key={col.key}
                        className="flex items-center justify-center rounded-sm"
                        style={{ backgroundColor: bg, height: 24 }}
                      >
                        {value > 0 && (
                          <span className="text-[10px] tabular-nums text-foreground/70 font-medium">
                            {value}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-center h-6">
                    <span className="text-[10px] tabular-nums text-muted-foreground font-medium">
                      {row.total}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {total_pages > 1 && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {format_number(clamped_page * PAGE_SIZE + 1)}–{format_number(Math.min((clamped_page + 1) * PAGE_SIZE, sorted.length))} of {format_number(sorted.length)}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={clamped_page === 0}
                onClick={() => set_page((p) => p - 1)}
                className="px-2.5 py-1 text-xs rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={clamped_page >= total_pages - 1}
                onClick={() => set_page((p) => p + 1)}
                className="px-2.5 py-1 text-xs rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
