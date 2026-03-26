import type { ProjectSummary } from "@/schemas/analytics";
import {
  Combobox,
  ComboboxContent,
} from "@/components/ui/combobox";
import { use_project_scope_selector } from "./use-project-scope-selector";
import { ProjectScopeTrigger } from "./project-scope-trigger";
import { ProjectScopeSearch } from "./project-scope-search";
import { ProjectScopeList } from "./project-scope-list";

const all_projects_value = { id: "__all-projects__" } as const;

type ProjectScopeOption = ProjectSummary | typeof all_projects_value;

function is_all_projects_option(
  option: ProjectScopeOption | null,
): option is typeof all_projects_value {
  return option !== null && "id" in option && option.id === all_projects_value.id;
}

function is_project_option(option: ProjectScopeOption | null): option is ProjectSummary {
  return option !== null && !is_all_projects_option(option);
}

function is_same_option(a: ProjectScopeOption | null, b: ProjectScopeOption | null) {
  if (a === null || b === null) return a === b;
  if (is_all_projects_option(a) || is_all_projects_option(b)) {
    return is_all_projects_option(a) && is_all_projects_option(b);
  }
  return a.path === b.path;
}

export function ProjectScopeSelector() {
  const {
    open,
    query,
    filter_mode,
    loading,
    selected_project,
    project_groups,
    trigger_label,
    trigger_description,
    filtered_count,
    total_count,
    is_stale,
    normalized_query,
    set_query,
    handle_open_change,
    handle_filter_change,
    select_all,
    select_project,
  } = use_project_scope_selector();

  const value = selected_project ?? all_projects_value;

  function handle_value_change(option: ProjectScopeOption | null) {
    if (is_all_projects_option(option) || option === null) {
      select_all();
      return;
    }

    if (is_project_option(option)) {
      select_project(option);
    }
  }

  return (
    <Combobox<ProjectScopeOption>
      value={value}
      open={open}
      inputValue={query}
      autoHighlight={normalized_query.length > 0}
      itemToStringLabel={(option) =>
        is_all_projects_option(option) ? "All projects" : option.name
      }
      itemToStringValue={(option) =>
        is_all_projects_option(option) ? option.id : option.path
      }
      isItemEqualToValue={is_same_option}
      onOpenChange={(next_open) => handle_open_change(next_open)}
      onInputValueChange={(next_query) => set_query(next_query)}
      onValueChange={handle_value_change}
    >
      <ProjectScopeTrigger
        loading={loading}
        label={trigger_label}
        description={trigger_description}
        full_path={selected_project?.path ?? null}
      />

      <ComboboxContent align="start" initialFocus finalFocus className="w-[22rem]">
        <ProjectScopeSearch
          query={query}
          filter_mode={filter_mode}
          visible_count={filtered_count}
          is_stale={is_stale}
          on_query_change={set_query}
          on_filter_change={handle_filter_change}
        />

        <ProjectScopeList
          selected_project={selected_project}
          project_groups={project_groups}
          total_count={total_count}
          has_query={normalized_query.length > 0}
          all_projects_value={all_projects_value}
        />
      </ComboboxContent>
    </Combobox>
  );
}
