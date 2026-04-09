import { useState, useCallback, useRef, useEffect } from "react";
import { SCALE } from "../timeline-ruler";

interface ZoomWindow {
  start_ms: number;
  end_ms: number;
}

interface ZoomDragState {
  start_px: number;
  current_px: number;
  timeline_left: number;
  timeline_width: number;
}

interface UseTimelineZoomOptions {
  total_duration_ms: number;
  timeline_ref: React.RefObject<HTMLDivElement | null>;
  container_ref: React.RefObject<HTMLDivElement | null>;
}

export function use_timeline_zoom({ total_duration_ms, timeline_ref, container_ref }: UseTimelineZoomOptions) {
  const [zoom, set_zoom] = useState<ZoomWindow | null>(null);
  const [zoom_drag, set_zoom_drag] = useState<ZoomDragState | null>(null);

  const view_start = zoom?.start_ms ?? 0;
  const view_end = zoom?.end_ms ?? total_duration_ms;
  const is_zoomed = zoom !== null;

  // Refs to avoid stale closures in global listeners
  const zoom_ref = useRef(zoom);
  zoom_ref.current = zoom;
  const total_ref = useRef(total_duration_ms);
  total_ref.current = total_duration_ms;
  const view_start_ref = useRef(view_start);
  view_start_ref.current = view_start;
  const view_end_ref = useRef(view_end);
  view_end_ref.current = view_end;

  // Horizontal scroll/trackpad to pan when zoomed
  useEffect(() => {
    const el = container_ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      const current_zoom = zoom_ref.current;
      if (!current_zoom) return;

      const delta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (delta === 0) return;

      e.preventDefault();

      const range = current_zoom.end_ms - current_zoom.start_ms;
      const pan_amount = (delta / 100) * range * 0.5;

      set_zoom((prev) => {
        if (!prev) return prev;
        const total = total_ref.current;
        let new_start = prev.start_ms + pan_amount;
        let new_end = prev.end_ms + pan_amount;

        if (new_start < 0) {
          new_end -= new_start;
          new_start = 0;
        }
        if (new_end > total) {
          new_start -= (new_end - total);
          new_end = total;
          if (new_start < 0) new_start = 0;
        }

        return { start_ms: new_start, end_ms: new_end };
      });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []); // stable — reads from refs

  // Drag-to-zoom on timeline ruler area
  const handle_zoom_mouse_down = useCallback((e: React.MouseEvent) => {
    const timeline_el = timeline_ref.current;
    const container_el = container_ref.current;
    if (!timeline_el || !container_el) return;

    const timeline_rect = timeline_el.getBoundingClientRect();
    const container_rect = container_el.getBoundingClientRect();
    const timeline_left = timeline_rect.left - container_rect.left;
    const timeline_width = timeline_rect.width;
    const start_px = e.clientX - container_rect.left;

    set_zoom_drag({ start_px, current_px: start_px, timeline_left, timeline_width });

    const handle_mouse_move = (move_e: MouseEvent) => {
      const current_px = move_e.clientX - container_rect.left;
      set_zoom_drag((prev) => prev ? { ...prev, current_px } : null);
    };

    const handle_mouse_up = (up_e: MouseEvent) => {
      const current_view_start = view_start_ref.current;
      const current_view_end = view_end_ref.current;

      const end_px = up_e.clientX - container_rect.left;
      const min_px = Math.max(timeline_left, Math.min(start_px, end_px));
      const max_px = Math.min(timeline_left + timeline_width, Math.max(start_px, end_px));

      const min_pct = ((min_px - timeline_left) / timeline_width) * 100;
      const max_pct = ((max_px - timeline_left) / timeline_width) * 100;

      if (max_pct - min_pct > 2) {
        const range = current_view_end - current_view_start;
        const new_start = current_view_start + (min_pct / 100 / SCALE) * range;
        const new_end = current_view_start + (max_pct / 100 / SCALE) * range;
        set_zoom({
          start_ms: Math.max(0, new_start),
          end_ms: Math.min(total_ref.current, new_end),
        });
      }

      set_zoom_drag(null);
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);
  }, []); // stable — reads from refs

  const reset_zoom = useCallback(() => set_zoom(null), []);

  // Zoom selection overlay derived values
  const zoom_overlay_left = zoom_drag ? Math.min(zoom_drag.start_px, zoom_drag.current_px) : 0;
  const zoom_overlay_width = zoom_drag ? Math.abs(zoom_drag.current_px - zoom_drag.start_px) : 0;

  return {
    view_start,
    view_end,
    is_zoomed,
    zoom_drag,
    zoom_overlay_left,
    zoom_overlay_width,
    handle_zoom_mouse_down,
    reset_zoom,
  };
}
