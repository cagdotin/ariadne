/**
 * Exploration graph — full-session topology surface.
 *
 * Renders the entire session exploration tree from SessionGraphPayload,
 * keeping selection as a shared highlight rather than the primary input.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { GitBranch, LocateFixed, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	screen_to_world_point,
	world_rect_to_screen_rect,
	zoom_graph_viewport_at_point,
} from "@/lib/exploration-graph-viewport";
import { compute_grouped_session_graph_layout } from "@/lib/exploration-session-graph-grouped-layout";
import {
	project_session_graph_grouped,
	resolve_grouped_selection_member_id,
} from "@/lib/exploration-session-graph-grouped-view-model";
import { cn } from "@/lib/utils";
import {
	draw_graph_canvas,
	edge_stroke_colors,
	edge_stroke_dash,
	format_selected_label,
	format_zoom_label,
	get_layout_node_bounds,
	get_node_at_world_point,
	get_node_icon,
	get_node_icon_class,
	get_node_shell_class,
	read_graph_canvas_theme,
} from "./exploration-graph-canvas";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";
import { MiddlePaneModeToggle } from "./exploration-middle-pane-mode-toggle";
import { use_graph_viewport } from "./use-graph-viewport";

interface ExplorationGraphProps {
	graph: SessionGraphPayload;
	selected_node_id: string | null;
	show_ambient: boolean;
	show_inferred: boolean;
	show_unexplored: boolean;
	middle_pane_mode: MiddlePaneMode;
	on_set_middle_pane_mode: (mode: MiddlePaneMode) => void;
	on_select_node: (node_id: string) => void;
}

interface GraphPointerState {
	pointer_id: number;
	start_x: number;
	start_y: number;
	last_x: number;
	last_y: number;
	has_moved: boolean;
}

export function ExplorationGraph({
	graph,
	selected_node_id,
	show_ambient,
	show_inferred,
	show_unexplored,
	middle_pane_mode,
	on_set_middle_pane_mode,
	on_select_node,
}: ExplorationGraphProps) {
	const projection = useMemo(
		() =>
			project_session_graph_grouped(graph, {
				show_ambient,
				show_inferred,
				show_unexplored,
			}),
		[graph, show_ambient, show_inferred, show_unexplored],
	);
	const layout = useMemo(
		() => compute_grouped_session_graph_layout(projection, selected_node_id),
		[projection, selected_node_id],
	);
	const selected_node = useMemo(
		() => graph.nodes.find((node) => node.id === selected_node_id) ?? null,
		[graph.nodes, selected_node_id],
	);
	const handle_select_projection_node = useCallback(
		(projection_node_id: string) => {
			on_select_node(
				resolve_grouped_selection_member_id(
					projection,
					projection_node_id,
					selected_node_id,
				),
			);
		},
		[on_select_node, projection, selected_node_id],
	);

	const selected_layout_node = useMemo(
		() =>
			layout.selected_projection_node_id
				? (layout.nodes.find(
						(node) => node.id === layout.selected_projection_node_id,
					) ?? null)
				: null,
		[layout.nodes, layout.selected_projection_node_id],
	);
	const graph_bounds = useMemo(
		() =>
			layout.nodes.length > 0
				? { x: 0, y: 0, width: layout.width, height: layout.height }
				: null,
		[layout.height, layout.nodes.length, layout.width],
	);
	const selected_world_rect = useMemo(
		() =>
			selected_layout_node
				? get_layout_node_bounds(selected_layout_node)
				: null,
		[selected_layout_node],
	);
	const content_key = useMemo(
		() =>
			[
				layout.width,
				layout.height,
				layout.nodes.length,
				layout.edges.length,
				show_ambient,
				show_inferred,
				show_unexplored,
			].join(":"),
		[
			layout.edges.length,
			layout.height,
			layout.nodes.length,
			layout.width,
			show_ambient,
			show_inferred,
			show_unexplored,
		],
	);

	const {
		container_ref,
		container_size,
		viewport,
		can_frame_graph,
		fit_to_graph,
		pan_by,
		set_viewport_state,
	} = use_graph_viewport({
		graph_bounds,
		selected_world_rect,
		content_key,
	});

	const canvas_ref = useRef<HTMLCanvasElement>(null);
	const pointer_state_ref = useRef<GraphPointerState | null>(null);
	const [is_dragging, set_is_dragging] = useState(false);
	const has_content = layout.nodes.length > 0;

	useEffect(() => {
		const canvas = canvas_ref.current;
		const container = container_ref.current;
		if (!canvas || !container || !viewport || !has_content) return;
		if (container_size.width <= 0 || container_size.height <= 0) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.max(1, Math.floor(container_size.width * dpr));
		canvas.height = Math.max(1, Math.floor(container_size.height * dpr));
		canvas.style.width = `${container_size.width}px`;
		canvas.style.height = `${container_size.height}px`;

		const context = canvas.getContext("2d");
		if (!context) return;

		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, container_size.width, container_size.height);
		const theme = read_graph_canvas_theme(container);
		draw_graph_canvas(context, layout, viewport, container_size, theme);
	}, [container_ref, container_size, has_content, layout, viewport]);

	const zoom_from_center = useCallback(
		(multiplier: number) => {
			if (!graph_bounds || !viewport || !can_frame_graph) return;
			set_viewport_state((current_viewport) =>
				zoom_graph_viewport_at_point(
					current_viewport,
					{
						x: container_size.width / 2,
						y: container_size.height / 2,
					},
					multiplier,
					graph_bounds,
					container_size,
				),
			);
		},
		[
			can_frame_graph,
			container_size,
			graph_bounds,
			set_viewport_state,
			viewport,
		],
	);

	const handle_surface_wheel = useCallback(
		(event: React.WheelEvent<HTMLDivElement>) => {
			if (!graph_bounds || !viewport || !can_frame_graph) return;
			event.preventDefault();

			const bounds = event.currentTarget.getBoundingClientRect();
			if (event.ctrlKey || event.metaKey) {
				const anchor = {
					x: event.clientX - bounds.left,
					y: event.clientY - bounds.top,
				};
				const multiplier = Math.exp(-event.deltaY * 0.0025);
				set_viewport_state((current_viewport) =>
					zoom_graph_viewport_at_point(
						current_viewport,
						anchor,
						multiplier,
						graph_bounds,
						container_size,
					),
				);
				return;
			}

			pan_by({ x: -event.deltaX, y: -event.deltaY });
		},
		[
			can_frame_graph,
			container_size,
			graph_bounds,
			pan_by,
			set_viewport_state,
			viewport,
		],
	);

	const handle_surface_pointer_down = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!viewport || !has_content) return;
			event.currentTarget.setPointerCapture(event.pointerId);
			pointer_state_ref.current = {
				pointer_id: event.pointerId,
				start_x: event.clientX,
				start_y: event.clientY,
				last_x: event.clientX,
				last_y: event.clientY,
				has_moved: false,
			};
			set_is_dragging(true);
		},
		[has_content, viewport],
	);

	const handle_surface_pointer_move = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const pointer_state = pointer_state_ref.current;
			if (!pointer_state || pointer_state.pointer_id !== event.pointerId) {
				return;
			}

			const delta_x = event.clientX - pointer_state.last_x;
			const delta_y = event.clientY - pointer_state.last_y;
			const travel_x = event.clientX - pointer_state.start_x;
			const travel_y = event.clientY - pointer_state.start_y;
			const has_moved =
				pointer_state.has_moved ||
				Math.abs(travel_x) > 3 ||
				Math.abs(travel_y) > 3;

			if (has_moved) {
				pan_by({ x: delta_x, y: delta_y });
			}

			pointer_state_ref.current = {
				...pointer_state,
				last_x: event.clientX,
				last_y: event.clientY,
				has_moved,
			};
		},
		[pan_by],
	);

	const clear_pointer_interaction = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			pointer_state_ref.current = null;
			set_is_dragging(false);
		},
		[],
	);

	const finish_pointer_interaction = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const pointer_state = pointer_state_ref.current;
			if (!pointer_state || pointer_state.pointer_id !== event.pointerId) {
				return;
			}

			if (!pointer_state.has_moved && viewport) {
				const bounds = event.currentTarget.getBoundingClientRect();
				const world_point = screen_to_world_point(
					{
						x: event.clientX - bounds.left,
						y: event.clientY - bounds.top,
					},
					viewport,
				);
				const hit_node = get_node_at_world_point(layout.nodes, world_point);
				if (hit_node) {
					handle_select_projection_node(hit_node.id);
				}
			}

			clear_pointer_interaction(event);
		},
		[
			clear_pointer_interaction,
			handle_select_projection_node,
			layout.nodes,
			viewport,
		],
	);

	const selected_overlay = useMemo(() => {
		if (!selected_layout_node || !viewport) return null;
		const bounds = world_rect_to_screen_rect(
			get_layout_node_bounds(selected_layout_node),
			viewport,
		);
		return {
			left: bounds.x + bounds.width / 2,
			top: Math.max(12, bounds.y - 10),
		};
	}, [selected_layout_node, viewport]);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
				<MiddlePaneModeToggle
					mode={middle_pane_mode}
					on_set_mode={on_set_middle_pane_mode}
				/>
				<span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
					Viewported canvas graph
				</span>
				{selected_node && (
					<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
						Selected: {format_selected_label(selected_node.label)}
					</span>
				)}
				{has_content && (
					<span className="tabular-nums text-[9px] text-muted-foreground">
						{projection.nodes.length} nodes · {projection.edges.length} edges ·{" "}
						{format_zoom_label(viewport)}
					</span>
				)}
				<div className="h-3 w-px bg-border" />
				<div className="flex items-center gap-2 text-[9px] text-muted-foreground">
					<GraphLegendItem
						label="Session"
						stroke={edge_stroke_colors.session}
					/>
					<GraphLegendItem
						label="Artifact"
						stroke={edge_stroke_colors.artifact}
					/>
					<GraphLegendItem
						label="Framing"
						stroke={edge_stroke_colors.framing}
						dash={edge_stroke_dash.framing}
					/>
				</div>
				<div className="ml-auto flex items-center gap-1">
					<Button
						variant="ghost"
						size="xs"
						onClick={() => zoom_from_center(1 / 1.15)}
						disabled={!can_frame_graph}
					>
						<ZoomOut data-icon="inline-start" />
						Out
					</Button>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => zoom_from_center(1.15)}
						disabled={!can_frame_graph}
					>
						<ZoomIn data-icon="inline-start" />
						In
					</Button>
					<Button
						variant="ghost"
						size="xs"
						onClick={fit_to_graph}
						disabled={!can_frame_graph}
					>
						<LocateFixed data-icon="inline-start" />
						Fit
					</Button>
				</div>
			</div>

			{!has_content ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
					<GitBranch className="size-6 text-muted-foreground/40" />
					<p className="text-[11px] text-muted-foreground">
						No graph content matches the current visibility filters
					</p>
				</div>
			) : (
				<div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/10">
					<div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
						<span>Drag to pan</span>
						<span className="text-border">·</span>
						<span>scroll to move</span>
						<span className="text-border">·</span>
						<span>⌘/Ctrl + scroll to zoom</span>
					</div>
					<div
						ref={container_ref}
						className={cn(
							"relative flex-1 min-h-0 touch-none select-none overflow-hidden",
							is_dragging ? "cursor-grabbing" : "cursor-grab",
						)}
						onWheel={handle_surface_wheel}
						onPointerDown={handle_surface_pointer_down}
						onPointerMove={handle_surface_pointer_move}
						onPointerUp={finish_pointer_interaction}
						onPointerCancel={clear_pointer_interaction}
						role="application"
						aria-label="Viewported exploration graph"
					>
						<canvas
							ref={canvas_ref}
							className="absolute inset-0 h-full w-full"
						/>
						{selected_layout_node && selected_overlay && (
							<SelectedNodeOverlay
								node={selected_layout_node}
								left={selected_overlay.left}
								top={selected_overlay.top}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function GraphLegendItem({
	label,
	stroke,
	dash,
}: {
	label: string;
	stroke: string;
	dash?: string;
}) {
	return (
		<div className="flex items-center gap-1">
			<svg width="14" height="8" aria-hidden="true">
				<line
					x1="0"
					y1="4"
					x2="14"
					y2="4"
					stroke={stroke}
					strokeWidth="1.5"
					strokeDasharray={dash}
				/>
			</svg>
			<span>{label}</span>
		</div>
	);
}

function SelectedNodeOverlay({
	node,
	left,
	top,
}: {
	node: ReturnType<
		typeof compute_grouped_session_graph_layout
	>["nodes"][number];
	left: number;
	top: number;
}) {
	const Icon = get_node_icon(node.kind);
	const shell_class = get_node_shell_class(node);
	const icon_class = get_node_icon_class(node);

	return (
		<div
			className="pointer-events-none absolute z-10"
			style={{
				left,
				top,
				transform: "translate(-50%, -100%)",
			}}
		>
			<div
				className={cn(
					"flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] shadow-sm backdrop-blur-sm",
					shell_class,
					"ring-2 ring-primary",
				)}
			>
				<Icon className={cn("size-3 shrink-0", icon_class)} />
				<span className="max-w-56 truncate">{node.label}</span>
			</div>
		</div>
	);
}
