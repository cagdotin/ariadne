import { useCallback } from "react";
import type { ProjectSummary } from "@/schemas/analytics";
import { format_number } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import type { ProjectGroup } from "./types";
import { ProjectScopeItem } from "./project-scope-item";
import { ProjectScopeEmpty } from "./project-scope-empty";
import { get_project_meta, get_project_subtitle } from "./utils";

interface ProjectScopeListProps {
  scope: { project_path: string } | null;
  selected_project: ProjectSummary | null;
  project_groups: ProjectGroup[];
  total_count: number;
  has_query: boolean;
  select_all: () => void;
  select_project: (project: ProjectSummary) => void;
}

export function ProjectScopeList({
  scope,
  selected_project,
  project_groups,
  total_count,
  has_query,
  select_all,
  select_project,
}: ProjectScopeListProps) {
  const make_select_handler = useCallback(
    (project: ProjectSummary) => () => select_project(project),
    [select_project],
  );

  return (
    <div className="max-h-[24rem] overflow-y-auto overflow-x-hidden px-1 py-2">
      {/* All projects */}
      <ProjectScopeItem
        label="All projects"
        meta={`${format_number(total_count)} tracked`}
        selected={scope === null}
        on_select={select_all}
      />

      {/* Pinned selected project */}
      {selected_project ? (
        <ProjectScopeItem
          label={selected_project.name}
          subtitle={get_project_subtitle(selected_project.path)}
          meta={get_project_meta(selected_project)}
          selected
          title={selected_project.path}
          on_select={make_select_handler(selected_project)}
        />
      ) : null}

      {/* Grouped projects */}
      {project_groups.length > 0 ? (
        project_groups.map((group) => (
          <div key={group.id}>
            <div className="flex items-baseline justify-between px-2 pb-0.5 pt-2 mb-2 mt-2">
              <p className="font-mono text-xs font-medium lowercase text-foreground">
                {group.label}
              </p>
              <span className="font-mono text-xs text-muted-foreground">
                {group.projects.length}
              </span>
            </div>

            <Separator className="mx-2 my-1" />

            <div className="flex flex-col">
              {group.projects.map((project) => (
                <ProjectScopeItem
                  key={project.path}
                  label={project.name}
                  subtitle={get_project_subtitle(project.path)}
                  meta={get_project_meta(project)}
                  selected={scope?.project_path === project.path}
                  title={project.path}
                  on_select={make_select_handler(project)}
                />
              ))}
            </div>
          </div>
        ))
      ) : has_query ? (
        <ProjectScopeEmpty />
      ) : null}
    </div>
  );
}
