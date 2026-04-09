import type { SessionEntry } from "@/components/session-viewer/types";

// ─── Span kind ──────────────────────────────────────────────────────────────

export type SpanKind =
  | "user"
  | "assistant"
  | "text"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "bash"
  | "metadata"
  | "custom";

// ─── Span node (tree element) ───────────────────────────────────────────────

export interface SpanNode {
  id: string;
  label: string;
  kind: SpanKind;
  start_ms: number;
  end_ms: number;
  /** Earliest start across this node + all descendants */
  subtree_start_ms: number;
  /** Latest end across this node + all descendants */
  subtree_end_ms: number;
  duration_ms: number;
  subtree_duration_ms: number;
  color: string;
  is_error: boolean;
  depth: number;
  children: SpanNode[];
  entry: SessionEntry;
  content_index?: number;
  /** For tool_call spans: the paired result entry */
  result_entry?: SessionEntry;
}

// ─── Span tree (transform output) ──────────────────────────────────────────

export interface SpanTreeStats {
  event_count: number;
  tool_count: number;
  error_count: number;
  model: string;
}

export interface SpanTree {
  roots: SpanNode[];
  total_duration_ms: number;
  session_start_iso: string;
  stats: SpanTreeStats;
}

// ─── Visible row (flattened for rendering) ──────────────────────────────────

export interface VisibleRow {
  node: SpanNode;
  depth: number;
  is_expanded: boolean;
  has_children: boolean;
}
