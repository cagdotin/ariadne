/**
 * Worker thread for analytics cache building.
 *
 * Receives the sessions root path via workerData and posts back
 * the parsed SessionSummary[] array. This offloads CPU/filesystem-heavy
 * session discovery + parsing from the main backend event loop.
 */

import { parentPort, workerData } from "node:worker_threads";

import { discover_session_files } from "../analytics/discovery.js";
import { parse_session_file } from "../analytics/session-parser.js";
import type { SessionSummary } from "../analytics/session-types.js";

interface WorkerInput {
	sessions_root: string | undefined;
}

function run_build(input: WorkerInput): SessionSummary[] {
	// Set the env var so discovery uses the correct root
	if (input.sessions_root !== undefined) {
		process.env.ARIADNE_PI_SESSIONS_ROOT = input.sessions_root;
	}

	const session_files = discover_session_files();
	const all_sessions: SessionSummary[] = [];

	for (const session_file of session_files) {
		const session = parse_session_file(session_file);
		if (session !== null) {
			all_sessions.push(session);
		}
	}

	return all_sessions;
}

// ---- Entry point: run immediately when the worker starts --------------------

const input = workerData as WorkerInput;
const result = run_build(input);
parentPort?.postMessage(result);
