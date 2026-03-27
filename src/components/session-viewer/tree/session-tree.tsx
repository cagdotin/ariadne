import { useState, useMemo, useRef, useEffect } from "react";
import type { SessionEntry, MessageEntry } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SessionTreeNode } from "./session-tree-node";
import {
  build_tree,
  flatten_tree,
  build_active_path_ids,
  build_label_map,
  build_tool_call_map,
  has_text_content,
  extract_text,
} from "../utils";
import { Search, X } from "lucide-react";

type FilterMode = "default" | "no-tools" | "user-only" | "labeled-only" | "all";

interface SessionTreeProps {
  entries: SessionEntry[];
  leaf_id: string;
  on_navigate: (leaf_id: string, scroll_to_id?: string) => void;
}

const FILTER_BUTTONS: { mode: FilterMode; label: string; title: string }[] = [
  { mode: "default", label: "Default", title: "Hide settings entries" },
  { mode: "no-tools", label: "No-tools", title: "Default minus tool results" },
  { mode: "user-only", label: "User", title: "Only user messages" },
  { mode: "labeled-only", label: "Labeled", title: "Only labeled entries" },
  { mode: "all", label: "All", title: "Show everything" },
];

export function SessionTree({ entries, leaf_id, on_navigate }: SessionTreeProps) {
  const [filter_mode, set_filter_mode] = useState<FilterMode>("default");
  const [search_query, set_search_query] = useState("");
  const active_ref = useRef<HTMLDivElement>(null);

  const label_map = useMemo(() => build_label_map(entries), [entries]);
  const tool_call_map = useMemo(() => build_tool_call_map(entries), [entries]);
  const active_path_ids = useMemo(
    () => build_active_path_ids(entries, leaf_id),
    [entries, leaf_id]
  );

  const flat_nodes = useMemo(() => {
    const tree = build_tree(entries, label_map);
    return flatten_tree(tree, active_path_ids);
  }, [entries, label_map, active_path_ids]);

  const filtered = useMemo(() => {
    const search_tokens = search_query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return flat_nodes.filter((fn) => {
      const entry = fn.node.entry;
      const label = fn.node.label;
      const is_current_leaf = entry.id === leaf_id;
      if (is_current_leaf) return true;

      // Hide assistant messages with only tool calls
      if (entry.type === "message" && (entry as MessageEntry).message.role === "assistant") {
        const msg = (entry as MessageEntry).message;
        if (msg.role === "assistant") {
          const has_text = has_text_content(msg.content);
          const stop = "stopReason" in msg ? msg.stopReason : undefined;
          const is_error_or_aborted = stop && stop !== "stop" && stop !== "toolUse";
          if (!has_text && !is_error_or_aborted) return false;
        }
      }

      // Filter mode
      const is_settings = ["label", "custom", "model_change", "thinking_level_change"].includes(entry.type);
      let passes = true;
      switch (filter_mode) {
        case "user-only":
          passes = entry.type === "message" && (entry as MessageEntry).message.role === "user";
          break;
        case "no-tools":
          passes = !is_settings && !(entry.type === "message" && (entry as MessageEntry).message.role === "toolResult");
          break;
        case "labeled-only":
          passes = label !== undefined;
          break;
        case "all":
          passes = true;
          break;
        default:
          passes = !is_settings;
          break;
      }
      if (!passes) return false;

      // Search
      if (search_tokens.length > 0) {
        const parts: string[] = [];
        if (label) parts.push(label);
        if (entry.type === "message") {
          const msg = (entry as MessageEntry).message;
          parts.push(msg.role);
          if ("content" in msg) parts.push(extract_text(msg.content as unknown as string | import("../types").ContentBlock[]));
          if (msg.role === "bashExecution" && "command" in msg) parts.push(String(msg.command));
        }
        const text = parts.join(" ").toLowerCase();
        if (!search_tokens.every((t) => text.includes(t))) return false;
      }

      return true;
    });
  }, [flat_nodes, filter_mode, search_query, leaf_id]);

  // Scroll active into view
  useEffect(() => {
    const timer = setTimeout(() => {
      active_ref.current?.scrollIntoView({ block: "nearest" });
    }, 50);
    return () => clearTimeout(timer);
  }, [leaf_id]);

  const handle_click = (node_id: string) => {
    // Find newest leaf through this node for full-branch navigation
    const children_map = new Map<string, SessionEntry[]>();
    for (const e of entries) {
      if (e.parentId) {
        const arr = children_map.get(e.parentId) ?? [];
        arr.push(e);
        children_map.set(e.parentId, arr);
      }
    }
    let current = node_id;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const kids = children_map.get(current);
      if (!kids || kids.length === 0) break;
      kids.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      current = kids[kids.length - 1].id;
    }
    on_navigate(current, node_id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
            placeholder="Search…"
            className="w-full bg-input border border-border rounded-md pl-7 pr-7 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search_query && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => set_search_query("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {FILTER_BUTTONS.map((fb) => (
          <Badge
            key={fb.mode}
            variant={filter_mode === fb.mode ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => set_filter_mode(fb.mode)}
          >
            {fb.label}
          </Badge>
        ))}
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((fn) => {
          const is_on_path = active_path_ids.has(fn.node.entry.id);
          const is_active = fn.node.entry.id === leaf_id;
          return (
            <div
              key={fn.node.entry.id}
              ref={is_active ? active_ref : undefined}
            >
              <SessionTreeNode
                flat_node={fn}
                is_active={is_active}
                is_on_path={is_on_path}
                tool_call_map={tool_call_map}
                on_click={() => handle_click(fn.node.entry.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Status */}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
        {filtered.length} / {flat_nodes.length} entries
      </div>
    </div>
  );
}
