import {
	BookOpen,
	FileCode,
	FileText,
	GitBranch,
	MessageSquare,
	Search,
	ShieldQuestion,
	Terminal,
} from "lucide-react";
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
	world_rect_to_screen_rect,
	world_to_screen_point,
} from "@/lib/exploration-graph-viewport";
import {
	SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
	SESSION_GRAPH_LAYOUT_NODE_WIDTH,
	type SessionGraphLayoutEdge,
	type SessionGraphLayoutNode,
} from "@/lib/exploration-session-graph-grouped-layout";
import type { SessionGraphGroupedEdgeRole as SessionGraphTreeEdgeRole } from "@/lib/exploration-session-graph-grouped-view-model";

export interface GraphCanvasTheme {
	background: string;
	foreground: string;
	muted_foreground: string;
	border: string;
	primary: string;
	primary_soft: string;
	session_edge: string;
	artifact_edge: string;
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

export const edge_stroke_colors: Record<SessionGraphTreeEdgeRole, string> = {
	session: "var(--muted-foreground)",
	artifact: "hsl(142 71% 45%)",
	framing: "hsl(38 92% 50%)",
};

export const edge_stroke_dash: Record<SessionGraphTreeEdgeRole, string> = {
	session: "",
	artifact: "",
	framing: "6 4",
};

export function get_node_icon(kind: string): typeof FileCode {
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

export function get_node_shell_class(node: SessionGraphLayoutNode): string {
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

export function get_node_icon_class(node: SessionGraphLayoutNode): string {
	if (node.kind === "user_prompt" || node.kind === "assistant_turn") {
		return "text-primary";
	}
	if (node.kind === "search_query") return "text-amber-500";
	if (node.kind === "source_file") return "text-emerald-500";
	if (node.kind === "doc_file") return "text-sky-500";
	if (node.role === "framing") return "text-amber-500";
	return "text-muted-foreground";
}

export function format_selected_label(label: string): string {
	return label.length > 44 ? `${label.slice(0, 41)}…` : label;
}

export function format_zoom_label(viewport: GraphViewportState | null): string {
	if (!viewport) return "100%";
	return `${Math.round(viewport.scale * 100)}%`;
}

export function get_layout_node_bounds(node: SessionGraphLayoutNode) {
	return {
		x: node.x,
		y: node.y,
		width: SESSION_GRAPH_LAYOUT_NODE_WIDTH,
		height: SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
	};
}

export function get_node_at_world_point(
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

export function read_graph_canvas_theme(
	element: HTMLElement,
): GraphCanvasTheme {
	const style = getComputedStyle(element);
	return {
		background: resolve_theme_color_alpha(style, "--muted", 0.12),
		foreground: resolve_theme_color(style, "--foreground"),
		muted_foreground: resolve_theme_color(style, "--muted-foreground"),
		border: resolve_theme_color_alpha(style, "--muted-foreground", 0.28),
		primary: resolve_theme_color(style, "--primary"),
		primary_soft: resolve_theme_color_alpha(style, "--primary", 0.1),
		session_edge: resolve_theme_color_alpha(style, "--muted-foreground", 0.42),
		artifact_edge: "hsl(142 71% 45% / 0.4)",
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

export function draw_graph_canvas(
	context: CanvasRenderingContext2D,
	layout: {
		nodes: SessionGraphLayoutNode[];
		edges: SessionGraphLayoutEdge[];
		selected_projection_node_id: string | null;
	},
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
) {
	const zoom_band = get_graph_zoom_band(viewport.scale);
	const has_active_selection = layout.selected_projection_node_id !== null;
	context.fillStyle = theme.background;
	context.fillRect(0, 0, size.width, size.height);

	for (const edge of layout.edges) {
		draw_graph_edge(
			context,
			edge,
			viewport,
			size,
			theme,
			zoom_band,
			has_active_selection,
		);
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
		draw_graph_node(
			context,
			node,
			viewport,
			size,
			theme,
			zoom_band,
			has_active_selection,
		);
	}
}

function draw_graph_edge(
	context: CanvasRenderingContext2D,
	edge: SessionGraphLayoutEdge,
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
	zoom_band: GraphZoomBand,
	has_active_selection: boolean,
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
			: edge.role === "artifact"
				? theme.artifact_edge
				: theme.session_edge;
	const base_line_width =
		zoom_band === "overview"
			? edge.role === "artifact"
				? 1.05
				: 1.2
			: clamp_number(
					edge.role === "artifact"
						? 1 + viewport.scale * 0.22
						: 1.1 + viewport.scale * 0.25,
					1,
					1.9,
				);
	context.lineWidth = edge.is_on_selected_path
		? base_line_width + (zoom_band === "overview" ? 0.7 : 1)
		: has_active_selection
			? base_line_width * 0.92
			: base_line_width;
	context.globalAlpha = get_edge_alpha(edge, zoom_band, has_active_selection);
	context.lineJoin = "round";
	context.lineCap = "round";
	context.setLineDash(edge.role === "framing" ? [6, 4] : []);
	context.stroke();
	context.setLineDash([]);
	context.globalAlpha = 1;
}

function get_edge_alpha(
	edge: SessionGraphLayoutEdge,
	zoom_band: GraphZoomBand,
	has_active_selection: boolean,
): number {
	if (edge.is_on_selected_path) return 1;
	if (has_active_selection) return 0;
	if (edge.role === "framing") return zoom_band === "overview" ? 0.68 : 0.8;
	if (edge.role === "artifact") return zoom_band === "overview" ? 0.5 : 0.72;
	return zoom_band === "overview" ? 0.62 : 0.85;
}

function draw_graph_node(
	context: CanvasRenderingContext2D,
	node: SessionGraphLayoutNode,
	viewport: GraphViewportState,
	size: { width: number; height: number },
	theme: GraphCanvasTheme,
	zoom_band: GraphZoomBand,
	has_active_selection: boolean,
) {
	const screen_rect = world_rect_to_screen_rect(
		get_layout_node_bounds(node),
		viewport,
	);
	if (!rect_intersects_view(screen_rect, size, 32)) return;

	const palette = get_node_palette(node, theme);
	const visual_weight = get_graph_node_visual_weight(node.kind, node.role);
	const is_dimmed =
		has_active_selection && !node.is_selected && !node.is_on_selected_path;
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
	context.globalAlpha = get_node_fill_alpha(
		zoom_band,
		visual_weight,
		node,
		has_active_selection,
	);
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
	context.globalAlpha = get_node_stroke_alpha(
		zoom_band,
		visual_weight,
		node,
		has_active_selection,
	);
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
				: is_dimmed
					? 0.24
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
		context.globalAlpha = is_dimmed ? 0.42 : 1;
		context.font = `${font_size}px "Geist Variable", ui-sans-serif, system-ui, sans-serif`;
		context.textBaseline = "middle";
		const text_x = render_rect.x + Math.max(11, accent_size + 9);
		const text_y = render_rect.y + render_rect.height / 2;
		const max_text_width = Math.max(
			16,
			render_rect.width - (text_x - render_rect.x) - 8,
		);
		draw_truncated_text(context, node.label, text_x, text_y, max_text_width);
		context.globalAlpha = 1;
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
	has_active_selection: boolean,
) {
	if (node.is_selected) return 1;
	if (node.is_on_selected_path) return zoom_band === "overview" ? 0.98 : 0.94;
	if (has_active_selection) {
		if (zoom_band === "overview") return 0.14;
		if (zoom_band === "mid") return 0.18;
		return 0.24;
	}
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
	has_active_selection: boolean,
) {
	if (node.is_selected) return 1;
	if (node.is_on_selected_path) return 0.98;
	if (has_active_selection) {
		if (zoom_band === "overview") return 0.2;
		if (zoom_band === "mid") return 0.24;
		return 0.3;
	}
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
