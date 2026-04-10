import type { ProjectSummary } from "@contracts/shared";

export type ProjectFilterMode = "all" | "recent" | "active";

export interface ProjectGroup {
	id: string;
	label: string;
	projects: ProjectSummary[];
}
