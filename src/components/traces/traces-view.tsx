import { useState, useMemo, useCallback } from "react";
import type { SessionHeader, SessionEntry } from "@/components/session-viewer/types";
import type { TraceSpan } from "./types";
import { build_trace_timeline } from "./trace-transform";
import { StatsBar } from "./stats-bar";
import { TimelineContainer } from "./timeline/timeline-container";
import { TraceInspector } from "./inspector/trace-inspector";
import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRight } from "lucide-react";

interface TracesViewProps {
  header: SessionHeader | null;
  entries: SessionEntry[];
}

export function TracesView({ header, entries }: TracesViewProps) {
  const [selected_span, set_selected_span] = useState<TraceSpan | null>(null);
  const [inspector_open, set_inspector_open] = useState(true);

  const timeline = useMemo(
    () => build_trace_timeline(header, entries),
    [header, entries],
  );

  const handle_select_span = useCallback((span: TraceSpan) => {
    set_selected_span((prev) => prev?.id === span.id ? null : span);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No entries in this session.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0">
      {/* Main timeline area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <StatsBar stats={timeline.stats} />
        <TimelineContainer
          timeline={timeline}
          selected_span_id={selected_span?.id ?? null}
          on_select_span={handle_select_span}
        />
      </div>

      {/* Inspector toggle */}
      <div className="absolute right-4 top-1 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => set_inspector_open((v) => !v)}
          title={inspector_open ? "Close inspector" : "Open inspector"}
        >
          {inspector_open ? (
            <PanelRightClose className="size-3.5" />
          ) : (
            <PanelRight className="size-3.5" />
          )}
        </Button>
      </div>

      {/* Inspector sidebar */}
      {inspector_open && (
        <aside className="w-[340px] min-w-[300px] shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <TraceInspector span={selected_span} />
        </aside>
      )}
    </div>
  );
}
