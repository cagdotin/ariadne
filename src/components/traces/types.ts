import type { SessionEntry } from "@/components/session-viewer/types";

// ─── Lane identifiers ──────────────────────────────────────────────────────

export type LaneId = "metadata" | "user" | "assistant" | "tools" | "custom";

// ─── Span ───────────────────────────────────────────────────────────────────

export interface TraceSpan {
  id: string;
  entry_id: string;
  lane: LaneId;
  label: string;
  start_ms: number;
  end_ms: number;
  color: string;
  is_error: boolean;
  entry: SessionEntry;
  content_index?: number;
}

// ─── Lane ───────────────────────────────────────────────────────────────────

export interface TraceLane {
  id: LaneId;
  label: string;
  spans: TraceSpan[];
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface TraceStats {
  started_at: string;
  duration_formatted: string;
  duration_ms: number;
  event_count: number;
  tool_count: number;
  error_count: number;
  model: string;
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export interface TraceTimeline {
  lanes: TraceLane[];
  total_duration_ms: number;
  session_start_iso: string;
  stats: TraceStats;
}
