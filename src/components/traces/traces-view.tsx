import { ChevronsUpDown, ZoomIn } from "lucide-react";
import { useMemo, useRef } from "react";
import type {
	SessionEntry,
	SessionHeader,
} from "@/components/session-viewer/types";
import { use_session_panel } from "@/components/sessions/use-session-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { use_column_resize } from "./hooks/use-column-resize";
import { use_span_selection } from "./hooks/use-span-selection";
import { use_span_tree_expansion } from "./hooks/use-span-tree-expansion";
import { use_timeline_cursor } from "./hooks/use-timeline-cursor";
import { use_timeline_zoom } from "./hooks/use-timeline-zoom";
import { SpanDetail } from "./span-detail";
import { SpanRow } from "./span-row";
import { TimelineRuler } from "./timeline-ruler";
import {
	build_span_tree,
	flatten_span_tree,
	format_duration,
} from "./trace-transform";

interface TracesViewProps {
	header: SessionHeader | null;
	entries: SessionEntry[];
}

export function TracesView({ header, entries }: TracesViewProps) {
	const tree = useMemo(
		() => build_span_tree(header, entries),
		[header, entries],
	);

	// Refs shared across hooks
	const timeline_ref = useRef<HTMLDivElement>(null);
	const container_ref = useRef<HTMLDivElement>(null);

	// Expansion state
	const { expanded, is_all_expanded, toggle, toggle_all } =
		use_span_tree_expansion(tree.roots);

	// Flatten visible rows
	const visible_rows = useMemo(
		() => flatten_span_tree(tree.roots, expanded),
		[tree.roots, expanded],
	);

	// Selection + inspector panel
	const { panel, set_panel } = use_session_panel();
	const { selected_id, selected_node, show_inspector, select, deselect } =
		use_span_selection({
			roots: tree.roots,
			panel,
			set_panel,
		});

	// Zoom & pan
	const {
		view_start,
		view_end,
		is_zoomed,
		zoom_drag,
		zoom_overlay_left,
		zoom_overlay_width,
		handle_zoom_mouse_down,
		reset_zoom,
	} = use_timeline_zoom({
		total_duration_ms: tree.total_duration_ms,
		timeline_ref,
		container_ref,
	});

	// Cursor tracking
	const { cursor, handle_mouse_move, handle_mouse_leave } = use_timeline_cursor(
		{
			view_start,
			view_end,
			timeline_ref,
			container_ref,
		},
	);

	// Column resize
	const { tree_width_pct, handle_divider_mouse_down } =
		use_column_resize(container_ref);

	if (entries.length === 0) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">
					No entries in this session
				</p>
			</div>
		);
	}

	const { stats } = tree;

	const timeline_content = (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			{/* Stats bar */}
			<div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/30 flex-none">
				<Badge variant="outline" className="text-[10px]">
					{stats.event_count} events
				</Badge>
				<Badge variant="outline" className="text-[10px]">
					{stats.tool_count} tools
				</Badge>
				{stats.error_count > 0 && (
					<Badge variant="destructive" className="text-[10px]">
						{stats.error_count} errors
					</Badge>
				)}
				{stats.model && (
					<span className="text-[10px] text-muted-foreground">
						{stats.model}
					</span>
				)}
				<span className="text-[10px] text-muted-foreground">
					{format_duration(tree.total_duration_ms)}
				</span>

				<div className="ml-auto flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={toggle_all}
					>
						<ChevronsUpDown data-icon="inline-start" />
						{is_all_expanded ? "Collapse" : "Expand"}
					</Button>
				</div>
			</div>

			{/* Main area */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking for cursor display */}
			<div
				ref={container_ref}
				className="flex-1 min-h-0 overflow-hidden flex flex-col relative"
				style={{ "--tree-width": `${tree_width_pct}%` } as React.CSSProperties}
				onMouseMove={handle_mouse_move}
				onMouseLeave={handle_mouse_leave}
			>
				{/* Full-height column resize handle — sits on the tree/timeline border */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle for column resize */}
				<div
					className="absolute top-0 bottom-0 w-2 cursor-col-resize z-30 hover:bg-primary/10 active:bg-primary/30"
					style={{ left: `calc(var(--tree-width) - 4px)` }}
					onMouseDown={handle_divider_mouse_down}
				/>

				{/* Full-height zoom selection overlay */}
				{zoom_drag && zoom_overlay_width > 3 && (
					<div
						className="absolute top-0 bottom-0 bg-primary/15 border-x border-primary/40 pointer-events-none z-20"
						style={{
							left: `${zoom_overlay_left}px`,
							width: `${zoom_overlay_width}px`,
						}}
					/>
				)}

				{/* Vertical cursor line */}
				{cursor && !zoom_drag && (
					<div
						className="absolute top-0 bottom-0 pointer-events-none z-20 flex flex-col items-center"
						style={{ left: `${cursor.px}px` }}
					>
						<div className="w-px h-full border-l border-dashed border-muted-foreground/20" />
						<div
							className="absolute top-0 bg-muted/80 text-[9px] tabular-nums text-muted-foreground px-1 py-0.5 whitespace-nowrap -translate-x-1/2 mt-0.5"
							style={{ left: 0 }}
						>
							{format_duration(cursor.ms)}
						</div>
					</div>
				)}

				{/* Column headers */}
				<div className="flex flex-none border-b border-border">
					<div
						className="flex-none overflow-hidden flex items-center px-3 border-r border-border"
						style={{ width: "var(--tree-width)" }}
					>
						<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Service & Operation
						</span>
					</div>

					{/* biome-ignore lint/a11y/noStaticElementInteractions: drag area for zoom selection */}
					<div
						ref={timeline_ref}
						className="flex-1 min-w-0 relative cursor-crosshair select-none"
						onMouseDown={handle_zoom_mouse_down}
					>
						<TimelineRuler
							total_duration_ms={tree.total_duration_ms}
							view_start_ms={view_start}
							view_end_ms={view_end}
						/>
					</div>
				</div>

				{/* Zoomed indicator — right-aligned */}
				{is_zoomed && (
					<div className="flex items-center justify-end gap-2 px-3 py-0.5 bg-primary/5 border-b border-border text-[10px] text-muted-foreground flex-none">
						<ZoomIn className="size-3" />
						Viewing {format_duration(view_start)} – {format_duration(view_end)}
						<button
							type="button"
							className="underline hover:text-foreground cursor-pointer ml-1"
							onClick={reset_zoom}
						>
							reset
						</button>
					</div>
				)}

				{/* Scrollable rows */}
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
					{visible_rows.map((row) => (
						<SpanRow
							key={row.node.id}
							row={row}
							total_duration_ms={tree.total_duration_ms}
							is_selected={selected_id === row.node.id}
							on_select={select}
							on_toggle={toggle}
							view_start_ms={view_start}
							view_end_ms={view_end}
						/>
					))}
				</div>
			</div>
		</div>
	);

	return (
		<div className="h-full min-h-0 w-full">
			<ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0">
				{/* Main timeline area */}
				<ResizablePanel minSize="40%" className="min-w-0">
					{timeline_content}
				</ResizablePanel>

				{show_inspector && selected_node && (
					<>
						<ResizableHandle />

						{/* Inspector sidebar */}
						<ResizablePanel
							defaultSize="35%"
							minSize="25%"
							maxSize="50%"
							className="min-w-0"
						>
							<aside className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
								<SpanDetail
									node={selected_node}
									session_start_iso={tree.session_start_iso}
									on_close={deselect}
								/>
							</aside>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
		</div>
	);
}
