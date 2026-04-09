import type {
  SessionHeader,
  SessionEntry,
  MessageEntry,
  AssistantMessageData,
  ToolCallContent,
  ContentBlock,
} from "@/components/session-viewer/types";
import type { SpanNode, SpanTree, SpanKind } from "./types";

// ─── Colors ─────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<SpanKind, string> = {
  user: "var(--chart-1)",
  assistant: "var(--chart-2)",
  text: "var(--chart-2)",
  thinking: "var(--chart-5)",
  tool_call: "var(--chart-4)",
  tool_result: "var(--chart-4)",
  bash: "var(--chart-4)",
  metadata: "var(--chart-3)",
  custom: "var(--chart-5)",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MIN_SPAN_MS = 300;

function make_id(entry_id: string, suffix?: string): string {
  return suffix ? `${entry_id}:${suffix}` : entry_id;
}

function entry_timestamp_ms(entry: SessionEntry, session_start: number, fallback_index: number): number {
  const ts = Date.parse(entry.timestamp);
  if (!Number.isNaN(ts) && session_start) return ts - session_start;
  return fallback_index * 1000;
}

function next_entry_ms(entries: SessionEntry[], index: number, session_start: number): number | null {
  if (index + 1 >= entries.length) return null;
  const ts = Date.parse(entries[index + 1].timestamp);
  if (!Number.isNaN(ts) && session_start) return ts - session_start;
  return null;
}

// ─── Subtree timing ────────────────────────────────────────────────────────

function compute_subtree_timing(node: SpanNode): void {
  node.subtree_start_ms = node.start_ms;
  node.subtree_end_ms = node.end_ms;

  for (const child of node.children) {
    compute_subtree_timing(child);
    if (child.subtree_start_ms < node.subtree_start_ms) {
      node.subtree_start_ms = child.subtree_start_ms;
    }
    if (child.subtree_end_ms > node.subtree_end_ms) {
      node.subtree_end_ms = child.subtree_end_ms;
    }
  }

  node.subtree_duration_ms = node.subtree_end_ms - node.subtree_start_ms;
}

function assign_depth(node: SpanNode, depth: number): void {
  node.depth = depth;
  for (const child of node.children) {
    assign_depth(child, depth + 1);
  }
}

// ─── Build assistant children from content blocks ──────────────────────────

function build_assistant_children(
  entry: SessionEntry,
  message: AssistantMessageData,
  start_ms: number,
  end_ms: number,
): SpanNode[] {
  const content = message.content;
  if (!content || !Array.isArray(content) || content.length === 0) return [];

  // If there's only one text block, don't create children — the assistant span itself is enough
  if (content.length === 1 && (content[0] as ContentBlock).type === "text") return [];

  const children: SpanNode[] = [];
  const block_duration = (end_ms - start_ms) / Math.max(content.length, 1);

  for (let i = 0; i < content.length; i++) {
    const block = content[i] as ContentBlock;
    const block_start = start_ms + i * block_duration;
    const block_end = start_ms + (i + 1) * block_duration;

    switch (block.type) {
      case "text":
        children.push({
          id: make_id(entry.id, `text-${i}`),
          label: "TEXT",
          kind: "text",
          start_ms: block_start,
          end_ms: block_end,
          subtree_start_ms: block_start,
          subtree_end_ms: block_end,
          duration_ms: block_end - block_start,
          subtree_duration_ms: block_end - block_start,
          color: KIND_COLORS.text,
          is_error: false,
          depth: 0,
          children: [],
          entry,
          content_index: i,
        });
        break;

      case "thinking":
        children.push({
          id: make_id(entry.id, `thinking-${i}`),
          label: "THINKING",
          kind: "thinking",
          start_ms: block_start,
          end_ms: block_end,
          subtree_start_ms: block_start,
          subtree_end_ms: block_end,
          duration_ms: block_end - block_start,
          subtree_duration_ms: block_end - block_start,
          color: KIND_COLORS.thinking,
          is_error: false,
          depth: 0,
          children: [],
          entry,
          content_index: i,
        });
        break;

      case "toolCall": {
        const tool_call = block as ToolCallContent;
        children.push({
          id: make_id(entry.id, `tool-${i}`),
          label: `tool: ${tool_call.name}`,
          kind: "tool_call",
          start_ms: block_start,
          end_ms: block_end,
          subtree_start_ms: block_start,
          subtree_end_ms: block_end,
          duration_ms: block_end - block_start,
          subtree_duration_ms: block_end - block_start,
          color: KIND_COLORS.tool_call,
          is_error: false,
          depth: 0,
          children: [],
          entry,
          content_index: i,
        });
        break;
      }

      case "image":
        children.push({
          id: make_id(entry.id, `image-${i}`),
          label: "IMAGE",
          kind: "text",
          start_ms: block_start,
          end_ms: block_end,
          subtree_start_ms: block_start,
          subtree_end_ms: block_end,
          duration_ms: block_end - block_start,
          subtree_duration_ms: block_end - block_start,
          color: KIND_COLORS.text,
          is_error: false,
          depth: 0,
          children: [],
          entry,
          content_index: i,
        });
        break;
    }
  }

  return children;
}

// ─── Find tool call child by toolCallId ────────────────────────────────────

function find_tool_call_child(assistant_node: SpanNode, tool_call_id: string): SpanNode | null {
  for (const child of assistant_node.children) {
    if (child.kind !== "tool_call" || child.content_index === undefined) continue;
    const msg = (child.entry as MessageEntry).message as AssistantMessageData;
    const content = msg.content;
    if (!content || !Array.isArray(content)) continue;
    const block = content[child.content_index] as ToolCallContent;
    if (block?.type === "toolCall" && block.id === tool_call_id) return child;
  }
  return null;
}

// ─── Main transform ─────────────────────────────────────────────────────────

export function build_span_tree(
  header: SessionHeader | null,
  entries: SessionEntry[],
): SpanTree {
  const session_start = header ? Date.parse(header.timestamp) : 0;
  const roots: SpanNode[] = [];

  let current_turn: SpanNode | null = null;
  let current_assistant: SpanNode | null = null;
  let model = "";
  let tool_count = 0;
  let error_count = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const start_ms = entry_timestamp_ms(entry, session_start, i);
    const next_ms = next_entry_ms(entries, i, session_start);
    const end_ms = next_ms !== null
      ? Math.max(next_ms, start_ms + MIN_SPAN_MS)
      : start_ms + 500;

    if (entry.type !== "message") {
      // Metadata entries go to root level
      const kind: SpanKind = entry.type === "custom" || entry.type === "custom_message" ? "custom" : "metadata";
      const label_map: Record<string, string> = {
        model_change: "MODEL CHANGE",
        thinking_level_change: "THINKING LEVEL",
        compaction: "COMPACTION",
        branch_summary: "BRANCH",
        label: "LABEL",
        session_info: "SESSION INFO",
        custom: (entry as { customType?: string }).customType ?? "CUSTOM",
        custom_message: (entry as { customType?: string }).customType ?? "CUSTOM",
      };

      if (entry.type === "model_change") {
        model = (entry as { modelId?: string }).modelId ?? model;
      }

      roots.push({
        id: make_id(entry.id),
        label: label_map[entry.type] ?? entry.type.toUpperCase(),
        kind,
        start_ms,
        end_ms: Math.min(end_ms, start_ms + MIN_SPAN_MS),
        subtree_start_ms: start_ms,
        subtree_end_ms: end_ms,
        duration_ms: Math.min(end_ms - start_ms, MIN_SPAN_MS),
        subtree_duration_ms: end_ms - start_ms,
        color: KIND_COLORS[kind],
        is_error: false,
        depth: 0,
        children: [],
        entry,
      });
      continue;
    }

    const msg_entry = entry as MessageEntry;
    const message = msg_entry.message;

    switch (message.role) {
      case "user": {
        // New conversation turn
        const node: SpanNode = {
          id: make_id(entry.id),
          label: "User prompt",
          kind: "user",
          start_ms,
          end_ms,
          subtree_start_ms: start_ms,
          subtree_end_ms: end_ms,
          duration_ms: end_ms - start_ms,
          subtree_duration_ms: end_ms - start_ms,
          color: KIND_COLORS.user,
          is_error: false,
          depth: 0,
          children: [],
          entry,
        };
        roots.push(node);
        current_turn = node;
        current_assistant = null;
        break;
      }

      case "assistant": {
        const assistant_msg = message as AssistantMessageData;
        if (assistant_msg.model && !model) model = assistant_msg.model;
        if (assistant_msg.errorMessage) error_count++;

        // Count tool calls
        if (assistant_msg.content && Array.isArray(assistant_msg.content)) {
          for (const block of assistant_msg.content) {
            if ((block as ContentBlock).type === "toolCall") tool_count++;
          }
        }

        const label = assistant_msg.errorMessage ? "Assistant (error)" : "Assistant";
        const node: SpanNode = {
          id: make_id(entry.id),
          label,
          kind: "assistant",
          start_ms,
          end_ms,
          subtree_start_ms: start_ms,
          subtree_end_ms: end_ms,
          duration_ms: end_ms - start_ms,
          subtree_duration_ms: end_ms - start_ms,
          color: KIND_COLORS.assistant,
          is_error: !!assistant_msg.errorMessage,
          depth: 0,
          children: build_assistant_children(entry, assistant_msg, start_ms, end_ms),
          entry,
        };

        if (current_turn) {
          current_turn.children.push(node);
        } else {
          // Assistant without a preceding user message — attach at root
          roots.push(node);
        }
        current_assistant = node;
        break;
      }

      case "toolResult": {
        const result_msg = message as { toolCallId?: string; toolName?: string; isError?: boolean };
        if (result_msg.isError) error_count++;

        // Try to pair with tool call child
        if (current_assistant && result_msg.toolCallId) {
          const tool_call_child = find_tool_call_child(current_assistant, result_msg.toolCallId);
          if (tool_call_child) {
            // Extend tool call span to cover the result — absorb result into the tool call
            tool_call_child.end_ms = Math.max(end_ms, tool_call_child.start_ms + MIN_SPAN_MS);
            tool_call_child.duration_ms = tool_call_child.end_ms - tool_call_child.start_ms;
            tool_call_child.result_entry = entry;
            if (tool_call_child.is_error === false && result_msg.isError) {
              tool_call_child.is_error = true;
            }
            break;
          }
        }

        // Unmatched tool result — attach to current assistant or root
        const fallback_node: SpanNode = {
          id: make_id(entry.id),
          label: `result: ${result_msg.toolName ?? "unknown"}`,
          kind: "tool_result",
          start_ms,
          end_ms,
          subtree_start_ms: start_ms,
          subtree_end_ms: end_ms,
          duration_ms: end_ms - start_ms,
          subtree_duration_ms: end_ms - start_ms,
          color: KIND_COLORS.tool_result,
          is_error: !!result_msg.isError,
          depth: 0,
          children: [],
          entry,
        };

        if (current_assistant) {
          current_assistant.children.push(fallback_node);
        } else if (current_turn) {
          current_turn.children.push(fallback_node);
        } else {
          roots.push(fallback_node);
        }
        break;
      }

      case "bashExecution": {
        const bash_msg = message as { exitCode?: number };
        const is_error = bash_msg.exitCode !== 0 && bash_msg.exitCode !== undefined;
        if (is_error) error_count++;
        tool_count++;

        const node: SpanNode = {
          id: make_id(entry.id),
          label: "BASH",
          kind: "bash",
          start_ms,
          end_ms,
          subtree_start_ms: start_ms,
          subtree_end_ms: end_ms,
          duration_ms: end_ms - start_ms,
          subtree_duration_ms: end_ms - start_ms,
          color: KIND_COLORS.bash,
          is_error,
          depth: 0,
          children: [],
          entry,
        };

        if (current_assistant) {
          current_assistant.children.push(node);
        } else if (current_turn) {
          current_turn.children.push(node);
        } else {
          roots.push(node);
        }
        break;
      }

      case "custom": {
        const custom_msg = message as { customType?: string };
        const node: SpanNode = {
          id: make_id(entry.id),
          label: custom_msg.customType ?? "CUSTOM",
          kind: "custom",
          start_ms,
          end_ms,
          subtree_start_ms: start_ms,
          subtree_end_ms: end_ms,
          duration_ms: end_ms - start_ms,
          subtree_duration_ms: end_ms - start_ms,
          color: KIND_COLORS.custom,
          is_error: false,
          depth: 0,
          children: [],
          entry,
        };

        if (current_turn) {
          current_turn.children.push(node);
        } else {
          roots.push(node);
        }
        break;
      }
    }
  }

  // Compute subtree timing and depth
  for (const root of roots) {
    compute_subtree_timing(root);
    assign_depth(root, 0);
  }

  // Compute total duration
  let max_end = 0;
  for (const root of roots) {
    if (root.subtree_end_ms > max_end) max_end = root.subtree_end_ms;
  }

  return {
    roots,
    total_duration_ms: Math.max(max_end, 1000),
    session_start_iso: header?.timestamp ?? "",
    stats: {
      event_count: entries.length,
      tool_count,
      error_count,
      model,
    },
  };
}

// ─── Flatten tree for rendering ─────────────────────────────────────────────

export function flatten_span_tree(
  roots: SpanNode[],
  expanded: Set<string>,
): import("./types").VisibleRow[] {
  const rows: import("./types").VisibleRow[] = [];

  function walk(node: SpanNode) {
    const has_children = node.children.length > 0;
    const is_expanded = expanded.has(node.id);

    rows.push({
      node,
      depth: node.depth,
      is_expanded,
      has_children,
    });

    if (has_children && is_expanded) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return rows;
}

// ─── Collect all node IDs (for expand-all) ──────────────────────────────────

export function collect_all_ids(roots: SpanNode[]): Set<string> {
  const ids = new Set<string>();

  function walk(node: SpanNode) {
    if (node.children.length > 0) {
      ids.add(node.id);
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return ids;
}

// ─── Format duration ────────────────────────────────────────────────────────

export function format_duration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const total_seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(total_seconds / 60);
  const seconds = total_seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
