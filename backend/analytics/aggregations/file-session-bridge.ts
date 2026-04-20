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
	for (const queried_path of queried_paths) {
		if (file_path === queried_path) return true;
		if (file_path.startsWith(`${queried_path}/`)) return true;
		if (queried_path.endsWith("/") && file_path.startsWith(queried_path)) {
			return true;
		}
	}
	return false;
}

function sort_file_ops(
	left: FileOpsInSession,
	right: FileOpsInSession,
): number {
	if (right.total_count !== left.total_count) {
		return right.total_count - left.total_count;
	}
	return left.path.localeCompare(right.path);
}

function collect_file_ops(
	session: SessionSummary,
	matches_path: (file_path: string) => boolean,
): FileOpsInSession[] {
	const file_ops_by_path = new Map<string, FileOpsInSession>();
	const ensure = (file_path: string): FileOpsInSession => {
		let existing = file_ops_by_path.get(file_path);
		if (!existing) {
			existing = {
				path: file_path,
				read_count: 0,
				edit_count: 0,
				write_count: 0,
				total_count: 0,
			};
			file_ops_by_path.set(file_path, existing);
		}
		return existing;
	};

	for (const [file_path, count] of Object.entries(session.read_files)) {
		if (!matches_path(file_path)) continue;
		ensure(file_path).read_count += count;
	}
	for (const [file_path, count] of Object.entries(session.edit_files)) {
		if (!matches_path(file_path)) continue;
		ensure(file_path).edit_count += count;
	}
	for (const [file_path, count] of Object.entries(session.write_files)) {
		if (!matches_path(file_path)) continue;
		ensure(file_path).write_count += count;
	}

	for (const file_ops of file_ops_by_path.values()) {
		file_ops.total_count =
			file_ops.read_count + file_ops.edit_count + file_ops.write_count;
	}

	return [...file_ops_by_path.values()].sort(sort_file_ops);
}

function primary_model(session: SessionSummary): string | null {
	if (!session.models_used.length) return null;
	return session.models_used.reduce((left, right) =>
		right.message_count > left.message_count ? right : left,
	).model_id;
}

function prompt_preview(session: SessionSummary): string {
	const preview = session.title || session.first_user_message || "";
	return preview.length <= 120 ? preview : `${preview.slice(0, 117)}…`;
}

function sort_session_details(
	left: FileSessionDetail,
	right: FileSessionDetail,
): number {
	if (right.total_file_ops !== left.total_file_ops) {
		return right.total_file_ops - left.total_file_ops;
	}
	if (right.started_at !== left.started_at) {
		return right.started_at.localeCompare(left.started_at);
	}
	return left.session_id.localeCompare(right.session_id);
}

export async function get_sessions_for_files(
	project_path: string,
	file_paths: string[],
	range_days: number,
): Promise<FileSessionsResponse> {
	const all_sessions = await session_cache.get_or_init();
	const project_sessions = filter_sessions(
		all_sessions,
		project_path,
		range_days,
	);
	const matches_path =
		file_paths.length === 0
			? () => true
			: (file_path: string) => path_matches(file_path, file_paths);
	const details: FileSessionDetail[] = [];

	for (const session of project_sessions) {
		const file_ops = collect_file_ops(session, matches_path);
		if (file_ops.length === 0) continue;

		const total_file_ops = file_ops.reduce(
			(sum, file_op) => sum + file_op.total_count,
			0,
		);
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

	details.sort(sort_session_details);
	return { project_path, queried_paths: file_paths, sessions: details };
}
