/**
 * Session cache -- delegates CPU/filesystem-heavy cache building
 * to a worker thread so the backend event loop stays responsive.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { invalidate_qmd_log_cache } from "../qmd-logs/cache.js";
import type { SessionSummary } from "./session-types.js";

/**
 * Resolve the path to the bundled worker script.
 *
 * At runtime, the backend is bundled into `backend/dist/index.js`.
 * The worker is bundled alongside it as `backend/dist/analytics-build.worker.js`.
 *
 * During unbundled dev (e.g. tests running via Bun), we fall back to
 * the TypeScript source so the worker can be loaded directly.
 *
 * Uses import.meta.url instead of __dirname since the backend is ESM.
 */
function resolve_worker_path(): string {
	const current_dir = path.dirname(fileURLToPath(import.meta.url));
	const bundled = path.join(current_dir, "analytics-build.worker.js");

	// Check if the bundled file exists -- if not, use TS source
	if (fs.existsSync(bundled)) {
		return bundled;
	}

	// Fallback: resolve relative to this source file
	return path.resolve(
		current_dir,
		"..",
		"workers",
		"analytics-build.worker.ts",
	);
}

/**
 * Run session discovery + parsing inside a worker thread.
 * Returns a promise that resolves to the parsed sessions or rejects on failure.
 */
function build_in_worker(): Promise<SessionSummary[]> {
	const sessions_root =
		process.env.ARIADNE_PI_SESSIONS_ROOT ??
		path.join(os.homedir(), ".pi", "agent", "sessions");

	const worker_path = resolve_worker_path();

	return new Promise<SessionSummary[]>((resolve, reject) => {
		const worker = new Worker(worker_path, {
			workerData: { sessions_root },
		});

		worker.on("message", (data: SessionSummary[]) => {
			resolve(data);
		});

		worker.on("error", (err: Error) => {
			reject(new Error(`Analytics build worker failed: ${err.message}`));
		});

		worker.on("exit", (code: number) => {
			if (code !== 0) {
				reject(new Error(`Analytics build worker exited with code ${code}`));
			}
		});
	});
}

class SessionCache {
	private data: SessionSummary[] | null = null;
	private pending: Promise<SessionSummary[]> | null = null;

	/**
	 * Get all sessions from cache, initializing if needed.
	 */
	async get_or_init(): Promise<SessionSummary[]> {
		if (this.data !== null) {
			return this.data;
		}
		return this.resync();
	}

	/**
	 * Force resync -- clear cache and re-parse all sessions.
	 *
	 * If a build is already in progress, returns the existing promise
	 * rather than spawning a second worker.
	 */
	async resync(): Promise<SessionSummary[]> {
		if (this.pending !== null) {
			return this.pending;
		}

		this.pending = build_in_worker()
			.then((sessions) => {
				this.data = sessions;
				this.pending = null;

				// Invalidate QMD log cache so it rebuilds on next request
				try {
					invalidate_qmd_log_cache();
				} catch {
					// QMD log cache may not be wired yet -- skip
				}

				return sessions;
			})
			.catch((err) => {
				this.pending = null;
				throw err;
			});

		return this.pending;
	}
}

/** Singleton cache instance. */
export const session_cache = new SessionCache();
