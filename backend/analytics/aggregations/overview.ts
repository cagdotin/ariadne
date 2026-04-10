/**
 * Analytics overview aggregation — faithful port of
 * the analytics-overview aggregation logic.
 */

import { format_local_date, parse_timestamp } from "../date-utils.js";
import { filter_sessions } from "../filter.js";
import { session_cache } from "../session-cache.js";
import type { SessionSummary } from "../session-types.js";

export interface ModelAggregate {
	model_id: string;
	provider: string;
	message_count: number;
	total_cost: number;
}

export interface ToolAggregate {
	name: string;
	total_calls: number;
	total_errors: number;
}

export interface NameCount {
	name: string;
	count: number;
}

export interface DayCount {
	date: string;
	count: number;
}

export interface DayCost {
	date: string;
	cost: number;
}

export interface ProjectSummary {
	name: string;
	path: string;
	session_count: number;
	total_cost: number;
	total_tokens: number;
	last_active: string;
}

export interface AnalyticsOverview {
	total_sessions: number;
	total_projects: number;
	total_cost: number;
	input_cost: number;
	output_cost: number;
	cache_read_cost: number;
	cache_write_cost: number;
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;
	cache_read_tokens: number;
	cache_write_tokens: number;
	total_file_size_bytes: number;
	total_tool_calls: number;
	total_tool_errors: number;
	avg_session_duration_seconds: number;
	avg_turns_per_session: number;
	total_compactions: number;
	sessions_by_date: DayCount[];
	cost_by_date: DayCost[];
	projects: ProjectSummary[];
	models: ModelAggregate[];
	tools: ToolAggregate[];
	top_bash_commands: NameCount[];
	top_read_files: NameCount[];
	top_edit_files: NameCount[];
	top_write_files: NameCount[];
	recent_sessions: SessionSummary[];
}

export async function get_analytics_overview(
	project_path: string | null,
	range_days: number,
): Promise<AnalyticsOverview> {
	const all = await session_cache.get_or_init();
	const all_sessions = filter_sessions(all, project_path, range_days);

	const total_sessions = all_sessions.length;
	let total_cost = 0;
	let input_cost = 0;
	let output_cost = 0;
	let cache_read_cost = 0;
	let cache_write_cost = 0;
	let total_tokens = 0;
	let input_tokens = 0;
	let output_tokens = 0;
	let cache_read_tokens = 0;
	let cache_write_tokens = 0;
	let total_file_size_bytes = 0;
	let total_compactions = 0;
	let total_turns = 0;
	let duration_sum = 0;
	let duration_count = 0;

	for (const s of all_sessions) {
		total_cost += s.total_cost;
		input_cost += s.input_cost;
		output_cost += s.output_cost;
		cache_read_cost += s.cache_read_cost;
		cache_write_cost += s.cache_write_cost;
		total_tokens += s.total_tokens;
		input_tokens += s.input_tokens;
		output_tokens += s.output_tokens;
		cache_read_tokens += s.cache_read_tokens;
		cache_write_tokens += s.cache_write_tokens;
		total_file_size_bytes += s.file_size_bytes;
		total_compactions += s.compaction_count;
		total_turns += s.turn_count;
		if (s.duration_seconds !== null) {
			duration_sum += s.duration_seconds;
			duration_count += 1;
		}
	}

	const avg_turns_per_session =
		total_sessions > 0 ? total_turns / total_sessions : 0;
	const avg_session_duration_seconds =
		duration_count > 0 ? duration_sum / duration_count : 0;

	// Group by project (keyed by project_path for uniqueness)
	const project_map = new Map<string, ProjectSummary>();
	for (const session of all_sessions) {
		let entry = project_map.get(session.project_path);
		if (!entry) {
			entry = {
				name: session.project_name,
				path: session.project_path,
				session_count: 0,
				total_cost: 0,
				total_tokens: 0,
				last_active: session.started_at,
			};
			project_map.set(session.project_path, entry);
		}
		entry.session_count += 1;
		entry.total_cost += session.total_cost;
		entry.total_tokens += session.total_tokens;
		if (session.started_at > entry.last_active) {
			entry.last_active = session.started_at;
		}
	}
	const projects = Array.from(project_map.values());
	const total_projects = projects.length;

	// Group sessions by date (local timezone)
	const sessions_by_date_map = new Map<string, number>();
	const cost_by_date_map = new Map<string, number>();

	for (const session of all_sessions) {
		const dt = parse_timestamp(session.started_at);
		if (dt !== null) {
			const date = format_local_date(dt);
			sessions_by_date_map.set(date, (sessions_by_date_map.get(date) ?? 0) + 1);
			cost_by_date_map.set(
				date,
				(cost_by_date_map.get(date) ?? 0) + session.total_cost,
			);
		}
	}

	const sessions_by_date: DayCount[] = Array.from(
		sessions_by_date_map.entries(),
	).map(([date, count]) => ({ date, count }));
	sessions_by_date.sort((a, b) => a.date.localeCompare(b.date));

	const cost_by_date: DayCost[] = Array.from(cost_by_date_map.entries()).map(
		([date, cost]) => ({ date, cost }),
	);
	cost_by_date.sort((a, b) => a.date.localeCompare(b.date));

	// Aggregate models by (model_id, provider) pair
	const model_map = new Map<
		string,
		{ message_count: number; total_cost: number }
	>();
	for (const session of all_sessions) {
		for (const model_usage of session.models_used) {
			const key = `${model_usage.model_id}\0${model_usage.provider}`;
			const entry = model_map.get(key) ?? { message_count: 0, total_cost: 0 };
			entry.message_count += model_usage.message_count;
			entry.total_cost += session.total_cost / session.models_used.length;
			model_map.set(key, entry);
		}
	}
	const models: ModelAggregate[] = Array.from(model_map.entries()).map(
		([key, val]) => {
			const [model_id, provider] = key.split("\0");
			return {
				model_id,
				provider,
				message_count: val.message_count,
				total_cost: val.total_cost,
			};
		},
	);

	// Aggregate tools
	const tool_map = new Map<
		string,
		{ total_calls: number; total_errors: number }
	>();
	for (const session of all_sessions) {
		for (const [tool_name, tool_summary] of Object.entries(
			session.tool_calls,
		)) {
			const entry = tool_map.get(tool_name) ?? {
				total_calls: 0,
				total_errors: 0,
			};
			entry.total_calls += tool_summary.calls;
			entry.total_errors += tool_summary.errors;
			tool_map.set(tool_name, entry);
		}
	}
	const tools: ToolAggregate[] = Array.from(tool_map.entries()).map(
		([name, val]) => ({
			name,
			total_calls: val.total_calls,
			total_errors: val.total_errors,
		}),
	);

	const total_tool_calls = tools.reduce((sum, t) => sum + t.total_calls, 0);
	const total_tool_errors = tools.reduce((sum, t) => sum + t.total_errors, 0);

	// Aggregate tool detail data (top-20 lists)
	const bash_commands_map = new Map<string, number>();
	const read_files_map = new Map<string, number>();
	const edit_files_map = new Map<string, number>();
	const write_files_map = new Map<string, number>();

	for (const session of all_sessions) {
		for (const [command, count] of Object.entries(session.bash_commands)) {
			bash_commands_map.set(
				command,
				(bash_commands_map.get(command) ?? 0) + count,
			);
		}
		for (const [file, count] of Object.entries(session.read_files)) {
			read_files_map.set(file, (read_files_map.get(file) ?? 0) + count);
		}
		for (const [file, count] of Object.entries(session.edit_files)) {
			edit_files_map.set(file, (edit_files_map.get(file) ?? 0) + count);
		}
		for (const [file, count] of Object.entries(session.write_files)) {
			write_files_map.set(file, (write_files_map.get(file) ?? 0) + count);
		}
	}

	const make_top_20 = (m: Map<string, number>): NameCount[] => {
		const arr: NameCount[] = Array.from(m.entries()).map(([name, count]) => ({
			name,
			count,
		}));
		arr.sort((a, b) => b.count - a.count);
		arr.splice(20);
		return arr;
	};

	const top_bash_commands = make_top_20(bash_commands_map);
	const top_read_files = make_top_20(read_files_map);
	const top_edit_files = make_top_20(edit_files_map);
	const top_write_files = make_top_20(write_files_map);

	// Get recent sessions (last 20, sorted by started_at DESC)
	const recent_sessions = [...all_sessions];
	recent_sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
	recent_sessions.splice(20);

	return {
		total_sessions,
		total_projects,
		total_cost,
		input_cost,
		output_cost,
		cache_read_cost,
		cache_write_cost,
		total_tokens,
		input_tokens,
		output_tokens,
		cache_read_tokens,
		cache_write_tokens,
		total_file_size_bytes,
		total_tool_calls,
		total_tool_errors,
		avg_session_duration_seconds,
		avg_turns_per_session,
		total_compactions,
		sessions_by_date,
		cost_by_date,
		projects,
		models,
		tools,
		top_bash_commands,
		top_read_files,
		top_edit_files,
		top_write_files,
		recent_sessions,
	};
}
