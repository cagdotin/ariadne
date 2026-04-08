import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { SessionHeader, SessionEntry, ToolResultMessage } from "./types";
import type { SessionSummary } from "@contracts/sessions/summary";
import { get_path, build_tool_result_map } from "./utils";
import { SessionTree } from "./tree/session-tree";
import { SessionSidebarDetails } from "./sidebar/session-sidebar-details";
import { SessionSidebarAnalytics } from "./sidebar/session-sidebar-analytics";
import { MessageRenderer } from "./conversation/message-renderer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  PanelRightClose,
  PanelRight,
  GitBranch,
  Info,
  BarChart3,
} from "lucide-react";

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
  const [sidebar_open, set_sidebar_open] = useState(true);
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
    <div className="relative flex h-full min-h-0">
      {/* Sidebar toggle — absolute so it stays in the same spot regardless of sidebar state */}
      <div className="absolute right-4 top-0.5  z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => set_sidebar_open((v) => !v)}
          title={sidebar_open ? "Close sidebar" : "Open sidebar"}
        >
          {sidebar_open ? (
            <PanelRightClose className="size-3.5" />
          ) : (
            <PanelRight className="size-3.5" />
          )}
        </Button>
      </div>

      {/* Main content */}
      <main
        className="flex-1 min-w-0 overflow-y-auto"
        ref={messages_ref}
      >
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-3">
          <div className="space-y-3">
            {path.map((entry) => (
              <div
                key={entry.id}
                id={`entry-${entry.id}`}
                className="transition-shadow duration-500 rounded-lg"
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

      {/* Tabbed sidebar — right side */}
      {sidebar_open && (
        <aside className="w-[340px] min-w-[320px] max-w-[420px] shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <Tabs defaultValue="tree" className="flex flex-col h-full gap-0">
            {/* Tab header — pr-10 reserves space for the absolute toggle button */}
            <div className="flex items-center px-2 pr-10 border-b border-border shrink-0">
              <TabsList variant="line">
                <TabsTrigger value="tree">
                  <GitBranch className="size-3" />
                  Tree
                </TabsTrigger>
                <TabsTrigger value="details">
                  <Info className="size-3" />
                  Details
                </TabsTrigger>
                {session_summary && (
                  <TabsTrigger value="analytics">
                    <BarChart3 className="size-3" />
                    Analytics
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Tree tab */}
            <TabsContent
              value="tree"
              keepMounted
              className="flex-1 min-h-0 overflow-hidden m-0 data-[hidden]:hidden"
            >
              <SessionTree
                entries={entries}
                leaf_id={leaf_id}
                on_navigate={handle_navigate}
              />
            </TabsContent>

            {/* Details tab */}
            <TabsContent
              value="details"
              keepMounted
              className="flex-1 min-h-0 overflow-hidden m-0 data-[hidden]:hidden"
            >
              <SessionSidebarDetails header={header} entries={entries} />
            </TabsContent>

            {/* Analytics tab */}
            {session_summary && (
              <TabsContent
                value="analytics"
                keepMounted
                className="flex-1 min-h-0 overflow-hidden m-0 data-[hidden]:hidden"
              >
                <SessionSidebarAnalytics session={session_summary} />
              </TabsContent>
            )}
          </Tabs>
        </aside>
      )}
    </div>
  );
}
