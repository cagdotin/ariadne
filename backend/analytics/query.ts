/**
 * Session query functions — standalone wrappers around the session cache
 * for direct use by parity tests and other consumers.
 */

import { filter_sessions } from "./filter.js";
import { session_cache } from "./session-cache.js";
import type { SessionSummary } from "./session-types.js";

/**
 * Get all sessions, optionally filtered by project path and time range.
 * Results sorted by started_at descending (newest first).
 */
export async function get_all_sessions(
	project_path: string | null,
	range_days: number,
): Promise<SessionSummary[]> {
	const all = await session_cache.get_or_init();
	const filtered = filter_sessions(all, project_path, range_days);
	filtered.sort((a, b) => b.started_at.localeCompare(a.started_at));
	return filtered;
}

/**
 * Get a specific session by ID.
 * Throws if not found.
 */
export async function get_session_detail(
	session_id: string,
): Promise<SessionSummary> {
	const all = await session_cache.get_or_init();
	const session = all.find((s) => s.id === session_id);
	if (!session) {
		throw new Error(`Session with id ${session_id} not found`);
	}
	return session;
}
