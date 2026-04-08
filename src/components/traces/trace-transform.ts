import type {
  SessionHeader,
  SessionEntry,
  MessageEntry,
  AssistantMessageData,
  ToolCallContent,
  ContentBlock,
} from "@/components/session-viewer/types";
import type { TraceSpan, TraceLane, TraceTimeline, LaneId } from "./types";

// ─── Color mapping ─────────────────────────────────────────────────────────

const LANE_COLORS: Record<LaneId, string> = {
  metadata: "var(--chart-3)",
  user: "var(--chart-1)",
  assistant: "var(--chart-2)",
  tools: "var(--chart-4)",
  custom: "var(--chart-5)",
};

const THINKING_COLOR = "var(--chart-5)";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MIN_SPAN_MS = 300;

function format_duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const total_seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(total_seconds / 60);
  const seconds = total_seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function make_span_id(entry_id: string, suffix?: string): string {
  return suffix ? `${entry_id}:${suffix}` : entry_id;
}

// ─── Entry → Span(s) ───────────────────────────────────────────────────────

function extract_spans_from_entry(
  entry: SessionEntry,
  start_ms: number,
  next_timestamp_ms: number | null,
): TraceSpan[] {
  const end_ms = next_timestamp_ms
    ? Math.max(next_timestamp_ms, start_ms + MIN_SPAN_MS)
    : start_ms + 500;

  if (entry.type !== "message") {
    return [make_non_message_span(entry, start_ms, end_ms)];
  }

  const msg_entry = entry as MessageEntry;
  const message = msg_entry.message;

  switch (message.role) {
    case "user":
      return [{
        id: make_span_id(entry.id),
        entry_id: entry.id,
        lane: "user",
        label: "USER",
        start_ms,
        end_ms,
        color: LANE_COLORS.user,
        is_error: false,
        entry,
      }];

    case "assistant":
      return extract_assistant_spans(entry, message as AssistantMessageData, start_ms, end_ms);

    case "toolResult":
      return [{
        id: make_span_id(entry.id),
        entry_id: entry.id,
        lane: "tools",
        label: `result: ${(message as { toolName?: string }).toolName ?? "unknown"}`,
        start_ms,
        end_ms,
        color: LANE_COLORS.tools,
        is_error: !!(message as { isError?: boolean }).isError,
        entry,
      }];

    case "bashExecution":
      return [{
        id: make_span_id(entry.id),
        entry_id: entry.id,
        lane: "tools",
        label: "BASH",
        start_ms,
        end_ms,
        color: LANE_COLORS.tools,
        is_error: (message as { exitCode?: number }).exitCode !== 0 &&
                  (message as { exitCode?: number }).exitCode !== undefined,
        entry,
      }];

    case "custom":
      return [{
        id: make_span_id(entry.id),
        entry_id: entry.id,
        lane: "custom",
        label: (message as { customType?: string }).customType ?? "CUSTOM",
        start_ms,
        end_ms,
        color: LANE_COLORS.custom,
        is_error: false,
        entry,
      }];

    default:
      return [{
        id: make_span_id(entry.id),
        entry_id: entry.id,
        lane: "custom",
        label: String((message as { role: string }).role).toUpperCase(),
        start_ms,
        end_ms,
        color: LANE_COLORS.custom,
        is_error: false,
        entry,
      }];
  }
}

function extract_assistant_spans(
  entry: SessionEntry,
  message: AssistantMessageData,
  start_ms: number,
  end_ms: number,
): TraceSpan[] {
  const spans: TraceSpan[] = [];
  const content = message.content;
  if (!content || !Array.isArray(content)) {
    return [{
      id: make_span_id(entry.id),
      entry_id: entry.id,
      lane: "assistant",
      label: "TEXT",
      start_ms,
      end_ms,
      color: LANE_COLORS.assistant,
      is_error: !!message.errorMessage,
      entry,
    }];
  }

  for (let i = 0; i < content.length; i++) {
    const block = content[i] as ContentBlock;
    const span = content_block_to_span(entry, block, i, start_ms, end_ms, !!message.errorMessage);
    if (span) spans.push(span);
  }

  return spans.length > 0 ? spans : [{
    id: make_span_id(entry.id),
    entry_id: entry.id,
    lane: "assistant",
    label: "TEXT",
    start_ms,
    end_ms,
    color: LANE_COLORS.assistant,
    is_error: !!message.errorMessage,
    entry,
  }];
}

function content_block_to_span(
  entry: SessionEntry,
  block: ContentBlock,
  index: number,
  start_ms: number,
  end_ms: number,
  is_error: boolean,
): TraceSpan | null {
  switch (block.type) {
    case "text":
      return {
        id: make_span_id(entry.id, `text-${index}`),
        entry_id: entry.id,
        lane: "assistant",
        label: "TEXT",
        start_ms,
        end_ms,
        color: LANE_COLORS.assistant,
        is_error,
        entry,
        content_index: index,
      };

    case "thinking":
      return {
        id: make_span_id(entry.id, `thinking-${index}`),
        entry_id: entry.id,
        lane: "assistant",
        label: "THINKING",
        start_ms,
        end_ms,
        color: THINKING_COLOR,
        is_error: false,
        entry,
        content_index: index,
      };

    case "toolCall": {
      const tool_call = block as ToolCallContent;
      return {
        id: make_span_id(entry.id, `tool-${index}`),
        entry_id: entry.id,
        lane: "tools",
        label: `tool: ${tool_call.name}`,
        start_ms,
        end_ms,
        color: LANE_COLORS.tools,
        is_error,
        entry,
        content_index: index,
      };
    }

    case "image":
      return {
        id: make_span_id(entry.id, `image-${index}`),
        entry_id: entry.id,
        lane: "assistant",
        label: "IMAGE",
        start_ms,
        end_ms,
        color: LANE_COLORS.assistant,
        is_error: false,
        entry,
        content_index: index,
      };

    default:
      return null;
  }
}

function make_non_message_span(
  entry: SessionEntry,
  start_ms: number,
  end_ms: number,
): TraceSpan {
  const label_map: Record<string, string> = {
    model_change: "MODEL",
    thinking_level_change: "THINKING LEVEL",
    compaction: "COMPACTION",
    branch_summary: "BRANCH",
    label: "LABEL",
    session_info: "INFO",
    custom: (entry as { customType?: string }).customType ?? "CUSTOM",
    custom_message: (entry as { customType?: string }).customType ?? "CUSTOM",
  };

  const lane: LaneId = entry.type === "custom" || entry.type === "custom_message"
    ? "custom"
    : "metadata";

  return {
    id: make_span_id(entry.id),
    entry_id: entry.id,
    lane,
    label: label_map[entry.type] ?? entry.type.toUpperCase(),
    start_ms,
    end_ms: Math.min(end_ms, start_ms + MIN_SPAN_MS),
    color: LANE_COLORS[lane],
    is_error: false,
    entry,
  };
}

// ─── Tool call → result pairing (adjusts tool call span end times) ──────

function pair_tool_calls(spans: TraceSpan[]): void {
  const tool_call_spans = new Map<string, TraceSpan>();

  for (const span of spans) {
    if (span.lane === "tools" && span.label.startsWith("tool: ") && span.content_index !== undefined) {
      const msg_entry = span.entry as MessageEntry;
      const content = (msg_entry.message as AssistantMessageData).content;
      if (content && Array.isArray(content)) {
        const block = content[span.content_index] as ToolCallContent;
        if (block?.type === "toolCall" && block.id) {
          tool_call_spans.set(block.id, span);
        }
      }
    }
  }

  for (const span of spans) {
    if (span.lane === "tools" && span.label.startsWith("result: ")) {
      const msg_entry = span.entry as MessageEntry;
      const tool_call_id = (msg_entry.message as { toolCallId?: string }).toolCallId;
      if (tool_call_id) {
        const call_span = tool_call_spans.get(tool_call_id);
        if (call_span) {
          call_span.end_ms = Math.max(span.end_ms, call_span.start_ms + MIN_SPAN_MS);
        }
      }
    }
  }
}

// ─── Main transform ─────────────────────────────────────────────────────────

export function build_trace_timeline(
  header: SessionHeader | null,
  entries: SessionEntry[],
): TraceTimeline {
  const session_start = header ? Date.parse(header.timestamp) : 0;
  const all_spans: TraceSpan[] = [];
  let tool_count = 0;
  let error_count = 0;
  let model = "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const timestamp_ms = Date.parse(entry.timestamp);
    const start_ms = session_start && !Number.isNaN(timestamp_ms)
      ? timestamp_ms - session_start
      : i * 1000;

    const next_raw = i + 1 < entries.length ? Date.parse(entries[i + 1].timestamp) : NaN;
    const next_timestamp_ms = !Number.isNaN(next_raw) && session_start
      ? next_raw - session_start
      : null;

    const spans = extract_spans_from_entry(entry, start_ms, next_timestamp_ms);
    all_spans.push(...spans);

    // Collect stats
    if (entry.type === "message") {
      const msg = (entry as MessageEntry).message;
      if (msg.role === "assistant") {
        const assistant = msg as AssistantMessageData;
        if (assistant.model && !model) model = assistant.model;
        if (assistant.errorMessage) error_count++;
        if (assistant.content && Array.isArray(assistant.content)) {
          for (const block of assistant.content) {
            if ((block as ContentBlock).type === "toolCall") tool_count++;
          }
        }
      }
      if (msg.role === "toolResult" && (msg as { isError?: boolean }).isError) {
        error_count++;
      }
    }
    if (entry.type === "model_change") {
      model = (entry as { modelId?: string }).modelId ?? model;
    }
  }

  // Pair tool calls with results
  pair_tool_calls(all_spans);

  // Compute total duration (manual loop avoids stack overflow on large sessions)
  let last_span_end = 0;
  for (const s of all_spans) {
    if (s.end_ms > last_span_end) last_span_end = s.end_ms;
  }
  const total_duration_ms = Math.max(last_span_end, 1000);

  // Build lanes
  const lane_order: LaneId[] = ["metadata", "user", "assistant", "tools", "custom"];
  const lane_labels: Record<LaneId, string> = {
    metadata: "Metadata",
    user: "User",
    assistant: "Assistant",
    tools: "Tools",
    custom: "Custom",
  };

  const lanes: TraceLane[] = lane_order
    .map((lane_id) => ({
      id: lane_id,
      label: lane_labels[lane_id],
      spans: all_spans
        .filter((s) => s.lane === lane_id)
        .sort((a, b) => a.start_ms - b.start_ms),
    }))
    .filter((lane) => lane.spans.length > 0);

  return {
    lanes,
    total_duration_ms,
    session_start_iso: header?.timestamp ?? "",
    stats: {
      started_at: header?.timestamp ?? "",
      duration_formatted: format_duration(total_duration_ms),
      duration_ms: total_duration_ms,
      event_count: entries.length,
      tool_count,
      error_count,
      model,
    },
  };
}
