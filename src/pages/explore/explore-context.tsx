/**
 * Explorer context.
 *
 * The path scope is driven by the `?path=` URL search param.
 * Empty = root (all files, all sessions).
 * "src/components" = scoped to that subtree.
 */

import type {
	FileSessionDetail,
	FileSessionsResponse,
} from "@contracts/analytics/file-sessions";
import type { ProjectFileStats } from "@contracts/analytics/files";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	get_project_file_stats,
	get_sessions_for_files,
} from "@/api/analytics";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { use_project_scope } from "@/components/project-scope-provider";
import type { FileInsight, OperationLens } from "@/lib/file-analytics";
import { from_backend_insights } from "@/lib/file-analytics";
import { strip_project_prefix } from "@/lib/path-utils";
import { error_message } from "@/lib/utils";
import {
	DEFAULT_EXPLORE_EXCLUDES,
	derive_explore_session_query,
	filter_by_excludes,
	make_empty_file_sessions_response,
	parse_excludes,
} from "./explore-query";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExploreContextValue {
	file_stats: ProjectFileStats | null;
	all_insights: FileInsight[];
	filtered_insights: FileInsight[];
	file_sessions: FileSessionsResponse | null;
	loading_file_stats: boolean;
	loading_sessions: boolean;
	error: string | null;
	sessions_error: string | null;

	selected_path: string;
	navigate_to_path: (path: string) => void;

	selected_session_id: string | null;
	select_session: (id: string | null) => void;

	lens: OperationLens;
	set_lens: (l: OperationLens) => void;
	exclude_paths: string;
	set_exclude_paths: (v: string) => void;

	project_path: string | null;
	range_days: number;
	visible_sessions: FileSessionDetail[];
	session_file_paths: Set<string>;
}

const ExploreContext = createContext<ExploreContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────

export function ExploreProvider({ children }: { children: ReactNode }) {
	const { scope } = use_project_scope();
	const { range_days } = use_analytics_time_range();
	const project_path = scope?.project_path ?? null;
	const navigate = useNavigate();

	const search = useSearch({ from: "/explore" });
	const selected_path = (search as { path?: string }).path ?? "";
	const previous_selected_path_ref = useRef(selected_path);

	const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
	const [file_sessions, set_file_sessions] =
		useState<FileSessionsResponse | null>(null);
	const [loading_file_stats, set_loading_file_stats] = useState(false);
	const [loading_sessions, set_loading_sessions] = useState(false);
	const [error, set_error] = useState<string | null>(null);
	const [sessions_error, set_sessions_error] = useState<string | null>(null);
	const [selected_session_id, set_selected_session_id] = useState<
		string | null
	>(null);
	const [lens, set_lens] = useState<OperationLens>("all");
	const [exclude_paths, set_exclude_paths] = useState(DEFAULT_EXPLORE_EXCLUDES);

	const deferred_exclude_paths = useDeferredValue(exclude_paths);
	const excludes = useMemo(
		() => parse_excludes(deferred_exclude_paths),
		[deferred_exclude_paths],
	);
	const all_insights = useMemo(
		() => (file_stats ? from_backend_insights(file_stats.file_insights) : []),
		[file_stats],
	);
	const filtered_insights = useMemo(
		() => filter_by_excludes(all_insights, excludes),
		[all_insights, excludes],
	);
	const file_stats_ready = file_stats?.project_path === project_path;
	const session_query = useMemo(
		() =>
			derive_explore_session_query({
				project_path,
				selected_path,
				file_stats_ready,
				filtered_insights,
			}),
		[file_stats_ready, filtered_insights, project_path, selected_path],
	);

	// ── Load file stats ──────────────────────────────────────────────────
	useEffect(() => {
		if (!project_path) {
			set_file_stats(null);
			return;
		}

		let cancelled = false;
		set_file_stats(null);
		set_file_sessions(null);
		set_loading_file_stats(true);
		set_error(null);
		get_project_file_stats(project_path, range_days)
			.then((data) => {
				if (!cancelled) set_file_stats(data);
			})
			.catch((cause) => {
				if (!cancelled) {
					set_error(error_message(cause, "Failed to load file stats"));
				}
			})
			.finally(() => {
				if (!cancelled) set_loading_file_stats(false);
			});
		return () => {
			cancelled = true;
		};
	}, [project_path, range_days]);

	// ── Load sessions for current scope ──────────────────────────────────
	useEffect(() => {
		if (session_query.kind === "idle") {
			set_file_sessions(null);
			set_sessions_error(null);
			set_loading_sessions(false);
			return;
		}

		if (session_query.kind === "pending") {
			set_sessions_error(null);
			set_loading_sessions(false);
			return;
		}

		if (!project_path) {
			set_file_sessions(null);
			set_sessions_error(null);
			set_loading_sessions(false);
			return;
		}

		if (session_query.kind === "empty_scope") {
			set_file_sessions(make_empty_file_sessions_response(project_path));
			set_sessions_error(null);
			set_loading_sessions(false);
			return;
		}

		let cancelled = false;
		set_loading_sessions(true);
		set_sessions_error(null);
		get_sessions_for_files(project_path, session_query.file_paths, range_days)
			.then((response) => {
				if (!cancelled) set_file_sessions(response);
			})
			.catch((cause) => {
				if (!cancelled) {
					set_sessions_error(error_message(cause, "Failed to load sessions"));
				}
			})
			.finally(() => {
				if (!cancelled) set_loading_sessions(false);
			});
		return () => {
			cancelled = true;
		};
	}, [project_path, range_days, session_query]);

	const visible_sessions = useMemo(
		() => file_sessions?.sessions ?? [],
		[file_sessions],
	);

	// ── Clear session selection on scope change ──────────────────────────
	useEffect(() => {
		if (previous_selected_path_ref.current === selected_path) {
			return;
		}
		previous_selected_path_ref.current = selected_path;
		set_selected_session_id(null);
	}, [selected_path]);

	useEffect(() => {
		if (
			selected_session_id &&
			!visible_sessions.some(
				(session) => session.session_id === selected_session_id,
			)
		) {
			set_selected_session_id(null);
		}
	}, [selected_session_id, visible_sessions]);

	// ── Actions ──────────────────────────────────────────────────────────
	const navigate_to_path = useCallback(
		(path: string) => {
			navigate({
				to: "/explore",
				search: path ? { path } : {},
				replace: false,
			});
		},
		[navigate],
	);

	const select_session = useCallback((id: string | null) => {
		set_selected_session_id(id);
	}, []);

	// Build set of project-relative paths for treemap highlighting.
	// Backend returns absolute paths; treemap uses project-relative paths.
	const session_file_paths = useMemo(() => {
		if (!selected_session_id || !file_sessions) return new Set<string>();
		const session = file_sessions.sessions.find(
			(item) => item.session_id === selected_session_id,
		);
		if (!session) return new Set<string>();
		const scoped_project_path = project_path ?? undefined;
		return new Set(
			session.file_ops.map((file_op) =>
				strip_project_prefix(file_op.path, scoped_project_path),
			),
		);
	}, [selected_session_id, file_sessions, project_path]);

	return (
		<ExploreContext.Provider
			value={{
				file_stats,
				all_insights,
				filtered_insights,
				file_sessions,
				loading_file_stats,
				loading_sessions,
				error,
				sessions_error,
				selected_path,
				navigate_to_path,
				selected_session_id,
				select_session,
				lens,
				set_lens,
				exclude_paths,
				set_exclude_paths,
				project_path,
				range_days,
				visible_sessions,
				session_file_paths,
			}}
		>
			{children}
		</ExploreContext.Provider>
	);
}

export function use_explore_context(): ExploreContextValue {
	const ctx = useContext(ExploreContext);
	if (!ctx) {
		throw new Error("use_explore_context must be used within ExploreProvider");
	}
	return ctx;
}
