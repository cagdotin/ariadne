import type {
  SessionEntry,
  MessageEntry,
  ToolResultMessage,
  LabelEntry,
} from "../types";

export function build_tool_result_map(
  entries: SessionEntry[]
): Map<string, ToolResultMessage> {
  const map = new Map<string, ToolResultMessage>();
  for (const entry of entries) {
    if (
      entry.type === "message" &&
      (entry as MessageEntry).message.role === "toolResult"
    ) {
      const msg = (entry as MessageEntry).message as ToolResultMessage;
      if (msg.toolCallId) {
        map.set(msg.toolCallId, msg);
      }
    }
  }
  return map;
}

export function build_tool_call_map(
  entries: SessionEntry[]
): Map<string, { name: string; arguments: Record<string, unknown> }> {
  const map = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = (entry as MessageEntry).message;
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "toolCall") {
            map.set(block.id, { name: block.name, arguments: block.arguments });
          }
        }
      }
    }
  }
  return map;
}

export function build_label_map(entries: SessionEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "label") {
      const le = entry as LabelEntry;
      if (le.targetId && le.label) {
        map.set(le.targetId, le.label);
      }
    }
  }
  return map;
}
