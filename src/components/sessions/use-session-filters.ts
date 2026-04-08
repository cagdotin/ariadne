import { useState, useMemo, useCallback } from "react";
import type { SessionSummary } from "@contracts/sessions/summary";

export interface SessionFilters {
  search: string;
  tools: Set<string>;
  models: Set<string>;
}

export function use_session_filters(sessions: SessionSummary[]) {
  const [search, set_search] = useState("");
  const [selected_tools, set_selected_tools] = useState<Set<string>>(new Set());
  const [selected_models, set_selected_models] = useState<Set<string>>(new Set());

  /** All unique tool names across every session, sorted by frequency. */
  const available_tools = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      for (const tool_name of Object.keys(s.tool_calls)) {
        counts.set(tool_name, (counts.get(tool_name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [sessions]);

  /** All unique model IDs across every session, sorted by frequency. */
  const available_models = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      for (const m of s.models_used) {
        counts.set(m.model_id, (counts.get(m.model_id) ?? 0) + m.message_count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [sessions]);

  const toggle_tool = useCallback((tool: string) => {
    set_selected_tools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }, []);

  const toggle_model = useCallback((model: string) => {
    set_selected_models((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }, []);

  const clear_all = useCallback(() => {
    set_search("");
    set_selected_tools(new Set());
    set_selected_models(new Set());
  }, []);

  const has_active_filters = search.length > 0 || selected_tools.size > 0 || selected_models.size > 0;

  /** Client-side filtered sessions. */
  const filtered_sessions = useMemo(() => {
    let result = sessions;

    // Text search across id, title, project_name, first_user_message
    if (search.length > 0) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const haystack = [
          s.id,
          s.title,
          s.project_name,
          s.first_user_message,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Tool filter: session must have used at least one of the selected tools
    if (selected_tools.size > 0) {
      result = result.filter((s) => {
        const session_tools = Object.keys(s.tool_calls);
        return session_tools.some((t) => selected_tools.has(t));
      });
    }

    // Model filter: session must have used at least one of the selected models
    if (selected_models.size > 0) {
      result = result.filter((s) => {
        return s.models_used.some((m) => selected_models.has(m.model_id));
      });
    }

    return result;
  }, [sessions, search, selected_tools, selected_models]);

  return {
    search,
    set_search,
    selected_tools,
    selected_models,
    available_tools,
    available_models,
    toggle_tool,
    toggle_model,
    clear_all,
    has_active_filters,
    filtered_sessions,
  };
}
