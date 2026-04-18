import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	clamp_graph_viewport,
	fit_graph_viewport,
	type GraphViewportSize,
	type GraphViewportState,
	type GraphWorldPoint,
	type GraphWorldRect,
	reveal_world_rect,
} from "@/lib/exploration-graph-viewport";

interface UseGraphViewportOptions {
	graph_bounds: GraphWorldRect | null;
	selected_world_rect: GraphWorldRect | null;
	content_key: string;
}

const DEFAULT_REVEAL_PADDING = 72;

export function use_graph_viewport({
	graph_bounds,
	selected_world_rect,
	content_key,
}: UseGraphViewportOptions) {
	const container_ref = useRef<HTMLDivElement>(null);
	const [container_size, set_container_size] = useState<GraphViewportSize>({
		width: 0,
		height: 0,
	});
	const [viewport, set_viewport] = useState<GraphViewportState | null>(null);
	const last_content_key_ref = useRef<string | null>(null);

	useEffect(() => {
		const element = container_ref.current;
		if (!element) return;

		const update_size = () => {
			const next_width = element.clientWidth;
			const next_height = element.clientHeight;
			set_container_size((prev) => {
				if (prev.width === next_width && prev.height === next_height) {
					return prev;
				}
				return { width: next_width, height: next_height };
			});
		};

		update_size();
		const observer = new ResizeObserver(update_size);
		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	const can_frame_graph = useMemo(
		() =>
			graph_bounds !== null &&
			graph_bounds.width > 0 &&
			graph_bounds.height > 0 &&
			container_size.width > 0 &&
			container_size.height > 0,
		[graph_bounds, container_size.height, container_size.width],
	);

	useEffect(() => {
		if (!can_frame_graph || !graph_bounds) return;

		if (last_content_key_ref.current !== content_key) {
			const next_viewport = fit_graph_viewport(graph_bounds, container_size);
			set_viewport((prev) =>
				are_viewports_equal(prev, next_viewport) ? prev : next_viewport,
			);
			last_content_key_ref.current = content_key;
			return;
		}

		set_viewport((prev) => {
			if (!prev) {
				return fit_graph_viewport(graph_bounds, container_size);
			}
			const next_viewport = clamp_graph_viewport(
				prev,
				graph_bounds,
				container_size,
			);
			return are_viewports_equal(prev, next_viewport) ? prev : next_viewport;
		});
	}, [can_frame_graph, container_size, content_key, graph_bounds]);

	useEffect(() => {
		if (!graph_bounds || !selected_world_rect || !can_frame_graph) return;

		set_viewport((prev) => {
			if (!prev) return prev;
			const next_viewport = reveal_world_rect(
				prev,
				selected_world_rect,
				graph_bounds,
				container_size,
				DEFAULT_REVEAL_PADDING,
			);
			return are_viewports_equal(prev, next_viewport) ? prev : next_viewport;
		});
	}, [can_frame_graph, container_size, graph_bounds, selected_world_rect]);

	const fit_to_graph = useCallback(() => {
		if (!graph_bounds || !can_frame_graph) return;
		const next_viewport = fit_graph_viewport(graph_bounds, container_size);
		set_viewport((prev) =>
			are_viewports_equal(prev, next_viewport) ? prev : next_viewport,
		);
	}, [can_frame_graph, container_size, graph_bounds]);

	const pan_by = useCallback(
		(delta: GraphWorldPoint) => {
			if (!graph_bounds || !can_frame_graph) return;
			set_viewport((prev) => {
				if (!prev) return prev;
				const next_viewport = clamp_graph_viewport(
					{
						...prev,
						translate_x: prev.translate_x + delta.x,
						translate_y: prev.translate_y + delta.y,
					},
					graph_bounds,
					container_size,
				);
				return are_viewports_equal(prev, next_viewport) ? prev : next_viewport;
			});
		},
		[can_frame_graph, container_size, graph_bounds],
	);

	const set_viewport_state = useCallback(
		(updater: (viewport: GraphViewportState) => GraphViewportState) => {
			if (!graph_bounds || !can_frame_graph) return;
			set_viewport((prev) => {
				if (!prev) return prev;
				const next_viewport = clamp_graph_viewport(
					updater(prev),
					graph_bounds,
					container_size,
				);
				return are_viewports_equal(prev, next_viewport) ? prev : next_viewport;
			});
		},
		[can_frame_graph, container_size, graph_bounds],
	);

	return {
		container_ref,
		container_size,
		viewport,
		can_frame_graph,
		fit_to_graph,
		pan_by,
		set_viewport_state,
	};
}

function are_viewports_equal(
	left: GraphViewportState | null,
	right: GraphViewportState | null,
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;

	return (
		Math.abs(left.scale - right.scale) < 0.0001 &&
		Math.abs(left.translate_x - right.translate_x) < 0.01 &&
		Math.abs(left.translate_y - right.translate_y) < 0.01
	);
}
