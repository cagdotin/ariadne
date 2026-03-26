import { useState, useEffect } from "react";
import type { SessionSummary } from "@/schemas/session";
import { get_all_sessions } from "@/api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { DataTable } from "@/components/data-table";
import { session_columns, session_columns_with_project } from "@/components/columns/session-columns";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function Sessions() {
  const { scope } = use_project_scope();
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
        const data = await get_all_sessions(project_path);
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
  }, [project_path]);

  if (error) {
    return (
      <div className="min-w-0 w-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-4">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={scope ? session_columns : session_columns_with_project}
          data={sessions}
          filter_column="title"
          filter_placeholder="Search sessions..."
        />
      )}
    </div>
  );
}
