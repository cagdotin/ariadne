import { use_project_scope } from "./project-scope-provider";

export function ProjectScopeSelector() {
  const { scope, projects, set_scope } = use_project_scope();

  // Detect duplicate display names for disambiguation
  const name_counts = new Map<string, number>();
  for (const p of projects) {
    name_counts.set(p.name, (name_counts.get(p.name) || 0) + 1);
  }

  const get_label = (project: { name: string; path: string }) => {
    if ((name_counts.get(project.name) || 0) > 1) {
      // Disambiguate with parent directory
      const segments = project.path.replace(/\/$/, "").split("/");
      if (segments.length >= 2) {
        return `${project.name} (…/${segments[segments.length - 2]})`;
      }
    }
    return project.name;
  };

  const handle_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "") {
      set_scope(null);
    } else {
      const project = projects.find((p) => p.path === value);
      if (project) {
        set_scope({ project_path: project.path, project_name: project.name });
      }
    }
  };

  return (
    <select
      value={scope?.project_path ?? ""}
      onChange={handle_change}
      className="bg-background border border-border rounded-md px-2.5 py-1 text-sm text-foreground max-w-[220px] truncate"
      title={scope ? scope.project_path : "All projects"}
    >
      <option value="">All Projects</option>
      {projects.map((p) => (
        <option key={p.path} value={p.path} title={p.path}>
          {get_label(p)}
        </option>
      ))}
    </select>
  );
}
