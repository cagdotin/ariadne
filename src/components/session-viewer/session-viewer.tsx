import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { SessionHeader, SessionEntry, ToolResultMessage } from "./types";
import type { SessionSummary } from "@contracts/sessions/summary";
import { get_path, build_tool_result_map } from "./utils";
import { SessionTree } from "./tree/session-tree";
import { SessionSidebarDetails } from "./sidebar/session-sidebar-details";
import { SessionSidebarAnalytics } from "./sidebar/session-sidebar-analytics";
import { MessageRenderer } from "./conversation/message-renderer";
import { use_session_panel } from "@/components/sessions/use-session-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface SessionViewerProps {
  header: SessionHeader | null;
  entries: SessionEntry[];
  initial_leaf_id: string | null;
  session_summary?: SessionSummary | null;
}

export function SessionViewer({
  header,
  entries,
  initial_leaf_id,
  session_summary,
}: SessionViewerProps) {
  const [leaf_id, set_leaf_id] = useState<string>(
    initial_leaf_id ??
      (entries.length > 0 ? entries[entries.length - 1].id : ""),
  );
  const [scroll_target, set_scroll_target] = useState<string | null>(null);
  const { panel } = use_session_panel();
  const messages_ref = useRef<HTMLDivElement>(null);

  const tool_result_map: Map<string, ToolResultMessage> = useMemo(
    () => build_tool_result_map(entries),
    [entries],
  );

  const path = useMemo(() => get_path(entries, leaf_id), [entries, leaf_id]);

  const handle_navigate = useCallback(
    (new_leaf_id: string, scroll_to_id?: string) => {
      set_leaf_id(new_leaf_id);
      set_scroll_target(scroll_to_id ?? null);
    },
    [],
  );

  // Scroll to target after render
  useEffect(() => {
    if (!scroll_target) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`entry-${scroll_target}`);
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "center" });
      }
      set_scroll_target(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [scroll_target, path]);

  return (
    <div className="h-full min-h-0 w-full">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0">
        {/* Main content */}
        <ResizablePanel minSize="40%" className="min-w-0">
          <main
            className="h-full min-w-0 overflow-x-hidden overflow-y-auto"
            ref={messages_ref}
          >
            <div className="flex flex-col gap-3 max-w-3xl mx-auto px-6 py-5">
              <div className="flex flex-col gap-3">
                {path.map((entry) => (
                  <div
                    key={entry.id}
                    id={`entry-${entry.id}`}
                    className="min-w-0"
                  >
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
        </ResizablePanel>

        {panel && (
          <>
            <ResizableHandle />

            {/* Sidebar — driven by ?panel= search param */}
            <ResizablePanel
              defaultSize="40%"
              minSize="40%"
              maxSize="50%"
              className="min-w-0"
            >
              <aside className="flex h-full min-w-0 flex-col overflow-hidden">
                {panel === "tree" && (
                  <SessionTree
                    entries={entries}
                    leaf_id={leaf_id}
                    on_navigate={handle_navigate}
                  />
                )}
                {panel === "details" && (
                  <SessionSidebarDetails header={header} entries={entries} />
                )}
                {panel === "analytics" && session_summary && (
                  <SessionSidebarAnalytics session={session_summary} />
                )}
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
