import type { ProjectSummary } from "@/schemas/analytics";

export type ProjectFilterMode = "all" | "recent" | "active";

export interface ProjectGroup {
  id: string;
  label: string;
  projects: ProjectSummary[];
}
