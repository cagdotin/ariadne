import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FolderGit2, Search, X } from "lucide-react";
import type { ProjectSummary } from "@/schemas/analytics";
import { format_date_relative, format_number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { use_project_scope } from "./project-scope-provider";

type ProjectFilterMode = "all" | "recent" | "active";

interface ProjectGroup {
  id: string;
  label: string;
  projects: ProjectSummary[];
}

interface ProjectScopeItemProps {
  label: string;
  subtitle?: string;
  meta: string;
  selected: boolean;
  on_select: () => void;
  title?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize_path_segments(path: string) {
  return path.replace(/\/$/, "").split("/").filter(Boolean);
}

function get_workspace_label(path: string) {
  const segments = normalize_path_segments(path);
  if (segments.length >= 3) {
    return `${segments[segments.length - 3]} / ${segments[segments.length - 2]}`;
  }
  if (segments.length >= 2) {
    return segments[segments.length - 2];
  }
  return "other";
}

function get_project_subtitle(path: string) {
  const segments = normalize_path_segments(path);
  if (segments.length <= 1) return path;
  const parent_segments = segments.slice(Math.max(0, segments.length - 4), -1);
  return `…/${parent_segments.join("/")}`;
}

function get_project_meta(project: ProjectSummary) {
  return `${format_number(project.session_count)} · ${format_date_relative(project.last_active)}`;
}

function matches_project_query(project: ProjectSummary, query: string) {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  return (
    project.name.toLowerCase().includes(q) ||
    project.path.toLowerCase().includes(q) ||
    get_workspace_label(project.path).toLowerCase().includes(q)
  );
}

function sort_projects_by_recent(projects: ProjectSummary[]) {
  return [...projects].sort(
    (a, b) =>
      new Date(b.last_active).getTime() - new Date(a.last_active).getTime() ||
      b.session_count - a.session_count ||
      a.name.localeCompare(b.name),
  );
}

function sort_projects_by_activity(projects: ProjectSummary[]) {
  return [...projects].sort(
    (a, b) =>
      b.session_count - a.session_count ||
      new Date(b.last_active).getTime() - new Date(a.last_active).getTime() ||
      a.name.localeCompare(b.name),
  );
}

function build_workspace_groups(projects: ProjectSummary[]): ProjectGroup[] {
  const groups = new Map<string, ProjectSummary[]>();
  for (const project of projects) {
    const label = get_workspace_label(project.path);
    const list = groups.get(label) ?? [];
    list.push(project);
    groups.set(label, list);
  }
  return [...groups.entries()]
    .map(([label, items]) => ({
      id: `ws-${label}`,
      label,
      projects: sort_projects_by_activity(items),
    }))
    .sort((a, b) => {
      const a_total = a.projects.reduce((s, p) => s + p.session_count, 0);
      const b_total = b.projects.reduce((s, p) => s + p.session_count, 0);
      return b_total - a_total || a.label.localeCompare(b.label);
    });
}

function is_filter_mode(value: string): value is ProjectFilterMode {
  return value === "all" || value === "recent" || value === "active";
}

// ---------------------------------------------------------------------------
// Item row — matches sidebar menu button density: rounded-md p-2
// ---------------------------------------------------------------------------

function ProjectScopeItem({
  label,
  subtitle,
  meta,
  selected,
  on_select,
  title,
}: ProjectScopeItemProps) {
  return (
    <Button
      variant="ghost"
      onClick={on_select}
      title={title}
      className={cn(
        "flex h-auto w-full items-center gap-2 whitespace-normal rounded-md p-2 text-left",
        selected && "bg-accent",
      )}
    >
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-muted-foreground font-semibold">
            {label}
          </p>
          <span className="shrink-0 text-muted-foreground">{meta}</span>
        </div>
        {subtitle ? (
          <p className="truncate  text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {selected ? (
        <Check className="size-3.5 shrink-0 text-foreground" />
      ) : null}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

export function ProjectScopeSelector() {
  const { scope, projects, loading, set_scope } = use_project_scope();
  const [open, set_open] = useState(false);
  const [query, set_query] = useState("");
  const [filter_mode, set_filter_mode] = useState<ProjectFilterMode>("all");

  const normalized_query = query.trim().toLowerCase();
  const selected_project = scope
    ? (projects.find((p) => p.path === scope.project_path) ?? null)
    : null;

  const filtered_projects = useMemo(() => {
    const matches = projects.filter((p) =>
      matches_project_query(p, normalized_query),
    );
    if (filter_mode === "recent") return sort_projects_by_recent(matches);
    return sort_projects_by_activity(matches);
  }, [filter_mode, normalized_query, projects]);

  const visible_projects = useMemo(() => {
    if (!selected_project) return filtered_projects;
    return filtered_projects.filter((p) => p.path !== selected_project.path);
  }, [filtered_projects, selected_project]);

  const project_groups = useMemo(() => {
    if (visible_projects.length === 0) return [];
    if (normalized_query.length > 0) {
      return [{ id: "matches", label: "matches", projects: visible_projects }];
    }
    if (filter_mode === "recent") {
      return [
        { id: "recent", label: "recently active", projects: visible_projects },
      ];
    }
    if (filter_mode === "active") {
      return [{ id: "active", label: "most used", projects: visible_projects }];
    }
    return build_workspace_groups(visible_projects);
  }, [filter_mode, normalized_query, visible_projects]);

  const trigger_label = selected_project?.name ?? "All projects";
  const trigger_description = selected_project
    ? get_project_subtitle(selected_project.path)
    : `${format_number(projects.length)} tracked`;

  function handle_open_change(next_open: boolean) {
    set_open(next_open);
    if (!next_open) {
      set_query("");
      set_filter_mode("all");
    }
  }

  function handle_filter_change(value: string) {
    if (is_filter_mode(value)) set_filter_mode(value);
  }

  function select_all() {
    set_scope(null);
    set_open(false);
  }

  function select_project(project: ProjectSummary) {
    set_scope({ project_path: project.path, project_name: project.name });
    set_open(false);
  }

  return (
    <Popover open={open} onOpenChange={handle_open_change}>
      <PopoverTrigger
        disabled={loading}
        title={selected_project?.path ?? "All projects"}
      >
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-6 justify-between")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">
              {loading ? "Loading…" : trigger_label}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="hidden truncate text-xs text-muted-foreground lg:block leading-3">
              {loading ? "" : trigger_description}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[22rem] overflow-hidden p-0 gap-0"
      >
        {/* Search + filter tabs */}
        <div className="space-y-2 p-3 border-b">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => set_query(e.target.value)}
              placeholder="Search project name or path…"
              className="pl-8 pr-8"
            />
            {query.length > 0 ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => set_query("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <X />
              </Button>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <Tabs
              value={filter_mode}
              onValueChange={handle_filter_change}
              className="gap-0"
            >
              <TabsList variant="line" className="h-7 gap-0 p-0">
                <TabsTrigger value="all" className="h-7 px-2 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="recent" className="h-7 px-2 text-xs">
                  Recent
                </TabsTrigger>
                <TabsTrigger value="active" className="h-7 px-2 text-xs">
                  Active
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground">
              {format_number(filtered_projects.length)} visible
            </span>
          </div>
        </div>

        {/* Project list */}
        <div className="max-h-[24rem] overflow-y-auto overflow-x-hidden px-1 py-2 ">
          {/* All projects */}
          <ProjectScopeItem
            label="All projects"
            meta={`${format_number(projects.length)} tracked`}
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
              on_select={() => select_project(selected_project)}
            />
          ) : null}

          {/* Grouped projects */}
          {project_groups.length > 0 ? (
            project_groups.map((group, _index) => (
              <div key={group.id} className="">
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
                      on_select={() => select_project(project)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : visible_projects.length === 0 && normalized_query.length > 0 ? (
            <div className="px-4 py-6 text-center">
              <Search className="mx-auto size-4 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No matching projects
              </p>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
