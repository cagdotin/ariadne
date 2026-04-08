import { memo } from "react";
import type { TraceLane, TraceSpan } from "../types";
import { TimelineSpan } from "./timeline-span";
import type { LaneId } from "../types";
import {
  Database,
  User,
  Bot,
  Wrench,
  Puzzle,
} from "lucide-react";

const LANE_ICONS: Record<LaneId, React.ComponentType<{ className?: string }>> = {
  metadata: Database,
  user: User,
  assistant: Bot,
  tools: Wrench,
  custom: Puzzle,
};

interface TimelineLaneProps {
  lane: TraceLane;
  scale: number;
  offset_x: number;
  container_width: number;
  selected_span_id: string | null;
  on_select_span: (span: TraceSpan) => void;
}

export const TimelineLane = memo(function TimelineLane({
  lane,
  scale,
  offset_x,
  container_width,
  selected_span_id,
  on_select_span,
}: TimelineLaneProps) {
  const Icon = LANE_ICONS[lane.id] ?? Puzzle;

  return (
    <div className="flex border-b border-border last:border-b-0 group/lane hover:bg-muted/20 transition-colors">
      {/* Lane label */}
      <div className="w-[110px] shrink-0 flex items-center gap-1.5 px-3 border-r border-border bg-card">
        <Icon className="size-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground truncate">
          {lane.label}
        </span>
      </div>

      {/* Spans area */}
      <div className="flex-1 relative h-8 min-w-0">
        {lane.spans.map((span) => (
          <TimelineSpan
            key={span.id}
            span={span}
            scale={scale}
            offset_x={offset_x}
            container_width={container_width}
            is_selected={selected_span_id === span.id}
            on_select={on_select_span}
          />
        ))}
      </div>
    </div>
  );
});
