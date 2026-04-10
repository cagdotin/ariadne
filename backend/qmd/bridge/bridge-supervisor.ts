// ---- BridgeSupervisor: manages the QMD bridge child process lifecycle -------
//
// Faithful port of the prior QMD bridge supervisor from the legacy QMD bridge supervisor.
// Ensures one active bridge process, handles index switching, and delegates
// JSON-RPC calls through the BridgeClient.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolve_index_db_path } from "../index-paths.js";
import { BridgeClient } from "./bridge-client.js";

// ---- Helpers ----------------------------------------------------------------

const is_dev = process.env.NODE_ENV === "development";

/**
 * Resolve the project root from the backend dist output.
 *
 * In dev the backend is bundled to backend/dist/index.js — the current
 * file lives in the dist folder, so project root is two levels up.
 * In a packaged Electron app the asar layout mirrors the repo structure
 * so the same relative traversal applies.
 *
 * Uses import.meta.url instead of __dirname since the backend is ESM.
 */
function get_project_root(): string {
	const current_dir = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(current_dir, "..", "..");
}

/**
 * Find the bridge entry point and the runtime to execute it.
 *
 * Dev mode  — run the TypeScript source via `bun run` for fast iteration.
 * Prod mode — run the pre-built JS bundle via `node` (shipped by Electron).
 */
function resolve_bridge(): {
	script_path: string;
	runtime: string;
	runtime_args: string[];
} {
	const project_root = get_project_root();

	if (is_dev) {
		// Dev: prefer the raw .ts source so edits take effect immediately.
		const ts_path = path.join(project_root, "src-sidecar", "qmd-bridge.ts");
		if (!fs.existsSync(ts_path)) {
			throw new Error(`Bridge TypeScript source not found at ${ts_path}`);
		}
		const { runtime, runtime_args } = find_dev_runtime();
		return { script_path: ts_path, runtime, runtime_args };
	}

	// Production: use the pre-compiled JS bundle with node.
	const js_path = path.join(
		project_root,
		"src-sidecar",
		"dist",
		"qmd-bridge.js",
	);
	if (!fs.existsSync(js_path)) {
		throw new Error(`Bridge JS bundle not found at ${js_path}`);
	}
	return { script_path: js_path, runtime: process.execPath, runtime_args: [] };
}

/**
 * Detect the runtime to use for running TypeScript in dev mode.
 * Tries bun first, falls back to npx tsx.
 */
function find_dev_runtime(): { runtime: string; runtime_args: string[] } {
	try {
		execSync("bun --version", { stdio: "ignore" });
		return { runtime: "bun", runtime_args: ["run"] };
	} catch {
		// bun not available
	}

	try {
		execSync("node --version", { stdio: "ignore" });
		return { runtime: "npx", runtime_args: ["tsx"] };
	} catch {
		// node not available
	}

	throw new Error("Neither bun nor node found on PATH");
}

/**
 * Get the default db path if it exists.
 * Matches Rust get_default_db_path.
 */
function get_default_db_path(): string | null {
	const db_path = resolve_index_db_path("default");
	if (fs.existsSync(db_path)) {
		return db_path;
	}
	return null;
}

// ---- BridgeSupervisor -------------------------------------------------------

export class BridgeSupervisor {
	private client: BridgeClient | null = null;
	private current_index: string | null = null;

	/**
	 * Ensure the bridge process is running. Spawns it if not.
	 * Matches Rust the prior QMD bridge supervisor::ensure_running.
	 */
	async ensure_running(): Promise<void> {
		// Check if existing client is still alive
		if (this.client !== null) {
			if (this.client.is_alive()) {
				return;
			}
			// Process died — clear state and respawn
			this.client = null;
			this.current_index = null;
		}

		// Spawn a new bridge process
		const {
			script_path: bridge_script,
			runtime,
			runtime_args,
		} = resolve_bridge();
		const default_db_path = get_default_db_path();

		// In production, the runtime is the Electron binary — set ELECTRON_RUN_AS_NODE
		// so it behaves as a plain Node process (no Chromium initialization).
		const extra_env = is_dev ? undefined : { ELECTRON_RUN_AS_NODE: "1" };

		const client = new BridgeClient();
		client.spawn(
			bridge_script,
			runtime,
			runtime_args,
			default_db_path,
			extra_env,
		);

		this.client = client;

		// Verify with ping (matches Rust behavior)
		try {
			const ping_result = (await client.send_and_read("ping", {})) as Record<
				string,
				unknown
			>;
			if (ping_result.ok !== true) {
				throw new Error(`Sidecar ping failed: ${JSON.stringify(ping_result)}`);
			}
		} catch (err) {
			// Ping failed — kill and reset
			client.kill();
			this.client = null;
			this.current_index = null;
			throw err;
		}

		// Set current index after successful ping
		this.current_index = default_db_path;
	}

	/**
	 * Ensure the bridge has the specified index open.
	 * Sends switch_index if the current index differs.
	 * Matches Rust the prior QMD bridge supervisor::ensure_index.
	 */
	async ensure_index(db_path: string): Promise<void> {
		await this.ensure_running();

		if (this.current_index !== db_path) {
			await this.client?.send_and_read("switch_index", { db_path });
			this.current_index = db_path;
		}
	}

	/**
	 * Send a JSON-RPC call to the bridge and return the result.
	 * Matches Rust the prior QMD bridge supervisor::call_blocking.
	 */
	async call(
		method: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		await this.ensure_running();
		return this.client?.send_and_read(method, params);
	}

	/**
	 * Send a JSON-RPC call with progress event forwarding.
	 * Matches Rust the prior QMD bridge supervisor::call_with_progress_blocking.
	 */
	async call_with_progress(
		method: string,
		params: Record<string, unknown>,
		event_channel: string,
	): Promise<unknown> {
		await this.ensure_running();
		return this.client?.send_and_read_with_progress(
			method,
			params,
			event_channel,
		);
	}

	/**
	 * Shutdown the bridge process.
	 * Matches Rust the prior QMD bridge supervisor::shutdown.
	 */
	shutdown(): void {
		if (this.client) {
			this.client.kill();
			this.client = null;
		}
		this.current_index = null;
	}
}

// ---- Singleton export -------------------------------------------------------

export const bridge_supervisor = new BridgeSupervisor();
