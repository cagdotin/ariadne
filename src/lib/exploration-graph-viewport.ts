export interface GraphViewportState {
	scale: number;
	translate_x: number;
	translate_y: number;
}

export interface GraphViewportSize {
	width: number;
	height: number;
}

export interface GraphWorldPoint {
	x: number;
	y: number;
}

export interface GraphWorldRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GraphViewportBoundsOptions {
	padding?: number;
	overscroll?: number;
	min_scale?: number;
	max_scale?: number;
}

const DEFAULT_FIT_PADDING = 32;
const DEFAULT_OVERSCROLL = 96;
export const DEFAULT_MIN_GRAPH_SCALE = 0.08;
export const DEFAULT_MAX_GRAPH_SCALE = 2.5;

export function fit_graph_viewport(
	bounds: GraphWorldRect,
	size: GraphViewportSize,
	options: GraphViewportBoundsOptions = {},
): GraphViewportState {
	const padding = options.padding ?? DEFAULT_FIT_PADDING;
	const min_scale = options.min_scale ?? DEFAULT_MIN_GRAPH_SCALE;
	const max_scale = options.max_scale ?? DEFAULT_MAX_GRAPH_SCALE;

	if (
		size.width <= 0 ||
		size.height <= 0 ||
		bounds.width <= 0 ||
		bounds.height <= 0
	) {
		return {
			scale: 1,
			translate_x: 0,
			translate_y: 0,
		};
	}

	const usable_width = Math.max(1, size.width - padding * 2);
	const usable_height = Math.max(1, size.height - padding * 2);
	const fitted_scale = Math.min(
		usable_width / bounds.width,
		usable_height / bounds.height,
	);
	const scale = clamp(fitted_scale, min_scale, max_scale);

	return clamp_graph_viewport(
		{
			scale,
			translate_x: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
			translate_y: (size.height - bounds.height * scale) / 2 - bounds.y * scale,
		},
		bounds,
		size,
		options,
	);
}

export function clamp_graph_viewport(
	viewport: GraphViewportState,
	bounds: GraphWorldRect,
	size: GraphViewportSize,
	options: GraphViewportBoundsOptions = {},
): GraphViewportState {
	const scale = clamp(
		viewport.scale,
		options.min_scale ?? DEFAULT_MIN_GRAPH_SCALE,
		options.max_scale ?? DEFAULT_MAX_GRAPH_SCALE,
	);
	const overscroll = options.overscroll ?? DEFAULT_OVERSCROLL;

	const content_width = bounds.width * scale;
	const content_height = bounds.height * scale;

	const translate_x = clamp_translation_axis(
		viewport.translate_x,
		size.width,
		content_width,
		bounds.x * scale,
		overscroll,
	);
	const translate_y = clamp_translation_axis(
		viewport.translate_y,
		size.height,
		content_height,
		bounds.y * scale,
		overscroll,
	);

	return {
		scale,
		translate_x,
		translate_y,
	};
}

export function pan_graph_viewport(
	viewport: GraphViewportState,
	delta_screen: GraphWorldPoint,
	bounds: GraphWorldRect,
	size: GraphViewportSize,
	options: GraphViewportBoundsOptions = {},
): GraphViewportState {
	return clamp_graph_viewport(
		{
			...viewport,
			translate_x: viewport.translate_x + delta_screen.x,
			translate_y: viewport.translate_y + delta_screen.y,
		},
		bounds,
		size,
		options,
	);
}

export function zoom_graph_viewport_at_point(
	viewport: GraphViewportState,
	anchor_screen: GraphWorldPoint,
	zoom_multiplier: number,
	bounds: GraphWorldRect,
	size: GraphViewportSize,
	options: GraphViewportBoundsOptions = {},
): GraphViewportState {
	const next_scale = clamp(
		viewport.scale * zoom_multiplier,
		options.min_scale ?? DEFAULT_MIN_GRAPH_SCALE,
		options.max_scale ?? DEFAULT_MAX_GRAPH_SCALE,
	);
	const anchor_world = screen_to_world_point(anchor_screen, viewport);

	return clamp_graph_viewport(
		{
			scale: next_scale,
			translate_x: anchor_screen.x - anchor_world.x * next_scale,
			translate_y: anchor_screen.y - anchor_world.y * next_scale,
		},
		bounds,
		size,
		options,
	);
}

export function reveal_world_rect(
	viewport: GraphViewportState,
	target: GraphWorldRect,
	bounds: GraphWorldRect,
	size: GraphViewportSize,
	padding = 56,
	options: GraphViewportBoundsOptions = {},
): GraphViewportState {
	if (is_world_rect_visible(viewport, target, size, padding)) {
		return clamp_graph_viewport(viewport, bounds, size, options);
	}

	const target_center_x = target.x + target.width / 2;
	const target_center_y = target.y + target.height / 2;

	return clamp_graph_viewport(
		{
			...viewport,
			translate_x: size.width / 2 - target_center_x * viewport.scale,
			translate_y: size.height / 2 - target_center_y * viewport.scale,
		},
		bounds,
		size,
		options,
	);
}

export function is_world_rect_visible(
	viewport: GraphViewportState,
	target: GraphWorldRect,
	size: GraphViewportSize,
	padding = 0,
): boolean {
	const screen_rect = world_rect_to_screen_rect(target, viewport);

	return (
		screen_rect.x >= padding &&
		screen_rect.y >= padding &&
		screen_rect.x + screen_rect.width <= size.width - padding &&
		screen_rect.y + screen_rect.height <= size.height - padding
	);
}

export function world_to_screen_point(
	point: GraphWorldPoint,
	viewport: GraphViewportState,
): GraphWorldPoint {
	return {
		x: point.x * viewport.scale + viewport.translate_x,
		y: point.y * viewport.scale + viewport.translate_y,
	};
}

export function screen_to_world_point(
	point: GraphWorldPoint,
	viewport: GraphViewportState,
): GraphWorldPoint {
	return {
		x: (point.x - viewport.translate_x) / viewport.scale,
		y: (point.y - viewport.translate_y) / viewport.scale,
	};
}

export function world_rect_to_screen_rect(
	rect: GraphWorldRect,
	viewport: GraphViewportState,
): GraphWorldRect {
	const origin = world_to_screen_point({ x: rect.x, y: rect.y }, viewport);
	return {
		x: origin.x,
		y: origin.y,
		width: rect.width * viewport.scale,
		height: rect.height * viewport.scale,
	};
}

function clamp_translation_axis(
	translate: number,
	viewport_extent: number,
	content_extent: number,
	content_origin: number,
	overscroll: number,
): number {
	if (viewport_extent <= 0) return translate;

	if (content_extent + overscroll * 2 <= viewport_extent) {
		return (viewport_extent - content_extent) / 2 - content_origin;
	}

	const min_translate =
		viewport_extent - (content_origin + content_extent) - overscroll;
	const max_translate = overscroll - content_origin;
	return clamp(translate, min_translate, max_translate);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
