import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ProjectSummary } from "@/schemas/analytics";
import { list_projects } from "@/api/analytics";

const STORAGE_KEY = "ariadne:project-scope";

export interface ProjectScope {
  project_path: string;
  project_name: string;
}

interface ProjectScopeState {
  scope: ProjectScope | null;
  projects: ProjectSummary[];
  loading: boolean;
  set_scope: (scope: ProjectScope | null) => void;
  refresh_projects: () => Promise<void>;
}

const initial_state: ProjectScopeState = {
  scope: null,
  projects: [],
  loading: true,
  set_scope: () => null,
  refresh_projects: async () => {},
};

const ProjectScopeContext = createContext<ProjectScopeState>(initial_state);

function read_stored_scope(): ProjectScope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.project_path === "string" &&
      typeof parsed.project_name === "string"
    ) {
      return parsed as ProjectScope;
    }
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function write_stored_scope(scope: ProjectScope | null) {
  if (scope === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  }
}

export function ProjectScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, set_scope_state] = useState<ProjectScope | null>(read_stored_scope);
  const [projects, set_projects] = useState<ProjectSummary[]>([]);
  const [loading, set_loading] = useState(true);

  const fetch_projects = useCallback(async (): Promise<ProjectSummary[]> => {
    try {
      set_loading(true);
      const result = await list_projects();
      set_projects(result);
      return result;
    } catch (err) {
      console.error("Failed to load project list:", err);
      return [];
    } finally {
      set_loading(false);
    }
  }, []);

  // Load projects on mount and validate stored scope
  useEffect(() => {
    fetch_projects().then((result) => {
      const stored = read_stored_scope();
      if (stored && !result.some((p) => p.path === stored.project_path)) {
        set_scope_state(null);
        write_stored_scope(null);
      }
    });
  }, [fetch_projects]);

  const set_scope = useCallback((new_scope: ProjectScope | null) => {
    set_scope_state(new_scope);
    write_stored_scope(new_scope);
  }, []);

  const refresh_projects = useCallback(async () => {
    await fetch_projects();
  }, [fetch_projects]);

  return (
    <ProjectScopeContext.Provider
      value={{ scope, projects, loading, set_scope, refresh_projects }}
    >
      {children}
    </ProjectScopeContext.Provider>
  );
}

export function use_project_scope() {
  const context = useContext(ProjectScopeContext);
  if (context === undefined) {
    throw new Error("use_project_scope must be used within a ProjectScopeProvider");
  }
  return context;
}
