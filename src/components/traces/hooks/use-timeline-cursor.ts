import { useCallback, useRef, useState } from "react";
import { SCALE } from "../timeline-ruler";

interface CursorPosition {
	px: number;
	ms: number;
}

interface UseTimelineCursorOptions {
	view_start: number;
	view_end: number;
	timeline_ref: React.RefObject<HTMLDivElement | null>;
	container_ref: React.RefObject<HTMLDivElement | null>;
}

export function use_timeline_cursor({
	view_start,
	view_end,
	timeline_ref,
	container_ref,
}: UseTimelineCursorOptions) {
	const [cursor, set_cursor] = useState<CursorPosition | null>(null);

	// Use refs to keep the callback stable and avoid re-renders from view changes
	const view_start_ref = useRef(view_start);
	view_start_ref.current = view_start;
	const view_end_ref = useRef(view_end);
	view_end_ref.current = view_end;

	const handle_mouse_move = useCallback(
		(e: React.MouseEvent) => {
			const timeline_el = timeline_ref.current;
			const container_el = container_ref.current;
			if (!timeline_el || !container_el) return;

			const timeline_rect = timeline_el.getBoundingClientRect();
			const container_rect = container_el.getBoundingClientRect();

			if (e.clientX < timeline_rect.left || e.clientX > timeline_rect.right) {
				set_cursor(null);
				return;
			}

			const v_start = view_start_ref.current;
			const v_end = view_end_ref.current;
			const px = e.clientX - container_rect.left;
			const pct = (e.clientX - timeline_rect.left) / timeline_rect.width;
			const range = v_end - v_start;
			const ms = v_start + (pct / SCALE) * range;

			set_cursor({ px, ms: Math.max(v_start, Math.min(v_end, ms)) });
		},
		[timeline_ref.current, container_ref.current],
	); // stable — reads from refs

	const handle_mouse_leave = useCallback(() => {
		set_cursor(null);
	}, []);

	return { cursor, handle_mouse_move, handle_mouse_leave };
}
