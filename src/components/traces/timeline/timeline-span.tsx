import { memo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { TraceSpan } from "../types";

interface TimelineSpanProps {
  span: TraceSpan;
  scale: number;
  offset_x: number;
  container_width: number;
  is_selected: boolean;
  on_select: (span: TraceSpan) => void;
}

function format_duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.floor(seconds % 60);
  return `${minutes}:${String(rem).padStart(2, "0")}`;
}

export const TimelineSpan = memo(function TimelineSpan({
  span,
  scale,
  offset_x,
  container_width,
  is_selected,
  on_select,
}: TimelineSpanProps) {
  const left = span.start_ms * scale - offset_x;
  const width = Math.max((span.end_ms - span.start_ms) * scale, 6);

  // Cull spans entirely off-screen (left or right)
  if (left + width < 0 || left > container_width) return null;

  const duration = span.end_ms - span.start_ms;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${span.label} — ${format_duration(duration)}`}
            className={cn(
              "absolute top-1 bottom-1 rounded-sm text-[10px] font-medium leading-none",
              "flex items-center px-1.5 overflow-hidden whitespace-nowrap",
              "cursor-pointer transition-all",
              "hover:brightness-110 hover:ring-1 hover:ring-foreground/20",
              is_selected && "ring-2 ring-primary shadow-md",
              span.is_error && "ring-1 ring-destructive",
            )}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              backgroundColor: span.color,
              color: "oklch(0.98 0 0)",
            }}
            onClick={() => on_select(span)}
          />
        }
      >
        {width > 40 && (
          <span className="truncate">{span.label}</span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="font-medium">{span.label}</span>
        <span className="text-muted-foreground"> \u00b7 {format_duration(duration)}</span>
      </TooltipContent>
    </Tooltip>
  );
});
