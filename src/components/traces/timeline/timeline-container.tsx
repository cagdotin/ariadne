import { useState, useCallback, useRef, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { TraceTimeline, TraceSpan } from "../types";
import { TimelineHeader } from "./timeline-header";
import { TimelineLane } from "./timeline-lane";
import { ZoomControls } from "./zoom-controls";

interface TimelineContainerProps {
  timeline: TraceTimeline;
  selected_span_id: string | null;
  on_select_span: (span: TraceSpan) => void;
}

const ZOOM_FACTOR = 1.3;
const MIN_SCALE = 0.0001;
const MAX_SCALE = 10;

// Show at most this many ms in initial view — ensures spans are readable
const MAX_INITIAL_VIEW_MS = 60_000;

export function TimelineContainer({
  timeline,
  selected_span_id,
  on_select_span,
}: TimelineContainerProps) {
  const container_ref = useRef<HTMLDivElement>(null);
  const [container_width, set_container_width] = useState(800);
  const [scale, set_scale] = useState(1);
  const [offset_x, set_offset_x] = useState(0);
  const initialized_ref = useRef(false);

  // Keep refs in sync for the stable wheel handler
  const scale_ref = useRef(scale);
  const offset_x_ref = useRef(offset_x);
  scale_ref.current = scale;
  offset_x_ref.current = offset_x;

  // Measure container width
  useEffect(() => {
    const el = container_ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 800;
      set_container_width(Math.max(width - 110, 100));
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Smart initial zoom: show either the full timeline or the first 60s,
  // whichever results in a more readable view (larger spans).
  useEffect(() => {
    if (!initialized_ref.current && container_width > 100 && timeline.total_duration_ms > 0) {
      initialized_ref.current = true;
      const fit = container_width / timeline.total_duration_ms;
      const capped_scale = container_width / Math.min(timeline.total_duration_ms, MAX_INITIAL_VIEW_MS);
      const initial_scale = Math.min(capped_scale, fit * 3);
      set_scale(Math.max(initial_scale, fit));
      set_offset_x(0);
    }
  }, [container_width, timeline.total_duration_ms]);

  const fit_scale = container_width > 0 && timeline.total_duration_ms > 0
    ? container_width / timeline.total_duration_ms
    : 1;

  const fit = useCallback(() => {
    if (timeline.total_duration_ms > 0) {
      set_scale(fit_scale);
      set_offset_x(0);
    }
  }, [fit_scale, timeline.total_duration_ms]);

  const zoom_percentage = Math.round((scale / fit_scale) * 100) || 100;

  const zoom_in = useCallback(() => {
    set_scale((s) => Math.min(s * ZOOM_FACTOR, MAX_SCALE));
  }, []);

  const zoom_out = useCallback(() => {
    set_scale((s) => Math.max(s / ZOOM_FACTOR, MIN_SCALE));
  }, []);

  // Stable wheel handler — reads from refs to avoid stale closures
  const handle_wheel = useCallback(
    (e: React.WheelEvent) => {
      const current_scale = scale_ref.current;
      const current_offset = offset_x_ref.current;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = container_ref.current?.getBoundingClientRect();
        if (!rect) return;

        const cursor_x = e.clientX - rect.left - 110;
        const cursor_time = (cursor_x + current_offset) / current_scale;

        const new_scale = e.deltaY < 0
          ? Math.min(current_scale * ZOOM_FACTOR, MAX_SCALE)
          : Math.max(current_scale / ZOOM_FACTOR, MIN_SCALE);

        const new_offset = cursor_time * new_scale - cursor_x;
        set_scale(new_scale);
        set_offset_x(Math.max(0, new_offset));
      } else {
        set_offset_x((o) => Math.max(0, o + e.deltaX + e.deltaY));
      }
    },
    [], // stable — reads from refs
  );

  if (!initialized_ref.current) {
    return <div ref={container_ref} className="flex-1 min-h-0" />;
  }

  return (
    <TooltipProvider>
      <div
        ref={container_ref}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        onWheel={handle_wheel}
      >
        <TimelineHeader
          total_duration_ms={timeline.total_duration_ms}
          scale={scale}
          offset_x={offset_x}
          container_width={container_width}
        />

        <div className="flex-1 min-h-0 overflow-y-auto">
          {timeline.lanes.map((lane) => (
            <TimelineLane
              key={lane.id}
              lane={lane}
              scale={scale}
              offset_x={offset_x}
              container_width={container_width}
              selected_span_id={selected_span_id}
              on_select_span={on_select_span}
            />
          ))}
        </div>

        <ZoomControls
          on_zoom_in={zoom_in}
          on_zoom_out={zoom_out}
          on_fit={fit}
          zoom_percentage={zoom_percentage}
        />
      </div>
    </TooltipProvider>
  );
}
