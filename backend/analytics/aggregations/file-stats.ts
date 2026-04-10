/**
 * Project file stats aggregation — faithful port of
 * the file-stats aggregation logic.
 */

import * as path from "node:path";
import { format_local_date, parse_timestamp } from "../date-utils.js";
import { filter_sessions } from "../filter.js";
import { session_cache } from "../session-cache.js";

export interface NameCount {
	name: string;
	count: number;
}

export interface DayCount {
	date: string;
	count: number;
}

export interface DirectoryStat {
	path: string;
	read_count: number;
	edit_count: number;
	write_count: number;
	total: number;
}

export interface FileInsightRecord {
	path: string;
	read_count: number;
	edit_count: number;
	write_count: number;
	total_count: number;
	distinct_session_count: number;
}

export interface ProjectFileStats {
	project_path: string;
	total_sessions: number;
	tool_distribution: NameCount[];
	read_files: NameCount[];
	edit_files: NameCount[];
	write_files: NameCount[];
	bash_commands: NameCount[];
	directory_stats: DirectoryStat[];
	activity_by_date: DayCount[];
	file_insights: FileInsightRecord[];
}

export async function get_project_file_stats(
	project_path: string,
	range_days: number,
): Promise<ProjectFileStats> {
	const all = await session_cache.get_or_init();
	const project_sessions = filter_sessions(all, project_path, range_days);

	const total_sessions = project_sessions.length;

	// Tool distribution
	const tool_map = new Map<string, number>();
	for (const s of project_sessions) {
		for (const [name, tc] of Object.entries(s.tool_calls)) {
			tool_map.set(name, (tool_map.get(name) ?? 0) + tc.calls);
		}
	}
	const tool_distribution: NameCount[] = Array.from(tool_map.entries()).map(
		([name, count]) => ({ name, count }),
	);
	tool_distribution.sort((a, b) => b.count - a.count);

	// Aggregate file maps + track distinct sessions per file
	const read_map = new Map<string, number>();
	const edit_map = new Map<string, number>();
	const write_map = new Map<string, number>();
	const bash_map = new Map<string, number>();
	const file_sessions = new Map<string, Set<string>>();

	for (const s of project_sessions) {
		for (const [k, v] of Object.entries(s.read_files)) {
			read_map.set(k, (read_map.get(k) ?? 0) + v);
			let set = file_sessions.get(k);
			if (!set) {
				set = new Set();
				file_sessions.set(k, set);
			}
			set.add(s.id);
		}
		for (const [k, v] of Object.entries(s.edit_files)) {
			edit_map.set(k, (edit_map.get(k) ?? 0) + v);
			let set = file_sessions.get(k);
			if (!set) {
				set = new Set();
				file_sessions.set(k, set);
			}
			set.add(s.id);
		}
		for (const [k, v] of Object.entries(s.write_files)) {
			write_map.set(k, (write_map.get(k) ?? 0) + v);
			let set = file_sessions.get(k);
			if (!set) {
				set = new Set();
				file_sessions.set(k, set);
			}
			set.add(s.id);
		}
		for (const [k, v] of Object.entries(s.bash_commands)) {
			bash_map.set(k, (bash_map.get(k) ?? 0) + v);
		}
	}

	const make_sorted = (m: Map<string, number>): NameCount[] => {
		const arr: NameCount[] = Array.from(m.entries()).map(([name, count]) => ({
			name,
			count,
		}));
		arr.sort((a, b) => b.count - a.count);
		return arr;
	};

	const read_files = make_sorted(read_map);
	const edit_files = make_sorted(edit_map);
	const write_files = make_sorted(write_map);
	const bash_commands = make_sorted(bash_map);

	// Directory stats from file paths
	const dir_read = new Map<string, number>();
	const dir_edit = new Map<string, number>();
	const dir_write = new Map<string, number>();

	const parent_dir = (file_path: string): string => {
		const dir = path.dirname(file_path);
		return dir === "" ? "." : dir;
	};

	for (const [p, count] of read_map) {
		const d = parent_dir(p);
		dir_read.set(d, (dir_read.get(d) ?? 0) + count);
	}
	for (const [p, count] of edit_map) {
		const d = parent_dir(p);
		dir_edit.set(d, (dir_edit.get(d) ?? 0) + count);
	}
	for (const [p, count] of write_map) {
		const d = parent_dir(p);
		dir_write.set(d, (dir_write.get(d) ?? 0) + count);
	}

	const all_dirs = new Set<string>([
		...dir_read.keys(),
		...dir_edit.keys(),
		...dir_write.keys(),
	]);

	const directory_stats: DirectoryStat[] = Array.from(all_dirs).map(
		(dir_path) => {
			const read_count = dir_read.get(dir_path) ?? 0;
			const edit_count = dir_edit.get(dir_path) ?? 0;
			const write_count = dir_write.get(dir_path) ?? 0;
			const total = read_count + edit_count + write_count;
			return { path: dir_path, read_count, edit_count, write_count, total };
		},
	);
	directory_stats.sort((a, b) => b.total - a.total);

	// Activity by date
	const date_map = new Map<string, number>();
	for (const s of project_sessions) {
		const dt = parse_timestamp(s.started_at);
		if (dt !== null) {
			const date = format_local_date(dt);
			date_map.set(date, (date_map.get(date) ?? 0) + 1);
		}
	}
	const activity_by_date: DayCount[] = Array.from(date_map.entries()).map(
		([date, count]) => ({ date, count }),
	);
	activity_by_date.sort((a, b) => a.date.localeCompare(b.date));

	// Build unified file insight records
	const all_file_paths = new Set<string>([
		...read_map.keys(),
		...edit_map.keys(),
		...write_map.keys(),
	]);

	const file_insights: FileInsightRecord[] = Array.from(all_file_paths).map(
		(file_path) => {
			const read_count = read_map.get(file_path) ?? 0;
			const edit_count = edit_map.get(file_path) ?? 0;
			const write_count = write_map.get(file_path) ?? 0;
			const total_count = read_count + edit_count + write_count;
			const distinct_session_count = file_sessions.get(file_path)?.size ?? 0;
			return {
				path: file_path,
				read_count,
				edit_count,
				write_count,
				total_count,
				distinct_session_count,
			};
		},
	);
	file_insights.sort((a, b) => b.total_count - a.total_count);

	return {
		project_path,
		total_sessions,
		tool_distribution,
		read_files,
		edit_files,
		write_files,
		bash_commands,
		directory_stats,
		activity_by_date,
		file_insights,
	};
}
