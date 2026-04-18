/**
 * File ↔ Session bridge query.
 *
 * Given a set of file paths (or directory prefixes), returns session
 * summaries with per-file operation breakdowns.
 * Empty file_paths = return all sessions (root / unfiltered).
 */

import { filter_sessions } from "../filter.js";
import { session_cache } from "../session-cache.js";
import type { SessionSummary } from "../session-types.js";

export interface FileOpsInSession {
	path: string;
	read_count: number;
	edit_count: number;
	write_count: number;
	total_count: number;
}

export interface FileSessionDetail {
	session_id: string;
	started_at: string;
	prompt_preview: string;
	total_cost: number;
	duration_seconds: number | null;
	model_id: string | null;
	file_ops: FileOpsInSession[];
	total_file_ops: number;
}

export interface FileSessionsResponse {
	project_path: string;
	queried_paths: string[];
	sessions: FileSessionDetail[];
}

function path_matches(file_path: string, queried_paths: string[]): boolean {
	for (const qp of queried_paths) {
		if (file_path === qp) return true;
		if (file_path.startsWith(qp + "/")) return true;
		if (qp.endsWith("/") && file_path.startsWith(qp)) return true;
	}
	return false;
}

function extract_file_ops(
	session: SessionSummary,
	queried_paths: string[],
): FileOpsInSession[] {
	const ops_map = new Map<string, FileOpsInSession>();
	const ensure = (path: string): FileOpsInSession => {
		let e = ops_map.get(path);
		if (!e) {
			e = { path, read_count: 0, edit_count: 0, write_count: 0, total_count: 0 };
			ops_map.set(path, e);
		}
		return e;
	};
	for (const [p, c] of Object.entries(session.read_files))
		if (path_matches(p, queried_paths)) ensure(p).read_count += c;
	for (const [p, c] of Object.entries(session.edit_files))
		if (path_matches(p, queried_paths)) ensure(p).edit_count += c;
	for (const [p, c] of Object.entries(session.write_files))
		if (path_matches(p, queried_paths)) ensure(p).write_count += c;
	for (const o of ops_map.values())
		o.total_count = o.read_count + o.edit_count + o.write_count;
	return Array.from(ops_map.values()).sort((a, b) => b.total_count - a.total_count);
}

function extract_all_file_ops(session: SessionSummary): FileOpsInSession[] {
	const ops_map = new Map<string, FileOpsInSession>();
	const ensure = (path: string): FileOpsInSession => {
		let e = ops_map.get(path);
		if (!e) {
			e = { path, read_count: 0, edit_count: 0, write_count: 0, total_count: 0 };
			ops_map.set(path, e);
		}
		return e;
	};
	for (const [p, c] of Object.entries(session.read_files)) ensure(p).read_count += c;
	for (const [p, c] of Object.entries(session.edit_files)) ensure(p).edit_count += c;
	for (const [p, c] of Object.entries(session.write_files)) ensure(p).write_count += c;
	for (const o of ops_map.values())
		o.total_count = o.read_count + o.edit_count + o.write_count;
	return Array.from(ops_map.values()).sort((a, b) => b.total_count - a.total_count);
}

function primary_model(session: SessionSummary): string | null {
	if (!session.models_used.length) return null;
	return session.models_used.reduce((a, b) =>
		b.message_count > a.message_count ? b : a,
	).model_id;
}

function prompt_preview(session: SessionSummary): string {
	const s = session.title || session.first_user_message || "";
	return s.length <= 120 ? s : s.slice(0, 117) + "…";
}

export async function get_sessions_for_files(
	project_path: string,
	file_paths: string[],
	range_days: number,
): Promise<FileSessionsResponse> {
	const all = await session_cache.get_or_init();
	const project_sessions = filter_sessions(all, project_path, range_days);
	const match_all = file_paths.length === 0;
	const details: FileSessionDetail[] = [];

	for (const session of project_sessions) {
		const file_ops = match_all
			? extract_all_file_ops(session)
			: extract_file_ops(session, file_paths);
		if (file_ops.length === 0) continue;
		const total_file_ops = file_ops.reduce((s, fo) => s + fo.total_count, 0);
		details.push({
			session_id: session.id,
			started_at: session.started_at,
			prompt_preview: prompt_preview(session),
			total_cost: session.total_cost,
			duration_seconds: session.duration_seconds,
			model_id: primary_model(session),
			file_ops,
			total_file_ops,
		});
	}

	details.sort((a, b) => b.total_file_ops - a.total_file_ops);
	return { project_path, queried_paths: file_paths, sessions: details };
}
