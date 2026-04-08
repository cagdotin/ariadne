// ---- BridgeSupervisor: manages the QMD bridge child process lifecycle -------
//
// Faithful port of QmdSidecar from src-tauri/src/sidecar.rs.
// Ensures one active bridge process, handles index switching, and delegates
// JSON-RPC calls through the BridgeClient.

import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

import { BridgeClient } from "./bridge-client.js";
import { resolve_index_db_path } from "../index-paths.js";

// ---- Helpers ----------------------------------------------------------------

/**
 * Find the bridge script path.
 * Matches Rust find_bridge_script — looks for src-sidecar/qmd-bridge.ts
 * relative to the project root.
 */
function find_bridge_script(): string {
  // __dirname equivalent: this file is at backend/qmd/bridge/bridge-supervisor.ts
  // project root is 3 levels up
  const project_root = path.resolve(__dirname, "..", "..", "..");
  const bridge_path = path.join(project_root, "src-sidecar", "qmd-bridge.ts");

  if (!fs.existsSync(bridge_path)) {
    throw new Error(`Bridge script not found at ${bridge_path}`);
  }

  return bridge_path;
}

/**
 * Detect the runtime to use for running TypeScript.
 * Matches Rust find_runtime — tries bun first, falls back to npx tsx.
 */
function find_runtime(): { runtime: string; runtime_args: string[] } {
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
   * Matches Rust QmdSidecar::ensure_running.
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
    const bridge_script = find_bridge_script();
    const { runtime, runtime_args } = find_runtime();
    const default_db_path = get_default_db_path();

    const client = new BridgeClient();
    client.spawn(bridge_script, runtime, runtime_args, default_db_path);

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
   * Matches Rust QmdSidecar::ensure_index.
   */
  async ensure_index(db_path: string): Promise<void> {
    await this.ensure_running();

    if (this.current_index !== db_path) {
      await this.client!.send_and_read("switch_index", { db_path });
      this.current_index = db_path;
    }
  }

  /**
   * Send a JSON-RPC call to the bridge and return the result.
   * Matches Rust QmdSidecar::call_blocking.
   */
  async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensure_running();
    return this.client!.send_and_read(method, params);
  }

  /**
   * Send a JSON-RPC call with progress event forwarding.
   * Matches Rust QmdSidecar::call_with_progress_blocking.
   */
  async call_with_progress(
    method: string,
    params: Record<string, unknown>,
    event_channel: string,
  ): Promise<unknown> {
    await this.ensure_running();
    return this.client!.send_and_read_with_progress(
      method,
      params,
      event_channel,
    );
  }

  /**
   * Shutdown the bridge process.
   * Matches Rust QmdSidecar::shutdown.
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
