import { useEffect, useRef, useState } from "react";
import { Outlet, useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { use_project_scope } from "@/components/project-scope-provider";
import { get_session_entries, get_session_detail } from "@/api/analytics";
import type { SessionHeader, SessionEntry } from "@/components/session-viewer/types";
import type { SessionEntriesResponse } from "@/components/session-viewer/types";
import type { SessionSummary } from "@contracts/sessions/summary";
import { SessionDetailProvider } from "./session-detail-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Activity } from "lucide-react";
import { error_message } from "@/lib/utils";

function SessionDetailNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id: string };

  const tabs = [
    { to: `/sessions/${id}/conversation`, label: "Conversation", icon: MessageSquare },
    { to: `/sessions/${id}/traces`, label: "Traces", icon: Activity },
  ];

  const active_tab =
    tabs.find((tab) => location.pathname === tab.to)?.to ?? tabs[0].to;

  return (
    <Tabs
      value={active_tab}
      onValueChange={(value) => navigate({ to: value })}
    >
      <TabsList>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.to} value={tab.to}>
              <Icon className="size-3.5" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function SessionDetailLayout() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { scope } = use_project_scope();
  const navigate = useNavigate();

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

        // Fetch summary first for scope check (also reused as session_summary)
        const summary = await get_session_detail(id).catch(() => null);
        if (cancelled) return;

        // Scope guard: if scoped to a project, verify this session belongs to it
        if (scope && summary && summary.project_path !== scope.project_path) {
          navigate({ to: "/sessions" });
          return;
        }

        // Fetch entries
        const entries_data = await get_session_entries(id);
        if (cancelled) return;

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

  if (!ready) return null;

  return (
    <SessionDetailProvider
      value={{ header, entries, leaf_id, session_summary, loading, error }}
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-4 px-4 shrink-0">
          <SessionDetailNav />
        </div>
        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </div>
    </SessionDetailProvider>
  );
}
