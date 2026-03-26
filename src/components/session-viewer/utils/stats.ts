import type { SessionEntry, SessionStats, MessageEntry } from "../types";

export function compute_stats(entries: SessionEntry[]): SessionStats {
  const stats: SessionStats = {
    user_messages: 0,
    assistant_messages: 0,
    tool_results: 0,
    custom_messages: 0,
    compactions: 0,
    branch_summaries: 0,
    tool_calls: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    models: [],
  };

  const model_set = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = (entry as MessageEntry).message;
      if (msg.role === "user") stats.user_messages++;
      if (msg.role === "assistant") {
        stats.assistant_messages++;
        if (msg.model)
          model_set.add(msg.provider ? `${msg.provider}/${msg.model}` : msg.model);
        if (msg.usage) {
          stats.tokens.input += msg.usage.input ?? 0;
          stats.tokens.output += msg.usage.output ?? 0;
          stats.tokens.cache_read += msg.usage.cacheRead ?? 0;
          stats.tokens.cache_write += msg.usage.cacheWrite ?? 0;
          if (msg.usage.cost) {
            stats.cost.input += msg.usage.cost.input ?? 0;
            stats.cost.output += msg.usage.cost.output ?? 0;
            stats.cost.cache_read += msg.usage.cost.cacheRead ?? 0;
            stats.cost.cache_write += msg.usage.cost.cacheWrite ?? 0;
          }
        }
        stats.tool_calls += msg.content.filter((c) => c.type === "toolCall").length;
      }
      if (msg.role === "toolResult") stats.tool_results++;
    } else if (entry.type === "compaction") {
      stats.compactions++;
    } else if (entry.type === "branch_summary") {
      stats.branch_summaries++;
    } else if (entry.type === "custom_message") {
      stats.custom_messages++;
    }
  }

  stats.models = Array.from(model_set);
  return stats;
}
