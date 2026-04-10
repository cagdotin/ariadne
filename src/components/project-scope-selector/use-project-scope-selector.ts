import type { ProjectSummary } from "@contracts/shared";
import { useDeferredValue, useMemo, useState } from "react";
import { use_project_scope } from "@/components/project-scope-provider";
import { format_number } from "@/lib/format";
import type { ProjectFilterMode, ProjectGroup } from "./types";
import {
	build_workspace_groups,
	get_project_subtitle,
	is_filter_mode,
	matches_project_query,
	sort_projects_by_activity,
	sort_projects_by_recent,
} from "./utils";

export interface ProjectScopeSelectorState {
	// State
	open: boolean;
	query: string;
	filter_mode: ProjectFilterMode;
	loading: boolean;
	scope: { project_path: string; project_name: string } | null;

	// Derived
	selected_project: ProjectSummary | null;
	project_groups: ProjectGroup[];
	trigger_label: string;
	trigger_description: string;
	filtered_count: number;
	total_count: number;
	is_stale: boolean;
	normalized_query: string;

	// Actions
	set_query: (query: string) => void;
	handle_open_change: (next_open: boolean) => void;
	handle_filter_change: (value: string) => void;
	select_all: () => void;
	select_project: (project: ProjectSummary) => void;
}

export function use_project_scope_selector(): ProjectScopeSelectorState {
	const { scope, projects, loading, set_scope } = use_project_scope();
	const [open, set_open] = useState(false);
	const [query, set_query] = useState("");
	const [filter_mode, set_filter_mode] = useState<ProjectFilterMode>("all");

	// Deferred value keeps the input snappy while list catches up (5.14)
	const deferred_query = useDeferredValue(query);
	const normalized_query = deferred_query.trim().toLowerCase();
	const is_stale = query !== deferred_query;

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

	const project_groups = useMemo((): ProjectGroup[] => {
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

	// --- Actions ---

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

	return {
		open,
		query,
		filter_mode,
		loading,
		scope,
		selected_project,
		project_groups,
		trigger_label,
		trigger_description,
		filtered_count: filtered_projects.length,
		total_count: projects.length,
		is_stale,
		normalized_query,
		set_query,
		handle_open_change,
		handle_filter_change,
		select_all,
		select_project,
	};
}
