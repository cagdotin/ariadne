import type { ProjectSummary } from "@/schemas/analytics";
import { format_number } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import {
  ComboboxGroup,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import type { ProjectGroup } from "./types";
import { ProjectScopeItem } from "./project-scope-item";
import { ProjectScopeEmpty } from "./project-scope-empty";
import { get_project_meta, get_project_subtitle } from "./utils";

interface ProjectScopePinnedItemsProps {
  selected_project: ProjectSummary | null;
  total_count: number;
  all_projects_value: unknown;
}

interface ProjectScopeListProps extends ProjectScopePinnedItemsProps {
  project_groups: ProjectGroup[];
  has_query: boolean;
}

function ProjectScopePinnedItems({
  selected_project,
  total_count,
  all_projects_value,
}: ProjectScopePinnedItemsProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <ProjectScopeItem
        value={all_projects_value}
        label="All projects"
        meta={`${format_number(total_count)} tracked`}
      />

      {selected_project ? (
        <ProjectScopeItem
          value={selected_project}
          label={selected_project.name}
          subtitle={get_project_subtitle(selected_project.path)}
          meta={get_project_meta(selected_project)}
          title={selected_project.path}
        />
      ) : null}
    </div>
  );
}

function ProjectScopeGroupSection({ group }: { group: ProjectGroup }) {
  return (
    <ComboboxGroup className="mt-2">
      <div className="mb-2 mt-2 flex items-baseline justify-between px-2 pb-0.5 pt-2">
        <ComboboxLabel className="px-0 py-0 font-mono">{group.label}</ComboboxLabel>
        <span className="font-mono text-xs text-muted-foreground">
          {group.projects.length}
        </span>
      </div>

      <Separator className="mx-2 my-1" />

      <div className="flex flex-col gap-0.5">
        {group.projects.map((project) => (
          <ProjectScopeItem
            key={project.path}
            value={project}
            label={project.name}
            subtitle={get_project_subtitle(project.path)}
            meta={get_project_meta(project)}
            title={project.path}
          />
        ))}
      </div>
    </ComboboxGroup>
  );
}

export function ProjectScopeList({
  selected_project,
  project_groups,
  total_count,
  has_query,
  all_projects_value,
}: ProjectScopeListProps) {
  const has_matches = project_groups.length > 0;
  const show_pinned_after_matches = has_query;

  return (
    <ComboboxList>
      {!show_pinned_after_matches ? (
        <ProjectScopePinnedItems
          selected_project={selected_project}
          total_count={total_count}
          all_projects_value={all_projects_value}
        />
      ) : null}

      {has_matches
        ? project_groups.map((group) => (
            <ProjectScopeGroupSection key={group.id} group={group} />
          ))
        : has_query
          ? <ProjectScopeEmpty />
          : null}

      {show_pinned_after_matches ? (
        <div className="mt-2">
          <div className="mb-2 mt-2 flex items-baseline justify-between px-2 pb-0.5 pt-2">
            <p className="font-mono text-xs font-medium lowercase text-foreground">
              scope
            </p>
          </div>
          <Separator className="mx-2 my-1" />
          <ProjectScopePinnedItems
            selected_project={selected_project}
            total_count={total_count}
            all_projects_value={all_projects_value}
          />
        </div>
      ) : null}
    </ComboboxList>
  );
}
