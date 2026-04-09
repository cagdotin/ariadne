import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SessionSummary } from "@contracts/sessions/summary";
import { get_all_sessions } from "@/api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { DataTable } from "@/components/data-table";
import {
  session_columns,
  session_columns_with_project,
  SessionToolbar,
  use_session_filters,
  use_responsive_columns,
} from "@/components/sessions";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function Sessions() {
  const navigate = useNavigate();
  const { scope } = use_project_scope();
  const { range_days } = use_analytics_time_range();
  const project_path = scope?.project_path;

  const [sessions, set_sessions] = useState<SessionSummary[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_sessions = async () => {
      try {
        set_loading(true);
        set_error(null);
        const data = await get_all_sessions(project_path, range_days);
        if (cancelled) return;
        set_sessions(data);
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load sessions"));
      } finally {
        if (!cancelled) set_loading(false);
      }
    };
    fetch_sessions();
    return () => { cancelled = true; };
  }, [project_path, range_days]);

  const {
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
  } = use_session_filters(sessions);

  const column_visibility = use_responsive_columns();
  const columns = scope ? session_columns : session_columns_with_project;

  if (error) {
    return (
      <div className="min-w-0 w-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  const handle_row_click = useCallback(
    (session: SessionSummary) => {
      navigate({ to: "/sessions/$id", params: { id: session.id } });
    },
    [navigate],
  );

  return (
    <div className="flex flex-col gap-4 min-w-0 w-full">
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered_sessions}
          column_visibility={column_visibility}
          on_row_click={handle_row_click}
          toolbar={() => (
            <SessionToolbar
              search={search}
              on_search_change={set_search}
              available_tools={available_tools}
              selected_tools={selected_tools}
              on_toggle_tool={toggle_tool}
              available_models={available_models}
              selected_models={selected_models}
              on_toggle_model={toggle_model}
              has_active_filters={has_active_filters}
              on_clear_all={clear_all}
              total_count={sessions.length}
              filtered_count={filtered_sessions.length}
            />
          )}
        />
      )}
    </div>
  );
}
