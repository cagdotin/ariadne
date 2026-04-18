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
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
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

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_EXCLUDES =
	"node_modules, .git, dist, build, .next, __pycache__, target, .cache, .turbo, coverage";

function parse_excludes(raw: string): string[] {
	return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function filter_by_excludes(insights: FileInsight[], excludes: string[]): FileInsight[] {
	if (excludes.length === 0) return insights;
	return insights.filter((f) => !excludes.some((ex) => f.path.includes(ex)));
}

function get_scoped_file_paths(insights: FileInsight[], scope: string): string[] {
	if (!scope) return []; // empty = root = backend returns all
	return insights
		.filter((i) => i.path === scope || i.path.startsWith(scope + "/"))
		.map((i) => i.path);
}

// ─── Provider ──────────────────────────────────────────────────────────────

export function ExploreProvider({ children }: { children: ReactNode }) {
	const { scope } = use_project_scope();
	const { range_days } = use_analytics_time_range();
	const project_path = scope?.project_path ?? null;
	const navigate = useNavigate();

	const search = useSearch({ from: "/explore" });
	const selected_path = (search as { path?: string }).path ?? "";

	const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
	const [file_sessions, set_file_sessions] = useState<FileSessionsResponse | null>(null);
	const [loading_file_stats, set_loading_file_stats] = useState(false);
	const [loading_sessions, set_loading_sessions] = useState(false);
	const [error, set_error] = useState<string | null>(null);
	const [sessions_error, set_sessions_error] = useState<string | null>(null);
	const [selected_session_id, set_selected_session_id] = useState<string | null>(null);
	const [lens, set_lens] = useState<OperationLens>("all");
	const [exclude_paths, set_exclude_paths] = useState(DEFAULT_EXCLUDES);

	const excludes = useMemo(() => parse_excludes(exclude_paths), [exclude_paths]);
	const all_insights = useMemo(
		() => (file_stats ? from_backend_insights(file_stats.file_insights) : []),
		[file_stats],
	);
	const filtered_insights = useMemo(
		() => filter_by_excludes(all_insights, excludes),
		[all_insights, excludes],
	);

	// ── Load file stats ──────────────────────────────────────────────────
	useEffect(() => {
		if (!project_path) { set_file_stats(null); return; }
		let cancelled = false;
		set_loading_file_stats(true);
		set_error(null);
		get_project_file_stats(project_path, range_days)
			.then((d) => { if (!cancelled) set_file_stats(d); })
			.catch((e) => { if (!cancelled) set_error(error_message(e, "Failed to load file stats")); })
			.finally(() => { if (!cancelled) set_loading_file_stats(false); });
		return () => { cancelled = true; };
	}, [project_path, range_days]);

	// ── Load sessions for current scope ──────────────────────────────────
	useEffect(() => {
		if (!project_path) { set_file_sessions(null); return; }

		// Root (empty) → send empty array (backend returns all sessions).
		// Scoped → resolve to matching file paths.
		const file_paths = get_scoped_file_paths(filtered_insights, selected_path);

		// If scoped but no files match yet (insights not loaded), skip
		if (selected_path && file_paths.length === 0 && filtered_insights.length === 0) {
			return;
		}

		let cancelled = false;
		set_loading_sessions(true);
		set_sessions_error(null);
		get_sessions_for_files(project_path, file_paths, range_days)
			.then((d) => { if (!cancelled) set_file_sessions(d); })
			.catch((e) => { if (!cancelled) set_sessions_error(error_message(e, "Failed to load sessions")); })
			.finally(() => { if (!cancelled) set_loading_sessions(false); });
		return () => { cancelled = true; };
	}, [project_path, range_days, selected_path, filtered_insights]);

	// ── Clear session selection on scope change ──────────────────────────
	useEffect(() => { set_selected_session_id(null); }, [selected_path]);

	// ── Actions ──────────────────────────────────────────────────────────
	const navigate_to_path = useCallback(
		(path: string) => {
			navigate({ to: "/explore", search: path ? { path } : {}, replace: false });
		},
		[navigate],
	);

	const select_session = useCallback((id: string | null) => {
		set_selected_session_id(id);
	}, []);

	const visible_sessions = useMemo(() => file_sessions?.sessions ?? [], [file_sessions]);

	// Build set of project-relative paths for treemap highlighting.
	// Backend returns absolute paths; treemap uses project-relative paths.
	const session_file_paths = useMemo(() => {
		if (!selected_session_id || !file_sessions) return new Set<string>();
		const s = file_sessions.sessions.find((s) => s.session_id === selected_session_id);
		if (!s) return new Set<string>();
		const pp = project_path ?? undefined;
		return new Set(s.file_ops.map((fo) => strip_project_prefix(fo.path, pp)));
	}, [selected_session_id, file_sessions, project_path]);

	return (
		<ExploreContext.Provider value={{
			file_stats, all_insights, filtered_insights,
			file_sessions, loading_file_stats, loading_sessions,
			error, sessions_error,
			selected_path, navigate_to_path,
			selected_session_id, select_session,
			lens, set_lens, exclude_paths, set_exclude_paths,
			project_path, range_days, visible_sessions, session_file_paths,
		}}>
			{children}
		</ExploreContext.Provider>
	);
}

export function use_explore_context(): ExploreContextValue {
	const ctx = useContext(ExploreContext);
	if (!ctx) throw new Error("use_explore_context must be used within ExploreProvider");
	return ctx;
}
