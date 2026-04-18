/**
 * Treemap for the File ↔ Session Explorer.
 *
 * Uses recharts `type="nest"` for the standard nested directory treemap
 * with built-in drill-down and breadcrumb. On every click, we ALSO
 * update the `?path=` URL search param so the sessions table stays
 * in sync with what the user is looking at in the treemap.
 */

import { ChevronRight } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
} from "react";
import { Tooltip, Treemap } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use_container_width } from "@/hooks/use-container-width";
import type { FileInsight, OperationLens } from "@/lib/file-analytics";
import {
	dominant_op,
	format_pct,
	intensity_bucket,
	intensity_fill,
	OP_HUE,
} from "@/lib/file-analytics";
import { format_number } from "@/lib/format";
import { strip_project_prefix } from "@/lib/path-utils";
import { use_explore_context } from "./explore-context";

// ── Types ──────────────────────────────────────────────────────────────

interface TreeNode {
	[key: string]: unknown;
	name: string;
	full_path: string;
	reads: number;
	edits: number;
	writes: number;
	value: number;
	total: number;
	file_count?: number;
	children?: TreeNode[];
	_level_max?: number;
}

// ── Tree construction (same as original FileHotspotTreemap) ────────────

interface RawNode {
	name: string;
	full_path: string;
	reads: number;
	edits: number;
	writes: number;
	children: Map<string, RawNode>;
}

function new_raw(name: string, full_path: string): RawNode {
	return { name, full_path, reads: 0, edits: 0, writes: 0, children: new Map() };
}

function build_file_tree(
	insights: FileInsight[],
	lens: OperationLens,
	project_path?: string,
): TreeNode[] {
	const root = new_raw("root", "");
	for (const insight of insights) {
		const normalized = strip_project_prefix(insight.path, project_path);
		const segments = normalized.split("/").filter(Boolean);
		if (segments.length === 0) continue;
		let cur = root;
		let path_acc = "";
		for (const seg of segments) {
			path_acc = path_acc ? `${path_acc}/${seg}` : seg;
			if (!cur.children.has(seg)) cur.children.set(seg, new_raw(seg, path_acc));
			cur = cur.children.get(seg)!;
		}
		cur.reads += insight.read_count;
		cur.edits += insight.edit_count;
		cur.writes += insight.write_count;
	}
	aggregate(root);
	let eff = root;
	while (eff.children.size === 1) {
		const only = [...eff.children.values()][0];
		if (only.children.size > 0) eff = only;
		else break;
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
	switch (lens) { case "all": return r + e + w; case "read": return r; case "edit": return e; case "write": return w; }
}

function to_tree_nodes(parent: RawNode, lens: OperationLens): TreeNode[] {
	const nodes: TreeNode[] = [];
	for (const child of parent.children.values()) {
		const total = child.reads + child.edits + child.writes;
		const value = lens_value(child.reads, child.edits, child.writes, lens);
		if (value <= 0) continue;
		if (child.children.size > 0) {
			let display = child, display_name = child.name;
			while (display.children.size === 1) {
				const only = [...display.children.values()][0];
				if (only.children.size > 0) { display_name += `/${only.name}`; display = only; } else break;
			}
			const children = to_tree_nodes(display, lens);
			if (children.length === 0) continue;
			nodes.push({ name: display_name, full_path: display.full_path, reads: child.reads, edits: child.edits, writes: child.writes, value, total, file_count: count_leaves(display), children });
		} else {
			nodes.push({ name: child.name, full_path: child.full_path, reads: child.reads, edits: child.edits, writes: child.writes, value, total });
		}
	}
	nodes.sort((a, b) => b.value - a.value);
	const level_max = nodes.reduce((m, n) => Math.max(m, n.value), 0);
	for (const n of nodes) n._level_max = level_max;
	return nodes;
}

function count_leaves(n: RawNode): number {
	if (n.children.size === 0) return 1;
	let c = 0;
	for (const ch of n.children.values()) c += count_leaves(ch);
	return c;
}

// ── Color ──────────────────────────────────────────────────────────────

function get_cell_fill(reads: number, edits: number, writes: number, lens_val: number, level_max: number, lens: OperationLens): string {
	const bucket = intensity_bucket(lens_val, level_max);
	if (lens === "all") return intensity_fill(OP_HUE[dominant_op(reads, edits, writes)], bucket);
	return intensity_fill(OP_HUE[lens], bucket);
}

// ── Context for passing navigate callback into cells ───────────────────

interface CellCallbacks {
	on_navigate: (full_path: string) => void;
	session_file_paths: Set<string>;
	has_session_highlight: boolean;
	selected_path: string;
}
const CellCallbacksCtx = createContext<CellCallbacks>({
	on_navigate: () => {},
	session_file_paths: new Set(),
	has_session_highlight: false,
	selected_path: "",
});

// ── Cell ───────────────────────────────────────────────────────────────

interface CellProps {
	x: number; y: number; width: number; height: number; depth: number;
	name: string; full_path: string;
	reads: number; edits: number; writes: number; value: number; total: number;
	index: number; file_count?: number; children?: TreeNode[];
	y_scale?: number; lens?: OperationLens; _level_max?: number;
}

function TreemapCell(props: CellProps) {
	const { x, y, width, height, depth, name, full_path,
		reads, edits, writes, value, total, file_count, children,
		y_scale = 1, lens = "all", _level_max = 1 } = props;

	const { session_file_paths, has_session_highlight, selected_path: active_path } = useContext(CellCallbacksCtx);

	// Is this node the currently active scope from the URL?
	const is_active_scope = !!(full_path && active_path && (
		full_path === active_path ||
		full_path.startsWith(active_path + "/") ||
		active_path.startsWith(full_path + "/")
	));

	// For leaf files: exact match. For directories: any descendant matches.
	const has_children_nodes = children && children.length > 0;
	const is_highlighted = useMemo(() => {
		if (!has_session_highlight || !full_path) return false;
		// Exact match (leaf file)
		if (session_file_paths.has(full_path)) return true;
		// Prefix match (directory contains a touched file)
		if (has_children_nodes) {
			const prefix = full_path + "/";
			for (const p of session_file_paths) {
				if (p.startsWith(prefix)) return true;
			}
		}
		return false;
	}, [has_session_highlight, full_path, session_file_paths, has_children_nodes]);
	const is_dimmed = has_session_highlight && !is_highlighted;

	const scaled_y = y * y_scale;
	const scaled_height = height * y_scale;
	if (width < 2 || scaled_height < 2) return null;
	if (is_dimmed) return null;

	const fill = get_cell_fill(reads ?? 0, edits ?? 0, writes ?? 0, value ?? 0, _level_max, lens);
	const has_children = children && children.length > 0;
	const is_dir = depth === 1 && has_children;
	const show_label = width > 28 && scaled_height > 14;
	const has_room = width > 100 && scaled_height > 50;
	const has_extra_room = width > 140 && scaled_height > 65;
	const max_chars = Math.floor(width / 7);
	const display = (name ?? "").length > max_chars ? `${(name ?? "").slice(0, max_chars - 1)}…` : (name ?? "");
	const lens_label = lens === "all" ? "ops" : lens;

	return (
		<g>
			<rect x={x} y={scaled_y} width={width} height={scaled_height}
				fill={fill}
				stroke={is_active_scope ? "#000" : "var(--background)"}
				strokeWidth={is_active_scope ? 3 : is_dir ? 2.5 : 1}
				opacity={0.92}
				rx={is_dir ? 4 : 1} />
			{is_highlighted && (
				<rect x={x} y={scaled_y} width={width} height={scaled_height}
					fill="hsl(var(--primary))" opacity={0.25} rx={is_dir ? 4 : 1}
					style={{ pointerEvents: "none" }} />
			)}
			{show_label && (
				<>
					<text x={x + 5} y={scaled_y + 15} fontSize={is_dir ? 12 : 10}
						fontWeight={is_dir ? 700 : 400} fill="white"
						style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)", pointerEvents: "none" }}>
						{display}
					</text>
					{is_dir && has_room && (
						<text x={x + 5} y={scaled_y + 30} fontSize={10}
							fill="rgba(255,255,255,0.75)" style={{ pointerEvents: "none" }}>
							{format_number(value ?? 0)} {lens_label} · {file_count ?? 0} files
						</text>
					)}
					{is_dir && has_extra_room && (
						<text x={x + 5} y={scaled_y + scaled_height - 8} fontSize={9}
							fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>
							click to explore →
						</text>
					)}
					{!is_dir && has_room && (
						<text x={x + 5} y={scaled_y + 28} fontSize={9}
							fill="rgba(255,255,255,0.6)" style={{ pointerEvents: "none" }}>
							{format_number(value ?? 0)} {lens_label}
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

// ── Tooltip ────────────────────────────────────────────────────────────

function TreemapTooltipContent({ active, payload, lens }: {
	active?: boolean; payload?: { payload?: Record<string, unknown> }[]; lens?: OperationLens;
}) {
	if (!active || !payload?.[0]?.payload) return null;
	const d = payload[0].payload;
	const name = (d.name as string) ?? "";
	const reads = (d.reads as number) ?? 0, edits = (d.edits as number) ?? 0, writes = (d.writes as number) ?? 0;
	const total = (d.total as number) ?? 0;
	const file_count = d.file_count as number | undefined;
	const is_dir = Array.isArray(d.children) && d.children.length > 0;
	const cl = lens ?? "all";
	return (
		<div className="rounded-none border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs space-y-1.5 max-w-xs">
			<p className="font-medium text-sm">{is_dir ? `${name}/` : name}</p>
			<div className="space-y-0.5">
				<div className="flex items-center justify-between gap-4">
					<span className={`text-blue-400 ${cl === "read" ? "font-bold" : ""}`}>Read</span>
					<span className="tabular-nums">{format_number(reads)} <span className="text-muted-foreground">({format_pct(reads, total)})</span></span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className={`text-green-400 ${cl === "edit" ? "font-bold" : ""}`}>Edit</span>
					<span className="tabular-nums">{format_number(edits)} <span className="text-muted-foreground">({format_pct(edits, total)})</span></span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className={`text-orange-400 ${cl === "write" ? "font-bold" : ""}`}>Write</span>
					<span className="tabular-nums">{format_number(writes)} <span className="text-muted-foreground">({format_pct(writes, total)})</span></span>
				</div>
			</div>
			<div className="border-t border-border pt-1 flex items-center justify-between gap-4">
				<span className="text-muted-foreground">Total</span>
				<span className="tabular-nums font-medium">{format_number(total)}{is_dir && file_count ? ` · ${file_count} files` : ""}</span>
			</div>
			<p className="text-muted-foreground/70 italic pt-0.5">{is_dir ? "Click to explore" : "Click to select"}</p>
		</div>
	);
}

// ── Breadcrumb (recharts nest) ─────────────────────────────────────────

function NestBreadcrumb(item: { name?: string }, i: number) {
	return (
		<span className="inline-flex items-center gap-0.5 text-xs">
			{i > 0 && <ChevronRight className="size-3 text-muted-foreground/60" />}
			<span className="px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors cursor-pointer">
				{i === 0 ? "⌂ Root" : (item?.name ?? "")}
			</span>
		</span>
	);
}

// ── Legend ──────────────────────────────────────────────────────────────

function TreemapLegend({ lens }: { lens: OperationLens }) {
	const area_label = lens === "all" ? "total operations" : `${lens} count`;
	const color_label = lens === "all" ? "dominant operation type" : `${lens} intensity`;
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
			<span><span className="font-medium text-foreground/80">Area</span> = {area_label}</span>
			<span><span className="font-medium text-foreground/80">Color</span> = {color_label}</span>
			<span><span className="font-medium text-foreground/80">Darker</span> = more activity</span>
			{lens === "all" ? (
				<span className="flex items-center gap-1.5">
					<span className="inline-block size-2.5 rounded-sm" style={{ background: "hsl(210, 70%, 50%)" }} /><span>Read</span>
					<span className="inline-block size-2.5 rounded-sm" style={{ background: "hsl(145, 70%, 42%)" }} /><span>Edit</span>
					<span className="inline-block size-2.5 rounded-sm" style={{ background: "hsl(30, 70%, 48%)" }} /><span>Write</span>
				</span>
			) : (
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

export function ExploreTreemap() {
	const { filtered_insights, lens, file_stats, navigate_to_path, session_file_paths, selected_path } = use_explore_context();
	const ref = useRef<HTMLDivElement>(null);
	const cw = use_container_width(ref);
	const project_path = file_stats?.project_path;

	const tree_data = useMemo(
		() => build_file_tree(filtered_insights, lens, project_path),
		[filtered_insights, lens, project_path],
	);

	const chart_h = Math.max(Math.round(window.innerHeight * 0.6), 450);
	const y_scale = (chart_h - NEST_BREADCRUMB_HEIGHT) / chart_h;
	const lens_name = lens === "all" ? "total operations" : `${lens} operations`;
	const has_session_highlight = session_file_paths.size > 0;

	// Recharts fires onClick AFTER its internal nest drill-down.
	// We use it to sync the URL search param with whatever the user clicked.
	const handle_click = useCallback(
		(node: Record<string, unknown>) => {
			const full_path = node?.full_path as string;
			if (full_path) navigate_to_path(full_path);
		},
		[navigate_to_path],
	);

	const ctx = useMemo<CellCallbacks>(
		() => ({ on_navigate: navigate_to_path, session_file_paths, has_session_highlight, selected_path }),
		[navigate_to_path, session_file_paths, has_session_highlight, selected_path],
	);

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
					<div className="flex h-48 items-center justify-center rounded-none border border-dashed">
						<p className="text-sm text-muted-foreground">
							{lens === "all" ? "No file activity after applying current filters." : `No ${lens} operations found after applying current filters.`}
						</p>
					</div>
				) : (
					<CellCallbacksCtx.Provider value={ctx}>
						<Treemap
							width={cw - 4} height={chart_h}
							data={tree_data} dataKey="value" nameKey="name"
							type="nest"
							nestIndexContent={NestBreadcrumb}
							onClick={handle_click}
							content={
								<TreemapCell x={0} y={0} width={0} height={0}
									depth={0} name="" full_path=""
									reads={0} edits={0} writes={0}
									value={0} total={0} index={0}
									y_scale={y_scale} lens={lens} _level_max={1} />
							}
							isAnimationActive={false}
						>
							<Tooltip content={<TreemapTooltipContent lens={lens} />} />
						</Treemap>
					</CellCallbacksCtx.Provider>
				)}
			</CardContent>
		</Card>
	);
}
