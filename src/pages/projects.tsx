import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectSummary } from "../schemas/analytics";
import { get_analytics_overview } from "../api/analytics";
import { DataTable } from "@/components/data-table";
import { project_columns } from "@/components/columns/project-columns";
import { Skeleton } from "@/components/ui/skeleton";

export function Projects() {
  const [projects, set_projects] = useState<ProjectSummary[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const overview = await get_analytics_overview();
        set_projects(overview.projects);
      } catch (err) {
        set_error(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        set_loading(false);
      }
    };
    fetch_data();
  }, []);

  const handle_project_click = (project: ProjectSummary) => {
    navigate({ to: `/projects/${encodeURIComponent(project.name)}` });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/20 border border-destructive p-4 text-destructive">
        Error: {error}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-foreground mb-6">Projects</h1>
        <p className="text-muted-foreground">No projects found.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Projects</h1>
      <DataTable
        columns={project_columns}
        data={projects}
        filter_column="name"
        filter_placeholder="Search projects..."
        on_row_click={handle_project_click}
      />
    </div>
  );
}
