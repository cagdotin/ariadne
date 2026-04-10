/**
 * Session file discovery — faithful port of
 * the session-file discovery logic.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { SessionFile } from "./session-types";

/**
 * Walk a directory recursively, collecting all file paths.
 */
function walk_dir_recursive(dir: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const full_path = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walk_dir_recursive(full_path));
		} else if (entry.isFile()) {
			results.push(full_path);
		}
	}

	return results;
}

/**
 * Discover all .jsonl session files under the sessions root directory.
 *
 * Root is resolved from `ARIADNE_PI_SESSIONS_ROOT` env var, falling back
 * to `~/.pi/agent/sessions`.
 *
 * Returns files sorted alphabetically by file_name.
 */
export function discover_session_files(): SessionFile[] {
	const sessions_dir =
		process.env.ARIADNE_PI_SESSIONS_ROOT ??
		path.join(os.homedir(), ".pi", "agent", "sessions");

	if (!fs.existsSync(sessions_dir)) {
		return [];
	}

	const session_files: SessionFile[] = [];

	// Read first-level subdirectories (URL-encoded project paths)
	let top_entries: fs.Dirent[];
	try {
		top_entries = fs.readdirSync(sessions_dir, { withFileTypes: true });
	} catch {
		return [];
	}

	for (const top_entry of top_entries) {
		const top_path = path.join(sessions_dir, top_entry.name);

		if (!top_entry.isDirectory()) {
			continue;
		}

		const dir_name = top_entry.name;

		// Walk all files recursively within this project directory
		let all_files: string[];
		try {
			all_files = walk_dir_recursive(top_path);
		} catch {
			continue;
		}

		for (const file_path of all_files) {
			if (path.extname(file_path) !== ".jsonl") {
				continue;
			}

			const file_name = path.basename(file_path);

			let file_size = 0;
			try {
				const stat = fs.statSync(file_path);
				file_size = stat.size;
			} catch {
				// default to 0 on error, matching Rust unwrap_or(0)
			}

			session_files.push({
				path: file_path,
				dir_name,
				file_name,
				file_size,
			});
		}
	}

	// Sort by file_name alphabetically
	session_files.sort((a, b) => a.file_name.localeCompare(b.file_name));

	return session_files;
}
