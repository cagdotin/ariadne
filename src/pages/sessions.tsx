import { useState, useEffect } from "react";
import type { SessionSummary } from "@/schemas/session";
import type { ProjectSummary } from "@/schemas/analytics";
import { get_all_sessions, get_analytics_overview } from "@/api/analytics";
import { DataTable } from "@/components/data-table";
import { session_columns, session_columns_with_project } from "@/components/columns/session-columns";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function Sessions() {
  const [sessions, set_sessions] = useState<SessionSummary[]>([]);
  const [projects, set_projects] = useState<ProjectSummary[]>([]);
  const [selected_project, set_selected_project] = useState<string>("");
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    get_analytics_overview().then(o => set_projects(o.projects)).catch(console.error);
  }, []);

  useEffect(() => {
    const fetch_sessions = async () => {
      try {
        set_loading(true);
        set_error(null);
        const data = await get_all_sessions(selected_project || undefined);
        set_sessions(data);
      } catch (err) {
        set_error(error_message(err, "Failed to load sessions"));
      } finally {
        set_loading(false);
      }
    };
    fetch_sessions();
  }, [selected_project]);

  if (error) {
    return (
      <div className="min-w-0 w-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-4">
      <div className="flex items-center justify-end gap-4">
        <select
          value={selected_project}
          onChange={(e) => set_selected_project(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground min-w-[180px]"
        >
          <option value="">All Projects</option>
          {projects.sort((a, b) => b.session_count - a.session_count).map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={selected_project ? session_columns : session_columns_with_project}
          data={sessions}
          filter_column="title"
          filter_placeholder="Search sessions..."
        />
      )}
    </div>
  );
}
