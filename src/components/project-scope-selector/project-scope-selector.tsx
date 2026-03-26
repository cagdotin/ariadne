import {
  Popover,
  PopoverContent,
} from "@/components/ui/popover";
import { use_project_scope_selector } from "./use-project-scope-selector";
import { ProjectScopeTrigger } from "./project-scope-trigger";
import { ProjectScopeSearch } from "./project-scope-search";
import { ProjectScopeList } from "./project-scope-list";

export function ProjectScopeSelector() {
  const {
    open,
    query,
    filter_mode,
    loading,
    scope,
    selected_project,
    project_groups,
    trigger_label,
    trigger_description,
    filtered_count,
    total_count,
    normalized_query,
    set_query,
    handle_open_change,
    handle_filter_change,
    select_all,
    select_project,
  } = use_project_scope_selector();

  return (
    <Popover open={open} onOpenChange={handle_open_change}>
      <ProjectScopeTrigger
        loading={loading}
        label={trigger_label}
        description={trigger_description}
        full_path={selected_project?.path ?? null}
      />

      <PopoverContent
        align="start"
        className="w-[22rem] overflow-hidden p-0 gap-0"
      >
        <ProjectScopeSearch
          query={query}
          filter_mode={filter_mode}
          visible_count={filtered_count}
          on_query_change={set_query}
          on_filter_change={handle_filter_change}
        />

        <ProjectScopeList
          scope={scope}
          selected_project={selected_project}
          project_groups={project_groups}
          total_count={total_count}
          has_query={normalized_query.length > 0}
          select_all={select_all}
          select_project={select_project}
        />
      </PopoverContent>
    </Popover>
  );
}
