/**
 * Analytics barrel export — public API for parity tests and other consumers.
 */

export { get_project_file_stats } from "./aggregations/file-stats.js";
export { get_analytics_overview } from "./aggregations/overview.js";
export { get_time_breakdown } from "./aggregations/time-breakdown.js";
export { get_tool_details } from "./aggregations/tool-details.js";
export { filter_sessions } from "./filter.js";
export { get_file_sizes, list_projects } from "./helpers.js";
// Re-export helpers that tests use directly
export { get_all_sessions, get_session_detail } from "./query.js";
export { session_cache } from "./session-cache.js";
