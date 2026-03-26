import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { SessionHeader, SessionEntry, ToolResultMessage } from "./types";
import { get_path, build_tool_result_map } from "./utils";
import { SessionDetailHeader } from "./session-detail-header";
import { SessionTree } from "./session-tree";
import { MessageRenderer } from "./message-renderer";
import { PanelRightClose, PanelRight } from "lucide-react";

interface SessionViewerProps {
  header: SessionHeader | null;
  entries: SessionEntry[];
  initial_leaf_id: string | null;
}

export function SessionViewer({ header, entries, initial_leaf_id }: SessionViewerProps) {
  const [leaf_id, set_leaf_id] = useState<string>(
    initial_leaf_id ?? (entries.length > 0 ? entries[entries.length - 1].id : "")
  );
  const [scroll_target, set_scroll_target] = useState<string | null>(null);
  const [tree_open, set_tree_open] = useState(true);
  const messages_ref = useRef<HTMLDivElement>(null);

  const tool_result_map: Map<string, ToolResultMessage> = useMemo(
    () => build_tool_result_map(entries),
    [entries]
  );

  const path = useMemo(() => get_path(entries, leaf_id), [entries, leaf_id]);

  const handle_navigate = useCallback(
    (new_leaf_id: string, scroll_to_id?: string) => {
      set_leaf_id(new_leaf_id);
      set_scroll_target(scroll_to_id ?? null);
    },
    []
  );

  // Scroll to target after render
  useEffect(() => {
    if (!scroll_target) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`entry-${scroll_target}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary/50", "ring-offset-1");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary/50", "ring-offset-1");
        }, 2000);
      }
      set_scroll_target(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [scroll_target, path]);

  return (
    <div className="flex h-full min-h-0">
      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto" ref={messages_ref}>
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          {/* Toggle tree button when collapsed */}
          {!tree_open && (
            <button
              onClick={() => set_tree_open(true)}
              className="fixed right-4 top-14 z-10 rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground shadow-md transition-colors"
              title="Open tree"
            >
              <PanelRight className="size-4" />
            </button>
          )}

          <SessionDetailHeader header={header} entries={entries} />

          <div className="space-y-3">
            {path.map((entry) => (
              <div key={entry.id} id={`entry-${entry.id}`} className="transition-shadow duration-500 rounded-lg">
                <MessageRenderer
                  entry={entry}
                  tool_result_map={tool_result_map}
                />
              </div>
            ))}
          </div>

          {path.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No entries in this session path.
            </div>
          )}
        </div>
      </main>

      {/* Tree sidebar — right side */}
      {tree_open && (
        <aside className="w-80 min-w-[280px] max-w-[400px] shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-2 pb-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Session Tree
            </span>
            <button
              onClick={() => set_tree_open(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Close tree"
            >
              <PanelRightClose className="size-3.5" />
            </button>
          </div>
          <SessionTree
            entries={entries}
            leaf_id={leaf_id}
            on_navigate={handle_navigate}
          />
        </aside>
      )}
    </div>
  );
}
