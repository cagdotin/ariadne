import { useEffect, useRef, useState } from "react";
import { Outlet, useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { use_project_scope } from "@/components/project-scope-provider";
import { get_session_entries, get_session_detail } from "@/api/analytics";
import type { SessionHeader, SessionEntry } from "@/components/session-viewer/types";
import type { SessionEntriesResponse } from "@/components/session-viewer/types";
import type { SessionSummary } from "@contracts/sessions/summary";
import { SessionDetailProvider } from "./session-detail-context";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
import { error_message } from "@/lib/utils";
import { SessionDetailNavHeader } from "@/components/sessions/session-detail-nav-header";
import { SessionPanelNav } from "@/components/sessions/session-panel-nav";

export function SessionDetailLayout() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { scope } = use_project_scope();
  const navigate = useNavigate();
  const location = useLocation();

  const [header, set_header] = useState<SessionHeader | null>(null);
  const [entries, set_entries] = useState<SessionEntry[]>([]);
  const [leaf_id, set_leaf_id] = useState<string | null>(null);
  const [session_summary, set_session_summary] = useState<SessionSummary | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [ready, set_ready] = useState(false);

  const has_loaded = useRef(false);

  // Combined scope guard + data fetch — single effect avoids double get_session_detail call
  useEffect(() => {
    let cancelled = false;
    set_ready(false);

    const load = async () => {
      try {
        if (!has_loaded.current) set_loading(true);
        set_error(null);

        // Fetch summary and entries in parallel (independent requests)
        const [summary, entries_data] = await Promise.all([
          get_session_detail(id).catch(() => null),
          get_session_entries(id),
        ]);
        if (cancelled) return;

        // Scope guard: if scoped to a project, verify this session belongs to it
        if (scope && summary && summary.project_path !== scope.project_path) {
          navigate({ to: "/sessions" });
          return;
        }

        const response = entries_data as SessionEntriesResponse;
        set_header((response.header as SessionHeader) ?? null);
        set_entries(response.entries as SessionEntry[]);
        set_leaf_id(response.leaf_id);
        set_session_summary(summary);
        set_ready(true);
        has_loaded.current = true;
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load session"));
        set_ready(true);
      } finally {
        if (!cancelled) set_loading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id, scope, navigate]);

  const is_traces = location.pathname.endsWith("/traces");

  if (!ready) return null;

  return (
    <SessionDetailProvider
      value={{ header, entries, leaf_id, session_summary, loading, error }}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <SessionDetailNavHeader
          right={
            is_traces ? undefined : (
              <SessionPanelNav
                has_analytics={!!session_summary}
                variant="conversation"
                disabled_panels={[]}
              />
            )
          }
        >
          {is_traces ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={() => navigate({ to: `/sessions/${id}/conversation` })}
            >
              <ArrowLeft data-icon="inline-start" />
              Conversation
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={() => navigate({ to: `/sessions/${id}/traces` })}
            >
              <Activity data-icon="inline-start" />
              Traces
            </Button>
          )}
        </SessionDetailNavHeader>
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </SessionDetailProvider>
  );
}
