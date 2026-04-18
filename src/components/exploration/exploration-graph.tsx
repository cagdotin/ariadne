/**
 * Exploration graph — full-session topology surface.
 *
 * Renders the entire session exploration tree from SessionGraphPayload,
 * keeping selection as a shared highlight rather than the primary input.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import {
	BookOpen,
	FileCode,
	FileText,
	GitBranch,
	LocateFixed,
	MessageSquare,
	Search,
	ShieldQuestion,
	Terminal,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	type GraphZoomBand,
	get_graph_node_chrome_mode,
	get_graph_node_visual_weight,
	get_graph_zoom_band,
	should_render_graph_node_accent,
	should_render_graph_node_label,
} from "@/lib/exploration-graph-render-style";
import {
	type GraphViewportState,
	type GraphWorldPoint,
	screen_to_world_point,
	world_rect_to_screen_rect,
	world_to_screen_point,
	zoom_graph_viewport_at_point,
} from "@/lib/exploration-graph-viewport";
import {
	compute_session_graph_layout,
	SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
	SESSION_GRAPH_LAYOUT_NODE_WIDTH,
	type SessionGraphLayoutEdge,
	type SessionGraphLayoutNode,
} from "@/lib/exploration-session-graph-layout";
import {
	project_session_graph_tree,
	type SessionGraphTreeEdgeRole,
} from "@/lib/exploration-session-graph-view-model";
import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-view";
import { use_graph_viewport } from "./use-graph-viewport";

// ── Shared toggle component ─────────────────────────────────────────────────

export function MiddlePaneModeToggle({
	mode,
	on_set_mode,
}: {
	mode: MiddlePaneMode;
	on_set_mode: (mode: MiddlePaneMode) => void;
}) {
	return (
		<div
			className="flex items-center gap-0.5 border border-border rounded-md overflow-hidden"
			data-testid="middle-pane-mode-toggle"
		>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "map"
						? "bg-primary text-primary-foreground"
						: "hover:bg-accent text-muted-foreground",
				)}
				onClick={() => on_set_mode("map")}
			>
				Map
			</button>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "graph"
						? "bg-primary text-primary-foreground"
						: "hover:bg-accent text-muted-foreground",
				)}
				onClick={() => on_set_mode("graph")}
			>
				Graph
			</button>
		</div>
	);
}

// ── Props ───────────────────────────────────────────────────────────────────

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

interface GraphCanvasTheme {
	background: string;
	foreground: string;
	muted_foreground: string;
	border: string;
	primary: string;
	primary_soft: string;
	session_edge: string;
	framing_edge: string;
	selected_edge: string;
	user_fill: string;
	assistant_fill: string;
	tool_fill: string;
	search_fill: string;
	file_fill: string;
	doc_fill: string;
	framing_fill: string;
	default_fill: string;
	artifact_accent: string;
	doc_accent: string;
	search_accent: string;
	framing_accent: string;
}

interface GraphPointerState {
	pointer_id: number;
	start_x: number;
	start_y: number;
	last_x: number;
	last_y: number;
	has_moved: boolean;
}

// ── Visual grammar ──────────────────────────────────────────────────────────

const edge_stroke_colors: Record<SessionGraphTreeEdgeRole, string> = {
	session: "var(--muted-foreground)",
	framing: "hsl(38 92% 50%)",
};

const edge_stroke_dash: Record<SessionGraphTreeEdgeRole, string> = {
	session: "",
	framing: "6 4",
};

function get_node_icon(kind: string): typeof FileCode {
	if (kind === "user_prompt") return MessageSquare;
	if (kind === "assistant_turn" || kind === "tool_call") return Terminal;
	if (kind === "search_query") return Search;
	if (kind === "source_file") return FileCode;
	if (kind === "doc_file") return FileText;
	if (kind === "agents_doc") return ShieldQuestion;
	if (kind === "instruction_source" || kind === "session_framing") {
		return BookOpen;
	}
	return GitBranch;
}

function get_node_shell_class(node: SessionGraphLayoutNode): string {
	if (node.kind === "user_prompt") {
		return "border-primary/35 bg-primary/6";
	}
	if (node.kind === "assistant_turn") {
		return "border-primary/25 bg-primary/4";
	}
	if (node.kind === "search_query") {
		return "border-amber-500/35 bg-amber-500/7";
	}
	if (node.kind === "tool_call") {
		return "border-border bg-background";
	}
	if (node.kind === "source_file") {
		return "border-emerald-500/30 bg-emerald-500/6";
	}
	if (node.kind === "doc_file") {
		return "border-sky-500/30 bg-sky-500/6";
	}
	if (node.kind === "agents_doc") {
		return node.role === "framing"
			? "border-amber-500/35 bg-amber-500/7"
			: "border-sky-500/30 bg-sky-500/6";
	}
	if (node.role === "framing") {
		return "border-amber-500/35 bg-amber-500/7";
	}
	return "border-border bg-muted/20";
}

function get_node_icon_class(node: SessionGraphLayoutNode): string {
	if (node.kind === "user_prompt" || node.kind === "assistant_turn") {
		return "text-primary";
	}
	if (node.kind === "search_query") return "text-amber-500";
	if (node.kind === "source_file") return "text-emerald-500";
	if (node.kind === "doc_file") return "text-sky-500";
	if (node.role === "framing") return "text-amber-500";
	return "text-muted-foreground";
}

function format_selected_label(label: string): string {
	return label.length > 44 ? `${label.slice(0, 41)}…` : label;
}

function format_zoom_label(viewport: GraphViewportState | null): string {
	if (!viewport) return "100%";
	return `${Math.round(viewport.scale * 100)}%`;
}

function get_layout_node_bounds(node: SessionGraphLayoutNode) {
	return {
		x: node.x,
		y: node.y,
		width: SESSION_GRAPH_LAYOUT_NODE_WIDTH,
		height: SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
	};
}

function get_node_at_world_point(
	nodes: SessionGraphLayoutNode[],
	point: GraphWorldPoint,
): SessionGraphLayoutNode | null {
	for (let index = nodes.length - 1; index >= 0; index--) {
		const node = nodes[index];
		if (
			point.x >= node.x &&
			point.x <= node.x + SESSION_GRAPH_LAYOUT_NODE_WIDTH &&
			point.y >= node.y &&
			point.y <= node.y + SESSION_GRAPH_LAYOUT_NODE_HEIGHT
		) {
			return node;
		}
	}
	return null;
}

function get_node_palette(
	node: SessionGraphLayoutNode,
	theme: GraphCanvasTheme,
) {
	if (node.kind === "user_prompt") {
		return {
			fill: theme.user_fill,
			stroke: theme.primary,
			accent: theme.primary,
		};
	}
	if (node.kind === "assistant_turn") {
		return {
			fill: theme.assistant_fill,
			stroke: theme.primary,
			accent: theme.primary,
		};
	}
	if (node.kind === "search_query") {
		return {
			fill: theme.search_fill,
			stroke: theme.search_accent,
			accent: theme.search_accent,
		};
	}
	if (node.kind === "source_file") {
		return {
			fill: theme.file_fill,
			stroke: theme.artifact_accent,
			accent: theme.artifact_accent,
		};
	}
	if (node.kind === "doc_file") {
		return {
			fill: theme.doc_fill,
			stroke: theme.doc_accent,
			accent: theme.doc_accent,
		};
	}
	if (node.kind === "agents_doc" || node.role === "framing") {
		return {
			fill: theme.framing_fill,
			stroke: theme.framing_accent,
			accent: theme.framing_accent,
		};
	}
	if (node.kind === "tool_call") {
		return {
			fill: theme.tool_fill,
			stroke: theme.border,
			accent: theme.border,
		};
	}
	return {
		fill: theme.default_fill,
		stroke: theme.border,
		accent: theme.border,
	};
}

function read_graph_canvas_theme(element: HTMLElement): GraphCanvasTheme {
	const style = getComputedStyle(element);
	return {
		background: resolve_theme_color_alpha(style, "--muted", 0.12),
		foreground: resolve_theme_color(style, "--foreground"),
		muted_foreground: resolve_theme_color(style, "--muted-foreground"),
		border: resolve_theme_color_alpha(style, "--muted-foreground", 0.28),
		primary: resolve_theme_color(style, "--primary"),
		primary_soft: resolve_theme_color_alpha(style, "--primary", 0.1),
		session_edge: resolve_theme_color_alpha(style, "--muted-foreground", 0.42),
		framing_edge: "hsl(38 92% 50% / 0.8)",
		selected_edge: resolve_theme_color(style, "--primary"),
		user_fill: resolve_theme_color_alpha(style, "--primary", 0.08),
		assistant_fill: resolve_theme_color_alpha(style, "--primary", 0.06),
		tool_fill: resolve_theme_color_alpha(style, "--background", 0.78),
		search_fill: "hsl(38 92% 50% / 0.08)",
		file_fill: "hsl(142 71% 45% / 0.08)",
		doc_fill: "hsl(198 93% 60% / 0.08)",
		framing_fill: "hsl(38 92% 50% / 0.09)",
		default_fill: resolve_theme_color_alpha(style, "--muted", 0.55),
		artifact_accent: "hsl(142 71% 45%)",
		doc_accent: "hsl(198 93% 60%)",
		search_accent: "hsl(38 92% 50%)",
		framing_accent: "hsl(38 92% 50%)",
	};
}

function resolve_theme_color(
	style: CSSStyleDeclaration,
	name: string,
	fallback = "currentColor",
): string {
	const value = style.getPropertyValue(name).trim();
	return value || fallback;
}

function resolve_theme_color_alpha(
	style: CSSStyleDeclaration,
	name: string,
	alpha: number,
): string {
	const value = style.getPropertyValue(name).trim();
	if (!value) {
		return `rgba(0, 0, 0, ${alpha})`;
	}
	if (value.includes("/")) {
		return value;
	}
	if (/^(oklch|oklab|rgb|hsl|lab|lch)\(/.test(value)) {
		return value.replace(/\)$/, ` / ${alpha})`);
	}
	return value;
}

// ── Component ───────────────────────────────────────────────────────────────

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
	const tree = useMemo(
		() =>
			project_session_graph_tree(graph, {
				show_ambient,
				show_inferred,
				show_unexplored,
			}),
		[graph, show_ambient, show_inferred, show_unexplored],
	);

	const layout = useMemo(
		() => compute_session_graph_layout(tree, selected_node_id),
		[tree, selected_node_id],
	);

	const selected_node = useMemo(
		() => graph.nodes.find((node) => node.id === selected_node_id) ?? null,
		[graph, selected_node_id],
	);

	const selected_layout_node = useMemo(
		() => layout.nodes.find((node) => node.id === selected_node_id) ?? null,
		[layout.nodes, selected_node_id],
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
					on_select_node(hit_node.id);
				}
			}

			clear_pointer_interaction(event);
		},
		[clear_pointer_interaction, layout.nodes, on_select_node, viewport],
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
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="px-3 py-1.5 border-b border-border flex-none flex items-center gap-2 flex-wrap">
				<MiddlePaneModeToggle
					mode={middle_pane_mode}
					on_set_mode={on_set_middle_pane_mode}
				/>
				<span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium">
					Viewported canvas graph
				</span>
				{selected_node && (
					<span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
						Selected: {format_selected_label(selected_node.label)}
					</span>
				)}
				{has_content && (
					<span className="text-[9px] text-muted-foreground tabular-nums">
						{tree.nodes.length} nodes · {tree.edges.length} edges ·{" "}
						{format_zoom_label(viewport)}
					</span>
				)}
				<div className="h-3 w-px bg-border" />
				<div className="flex items-center gap-2 text-[9px] text-muted-foreground">
					<div className="flex items-center gap-1">
						<svg width="14" height="8" aria-hidden="true">
							<line
								x1="0"
								y1="4"
								x2="14"
								y2="4"
								stroke={edge_stroke_colors.session}
								strokeWidth="1.5"
							/>
						</svg>
						<span>Session</span>
					</div>
					<div className="flex items-center gap-1">
						<svg width="14" height="8" aria-hidden="true">
							<line
								x1="0"
								y1="4"
								x2="14"
								y2="4"
								stroke={edge_stroke_colors.framing}
								strokeWidth="1.5"
								strokeDasharray={edge_stroke_dash.framing}
							/>
						</svg>
						<span>Framing</span>
					</div>
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
				<div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
					<GitBranch className="size-6 text-muted-foreground/40" />
					<p className="text-[11px] text-muted-foreground">
						No graph content matches the current visibility filters
					</p>
				</div>
			) : (
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-muted/10">
					<div className="px-3 py-1 border-b border-border/60 text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
						<span>Drag to pan</span>
						<span className="text-border">·</span>
						<span>scroll to move</span>
						<span className="text-border">·</span>
						<span>⌘/Ctrl + scroll to zoom</span>
					</div>
					<div
						ref={container_ref}
						className={cn(
							"relative flex-1 min-h-0 overflow-hidden touch-none select-none",
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

// ── Selected overlay ────────────────────────────────────────────────────────

function SelectedNodeOverlay({
	node,
	left,
	top,
}: {
	node: SessionGraphLayoutNode;
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

// ── Canvas renderer ────────────────────────────────────────────────────────

function draw_graph_canvas(
	context: CanvasRenderingContext2D,
	layout: ReturnType<typeof compute_session_graph_layout>,
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
) {
	const zoom_band = get_graph_zoom_band(viewport.scale);
	context.fillStyle = theme.background;
	context.fillRect(0, 0, size.width, size.height);

	for (const edge of layout.edges) {
		draw_graph_edge(context, edge, viewport, size, theme, zoom_band);
	}

	const ordered_nodes = [...layout.nodes].sort((left, right) => {
		const left_rank = left.is_selected ? 2 : left.is_on_selected_path ? 1 : 0;
		const right_rank = right.is_selected
			? 2
			: right.is_on_selected_path
				? 1
				: 0;
		return left_rank - right_rank;
	});

	for (const node of ordered_nodes) {
		draw_graph_node(context, node, viewport, size, theme, zoom_band);
	}
}

function draw_graph_edge(
	context: CanvasRenderingContext2D,
	edge: SessionGraphLayoutEdge,
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
	zoom_band: GraphZoomBand,
) {
	const screen_points = edge.points.map(([x, y]) =>
		world_to_screen_point({ x, y }, viewport),
	);
	const bounds = get_points_bounds(screen_points);
	if (!rect_intersects_view(bounds, size, 24)) return;

	context.beginPath();
	context.moveTo(screen_points[0].x, screen_points[0].y);
	for (let index = 1; index < screen_points.length; index++) {
		context.lineTo(screen_points[index].x, screen_points[index].y);
	}

	context.strokeStyle = edge.is_on_selected_path
		? theme.selected_edge
		: edge.role === "framing"
			? theme.framing_edge
			: theme.session_edge;
	const base_line_width =
		zoom_band === "overview"
			? 1.2
			: clamp_number(1.1 + viewport.scale * 0.25, 1.1, 1.9);
	context.lineWidth = edge.is_on_selected_path
		? base_line_width + (zoom_band === "overview" ? 0.7 : 1)
		: base_line_width;
	context.globalAlpha = edge.is_on_selected_path
		? 1
		: edge.role === "framing"
			? zoom_band === "overview"
				? 0.68
				: 0.8
			: zoom_band === "overview"
				? 0.62
				: 0.85;
	context.lineJoin = "round";
	context.lineCap = "round";
	context.setLineDash(edge.role === "framing" ? [6, 4] : []);
	context.stroke();
	context.setLineDash([]);
	context.globalAlpha = 1;
}

function draw_graph_node(
	context: CanvasRenderingContext2D,
	node: SessionGraphLayoutNode,
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
	zoom_band: GraphZoomBand,
) {
	const screen_rect = world_rect_to_screen_rect(
		get_layout_node_bounds(node),
		viewport,
	);
	if (!rect_intersects_view(screen_rect, size, 32)) return;

	const palette = get_node_palette(node, theme);
	const visual_weight = get_graph_node_visual_weight(node.kind, node.role);
	const chrome_mode = get_graph_node_chrome_mode(viewport.scale);
	const render_rect = get_node_render_rect(
		screen_rect,
		chrome_mode,
		node.is_selected || node.is_on_selected_path,
	);
	const radius =
		chrome_mode === "pill"
			? Math.min(render_rect.height / 2, 999)
			: Math.max(4, Math.min(render_rect.height * 0.24, 9));
	const stroke_width = node.is_selected
		? 2.5
		: node.is_on_selected_path
			? chrome_mode === "pill"
				? 2.05
				: 1.8
			: chrome_mode === "pill"
				? 1.25
				: chrome_mode === "compact"
					? 1.2
					: 1.1;
	const should_draw_label = should_render_graph_node_label({
		scale: viewport.scale,
		screen_width: render_rect.width,
		kind: node.kind,
		role: node.role,
		is_selected: node.is_selected,
		is_on_selected_path: node.is_on_selected_path,
	});
	const should_draw_accent = should_render_graph_node_accent({
		scale: viewport.scale,
		screen_width: render_rect.width,
		kind: node.kind,
		role: node.role,
		is_selected: node.is_selected,
		is_on_selected_path: node.is_on_selected_path,
	});

	context.save();
	context.fillStyle = palette.fill;
	context.globalAlpha = get_node_fill_alpha(zoom_band, visual_weight, node);
	draw_round_rect(
		context,
		render_rect.x,
		render_rect.y,
		render_rect.width,
		render_rect.height,
		radius,
	);
	context.fill();

	context.strokeStyle = node.is_selected ? theme.primary : palette.stroke;
	context.lineWidth = stroke_width;
	context.globalAlpha = get_node_stroke_alpha(zoom_band, visual_weight, node);
	context.stroke();
	context.globalAlpha = 1;

	const accent_size = Math.max(
		chrome_mode === "pill" ? 2.6 : 3,
		Math.min(render_rect.height * 0.26, chrome_mode === "pill" ? 6 : 8),
	);
	if (should_draw_accent) {
		context.fillStyle = palette.accent;
		context.globalAlpha =
			node.is_selected || node.is_on_selected_path
				? 1
				: zoom_band === "mid" && visual_weight === "secondary"
					? 0.85
					: 0.78;
		context.beginPath();
		context.arc(
			render_rect.x + Math.max(7, accent_size + 3),
			render_rect.y + render_rect.height / 2,
			accent_size / 2,
			0,
			Math.PI * 2,
		);
		context.fill();
		context.globalAlpha = 1;
	}

	if (should_draw_label) {
		const font_size = clamp_number(
			render_rect.height * (chrome_mode === "compact" ? 0.44 : 0.36),
			8.5,
			11.5,
		);
		context.fillStyle =
			visual_weight === "artifact" &&
			!node.is_selected &&
			!node.is_on_selected_path
				? theme.muted_foreground
				: theme.foreground;
		context.font = `${font_size}px "Geist Variable", ui-sans-serif, system-ui, sans-serif`;
		context.textBaseline = "middle";
		const text_x = render_rect.x + Math.max(11, accent_size + 9);
		const text_y = render_rect.y + render_rect.height / 2;
		const max_text_width = Math.max(
			16,
			render_rect.width - (text_x - render_rect.x) - 8,
		);
		draw_truncated_text(context, node.label, text_x, text_y, max_text_width);
	}
	context.restore();
}

function get_node_render_rect(
	screen_rect: { x: number; y: number; width: number; height: number },
	chrome_mode: ReturnType<typeof get_graph_node_chrome_mode>,
	is_emphasized: boolean,
) {
	if (chrome_mode === "detail") {
		return screen_rect;
	}

	const target_width =
		chrome_mode === "pill"
			? screen_rect.width * 0.88
			: screen_rect.width * 0.94;
	const max_extra_width = chrome_mode === "pill" ? 3 : 0;
	const width = Math.min(
		Math.max(target_width, chrome_mode === "pill" ? 10 : 20),
		screen_rect.width + max_extra_width,
	);
	const target_height =
		chrome_mode === "pill"
			? screen_rect.height * (is_emphasized ? 0.78 : 0.68)
			: screen_rect.height * (is_emphasized ? 0.9 : 0.82);
	const height = Math.min(
		Math.max(target_height, chrome_mode === "pill" ? 3.5 : 7),
		screen_rect.height + (chrome_mode === "pill" ? 2 : 3),
	);

	return {
		x: screen_rect.x + (screen_rect.width - width) / 2,
		y: screen_rect.y + (screen_rect.height - height) / 2,
		width,
		height,
	};
}

function get_node_fill_alpha(
	zoom_band: GraphZoomBand,
	visual_weight: ReturnType<typeof get_graph_node_visual_weight>,
	node: SessionGraphLayoutNode,
) {
	if (node.is_selected) return 1;
	if (node.is_on_selected_path) return zoom_band === "overview" ? 0.98 : 0.94;
	if (zoom_band === "overview") {
		if (visual_weight === "primary") return 0.9;
		if (visual_weight === "secondary") return 0.78;
		if (visual_weight === "framing") return 0.74;
		return 0.52;
	}
	if (zoom_band === "mid") {
		if (visual_weight === "primary") return 0.9;
		if (visual_weight === "secondary") return 0.82;
		if (visual_weight === "framing") return 0.78;
		return 0.62;
	}
	if (visual_weight === "artifact") return 0.82;
	if (visual_weight === "framing") return 0.86;
	return 1;
}

function get_node_stroke_alpha(
	zoom_band: GraphZoomBand,
	visual_weight: ReturnType<typeof get_graph_node_visual_weight>,
	node: SessionGraphLayoutNode,
) {
	if (node.is_selected) return 1;
	if (node.is_on_selected_path) return 0.98;
	if (zoom_band === "overview") {
		if (visual_weight === "artifact") return 0.62;
		return 0.9;
	}
	if (zoom_band === "mid") {
		if (visual_weight === "artifact") return 0.72;
		return 0.92;
	}
	if (visual_weight === "artifact") return 0.84;
	return node.role === "framing" ? 0.92 : 1;
}

function draw_round_rect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	const safe_radius = Math.min(radius, width / 2, height / 2);
	context.beginPath();
	context.moveTo(x + safe_radius, y);
	context.lineTo(x + width - safe_radius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + safe_radius);
	context.lineTo(x + width, y + height - safe_radius);
	context.quadraticCurveTo(
		x + width,
		y + height,
		x + width - safe_radius,
		y + height,
	);
	context.lineTo(x + safe_radius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - safe_radius);
	context.lineTo(x, y + safe_radius);
	context.quadraticCurveTo(x, y, x + safe_radius, y);
	context.closePath();
}

function draw_truncated_text(
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	max_width: number,
) {
	if (max_width <= 0) return;
	if (context.measureText(text).width <= max_width) {
		context.fillText(text, x, y);
		return;
	}

	let truncated = text;
	while (truncated.length > 1) {
		truncated = truncated.slice(0, -1);
		const candidate = `${truncated}…`;
		if (context.measureText(candidate).width <= max_width) {
			context.fillText(candidate, x, y);
			return;
		}
	}
}

function get_points_bounds(points: GraphWorldPoint[]) {
	let min_x = Number.POSITIVE_INFINITY;
	let min_y = Number.POSITIVE_INFINITY;
	let max_x = Number.NEGATIVE_INFINITY;
	let max_y = Number.NEGATIVE_INFINITY;

	for (const point of points) {
		min_x = Math.min(min_x, point.x);
		min_y = Math.min(min_y, point.y);
		max_x = Math.max(max_x, point.x);
		max_y = Math.max(max_y, point.y);
	}

	return {
		x: min_x,
		y: min_y,
		width: Math.max(0, max_x - min_x),
		height: Math.max(0, max_y - min_y),
	};
}

function rect_intersects_view(
	rect: { x: number; y: number; width: number; height: number },
	size: { width: number; height: number },
	padding: number,
) {
	return !(
		rect.x + rect.width < -padding ||
		rect.y + rect.height < -padding ||
		rect.x > size.width + padding ||
		rect.y > size.height + padding
	);
}

function clamp_number(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
