// ---- Stub handlers: return fixture-like defaults for all command channels ---

import { register_handler } from "../runtime/request-router.js";

// ---- Helpers ----------------------------------------------------------------

function stub(channel: string, result: unknown): void {
	register_handler(channel, async () => result);
}

function stub_fn(
	channel: string,
	handler: (payload: Record<string, unknown>) => unknown,
): void {
	register_handler(channel, async (payload) => handler(payload));
}

// ---- Analytics stubs --------------------------------------------------------

stub("list_projects", []);

stub("get_analytics_overview", {
	total_sessions: 0,
	total_projects: 0,
	total_cost: 0,
	input_cost: 0,
	output_cost: 0,
	cache_read_cost: 0,
	cache_write_cost: 0,
	total_tokens: 0,
	input_tokens: 0,
	output_tokens: 0,
	cache_read_tokens: 0,
	cache_write_tokens: 0,
	total_file_size_bytes: 0,
	total_tool_calls: 0,
	total_tool_errors: 0,
	avg_session_duration_seconds: 0,
	avg_turns_per_session: 0,
	total_compactions: 0,
	sessions_by_date: [],
	cost_by_date: [],
	projects: [],
	models: [],
	tools: [],
	top_bash_commands: [],
	top_read_files: [],
	top_edit_files: [],
	top_write_files: [],
	recent_sessions: [],
});

stub_fn("get_session_detail", () => {
	throw new Error("Session not found (stub)");
});

stub("get_all_sessions", []);

stub("resync_sessions", {
	total_sessions: 0,
	total_projects: 0,
	total_cost: 0,
	input_cost: 0,
	output_cost: 0,
	cache_read_cost: 0,
	cache_write_cost: 0,
	total_tokens: 0,
	input_tokens: 0,
	output_tokens: 0,
	cache_read_tokens: 0,
	cache_write_tokens: 0,
	total_file_size_bytes: 0,
	total_tool_calls: 0,
	total_tool_errors: 0,
	avg_session_duration_seconds: 0,
	avg_turns_per_session: 0,
	total_compactions: 0,
	sessions_by_date: [],
	cost_by_date: [],
	projects: [],
	models: [],
	tools: [],
	top_bash_commands: [],
	top_read_files: [],
	top_edit_files: [],
	top_write_files: [],
	recent_sessions: [],
});

stub("get_project_file_stats", {
	project_path: "",
	total_sessions: 0,
	tool_distribution: [],
	read_files: [],
	edit_files: [],
	write_files: [],
	bash_commands: [],
	directory_stats: [],
	activity_by_date: [],
	file_insights: [],
});

stub("get_time_breakdown", {
	range_days: 30,
	total_sessions: 0,
	total_cost: 0,
	avg_cost_per_session: 0,
	total_tokens: 0,
	by_weekday: [],
	by_time_of_day: [],
	daily_sessions: [],
	daily_cost: [],
	hourly_sessions: [],
});

stub("get_session_entries", {
	header: null,
	entries: [],
	leaf_id: null,
});

stub("get_tool_details", {
	tool_name: "",
	total_calls: 0,
	total_errors: 0,
	items: [],
	by_project: [],
	by_date: [],
});

stub("get_file_sizes", []);

// ---- QMD stubs --------------------------------------------------------------

stub("qmd_list_indexes", []);

stub("qmd_get_status", {
	total_documents: 0,
	active_documents: 0,
	embedded_chunks: 0,
	needs_embedding: 0,
	collection_count: 0,
	db_size_bytes: 0,
	global_context: null,
	days_since_update: null,
});

stub("qmd_list_collections", []);

stub("qmd_get_collection_detail", {
	collection: {
		name: "",
		path: "",
		pattern: "",
		ignore_patterns: [],
		include_by_default: true,
		update_command: null,
		doc_count: 0,
		active_doc_count: 0,
		embedded_count: 0,
		last_modified: null,
		contexts: [],
	},
	documents: [],
});

stub("qmd_check_availability", {
	installed: false,
	version: null,
	db_path: null,
	db_size_bytes: null,
});

const command_result_ok = { success: true, output: "" };

stub("qmd_create_index", command_result_ok);
stub("qmd_delete_index", command_result_ok);
stub("qmd_rename_index", command_result_ok);
stub("qmd_add_collection", command_result_ok);
stub("qmd_remove_collection", command_result_ok);
stub("qmd_rename_collection", command_result_ok);
stub("qmd_add_context", command_result_ok);
stub("qmd_remove_context", command_result_ok);
stub("qmd_set_global_context", command_result_ok);
stub("qmd_reindex", command_result_ok);
stub("qmd_embed", command_result_ok);
stub("qmd_cleanup", command_result_ok);

// Spec aliases (match spec channel names that differ from API function names)
stub("qmd_update_collection", command_result_ok);
stub("qmd_update_global_context", command_result_ok);

stub("qmd_get_indexed_paths", []);
stub("qmd_toggle_files", { indexed: 0, deactivated: 0 });
stub("qmd_toggle_file", { indexed: 0, deactivated: 0 });
stub("qmd_scan_filesystem", []);
stub("qmd_rescan_filesystem", []);

stub("qmd_search", {
	results: [],
	expanded_queries: [],
	timing: { expand_ms: 0, search_ms: 0, total_ms: 0 },
});

// ---- QMD Logs stubs ---------------------------------------------------------

stub("get_qmd_logs", []);

stub("get_qmd_log_stats", {
	total_calls: 0,
	error_calls: 0,
	unique_projects: 0,
	unique_sessions: 0,
	by_subcommand: {},
});

// ---- Provider Limits stubs --------------------------------------------------

stub("get_provider_limits", { providers: [] });
stub("refresh_provider_limits", { providers: [] });
