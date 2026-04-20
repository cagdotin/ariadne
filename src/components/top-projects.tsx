import type { ProjectSummary } from "@contracts/shared";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format_cost, format_date_relative, format_number } from "@/lib/format";
import { use_project_scope } from "./project-scope-provider";

interface TopProjectsProps {
  projects: ProjectSummary[];
}

export function TopProjects({ projects }: TopProjectsProps) {
  const { set_scope } = use_project_scope();

  const top = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.session_count - a.session_count)
        .slice(0, 4),
    [projects],
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-3 mt-6 mb-4">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Most active projects
        </span>
        <Separator className="flex-1" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((project) => (
          <Card
            key={project.path}
            size="sm"
            className="cursor-pointer gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
            onClick={() =>
              set_scope({
                project_path: project.path,
                project_name: project.name,
              })
            }
          >
            <div className="flex items-start justify-between gap-3 text-xs">
              <p className="min-w-0 truncate font-medium text-foreground">
                {project.name}
              </p>
              <p className="shrink-0 text-muted-foreground text-[0.9em]">
                {format_date_relative(project.last_active)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="text-muted-foreground">
                {format_number(project.session_count)} sessions
              </p>
              <p className="font-mono text-foreground tabular-nums">
                {format_cost(project.total_cost)}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
