/**
 * Analytics command registration: wires handlers into the request router.
 * Overrides the stubs registered in backend/stubs/index.ts.
 */

import { register_handler } from "../runtime/request-router.js";
import { get_sessions_for_files } from "./aggregations/file-session-bridge.js";
import { get_project_file_stats } from "./aggregations/file-stats.js";
import { get_analytics_overview } from "./aggregations/overview.js";
import { get_time_breakdown } from "./aggregations/time-breakdown.js";
import { get_tool_details } from "./aggregations/tool-details.js";
import { filter_sessions } from "./filter.js";
import { get_file_sizes, list_projects } from "./helpers.js";
import { get_session_entries } from "./replay-loader.js";
import { session_cache } from "./session-cache.js";

// ---- list_projects ----------------------------------------------------------

register_handler("list_projects", async () => {
	const sessions = await session_cache.get_or_init();
	return list_projects(sessions);
});

// ---- get_analytics_overview -------------------------------------------------

register_handler("get_analytics_overview", async (payload) => {
	const project_path =
		typeof payload.projectPath === "string" ? payload.projectPath : null;
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	return get_analytics_overview(project_path, range_days);
});

// ---- get_session_detail -----------------------------------------------------

register_handler("get_session_detail", async (payload) => {
	const session_id = payload.sessionId as string;
	if (typeof session_id !== "string") {
		throw new Error("sessionId is required");
	}
	const sessions = await session_cache.get_or_init();
	const session = sessions.find((s) => s.id === session_id);
	if (!session) {
		throw new Error(`Session with id ${session_id} not found`);
	}
	return session;
});

// ---- get_all_sessions -------------------------------------------------------

register_handler("get_all_sessions", async (payload) => {
	const project_path =
		typeof payload.projectPath === "string" ? payload.projectPath : null;
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	const sessions = await session_cache.get_or_init();
	const filtered = filter_sessions(sessions, project_path, range_days);
	// Sort by started_at descending (newest first)
	filtered.sort((a, b) => b.started_at.localeCompare(a.started_at));
	return filtered;
});

// ---- resync_sessions --------------------------------------------------------

register_handler("resync_sessions", async () => {
	await session_cache.resync();
	return get_analytics_overview(null, 0);
});

// ---- get_project_file_stats -------------------------------------------------

register_handler("get_project_file_stats", async (payload) => {
	const project_path = payload.projectPath as string;
	if (typeof project_path !== "string") {
		throw new Error("projectPath is required");
	}
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	return get_project_file_stats(project_path, range_days);
});

// ---- get_time_breakdown -----------------------------------------------------

register_handler("get_time_breakdown", async (payload) => {
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	const project_path =
		typeof payload.projectPath === "string" ? payload.projectPath : null;
	return get_time_breakdown(range_days, project_path);
});

// ---- get_session_entries ----------------------------------------------------

register_handler("get_session_entries", async (payload) => {
	const session_id = payload.sessionId as string;
	if (typeof session_id !== "string") {
		throw new Error("sessionId is required");
	}
	return get_session_entries(session_id);
});

// ---- get_tool_details -------------------------------------------------------

register_handler("get_tool_details", async (payload) => {
	const tool_name = payload.toolName as string;
	if (typeof tool_name !== "string") {
		throw new Error("toolName is required");
	}
	const project_path =
		typeof payload.projectPath === "string" ? payload.projectPath : null;
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	return get_tool_details(tool_name, project_path, range_days);
});

// ---- get_file_sizes ---------------------------------------------------------

register_handler("get_file_sizes", async (payload) => {
	const paths = payload.paths as string[];
	if (!Array.isArray(paths)) {
		throw new Error("paths must be an array");
	}
	return get_file_sizes(paths);
});

// ---- get_sessions_for_files -------------------------------------------------

register_handler("get_sessions_for_files", async (payload) => {
	const project_path = payload.projectPath as string;
	if (typeof project_path !== "string") {
		throw new Error("projectPath is required");
	}
	const file_paths = payload.filePaths as string[];
	if (!Array.isArray(file_paths)) {
		throw new Error("filePaths must be an array");
	}
	const range_days =
		typeof payload.rangeDays === "number" ? payload.rangeDays : 0;
	return get_sessions_for_files(project_path, file_paths, range_days);
});
