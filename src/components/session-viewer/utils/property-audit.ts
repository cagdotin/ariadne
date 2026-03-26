import type { SessionEntry } from "../types";

/** Known base keys present on every entry */
const BASE_KEYS = new Set(["type", "id", "parentId", "timestamp"]);

/** Keys rendered per entry type */
const RENDERED_KEYS: Record<string, Set<string>> = {
  message: new Set([...BASE_KEYS, "message"]),
  compaction: new Set([...BASE_KEYS, "summary", "firstKeptEntryId", "tokensBefore", "details", "fromHook"]),
  branch_summary: new Set([...BASE_KEYS, "fromId", "summary", "details", "fromHook"]),
  model_change: new Set([...BASE_KEYS, "provider", "modelId"]),
  thinking_level_change: new Set([...BASE_KEYS, "thinkingLevel"]),
  custom_message: new Set([...BASE_KEYS, "customType", "content", "details", "display"]),
  custom: new Set([...BASE_KEYS, "customType", "data"]),
  label: new Set([...BASE_KEYS, "targetId", "label"]),
  session_info: new Set([...BASE_KEYS, "name"]),
};

export function get_unrendered_properties(entry: SessionEntry): { key: string; value: unknown }[] {
  const rendered = RENDERED_KEYS[entry.type] ?? BASE_KEYS;
  const unrendered: { key: string; value: unknown }[] = [];
  for (const key of Object.keys(entry)) {
    if (!rendered.has(key)) {
      unrendered.push({ key, value: (entry as Record<string, unknown>)[key] });
    }
  }
  return unrendered;
}
