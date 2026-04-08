// ---- BridgeClient: JSON-RPC over stdin/stdout with a child process ----------
//
// Faithful port of the send_and_read / send_and_read_with_progress methods
// from the legacy QMD bridge supervisor.

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

import { emit_event } from "../../runtime/event-bus.js";

// ---- Types ------------------------------------------------------------------

interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  event?: string;
  data?: unknown;
}

// ---- BridgeClient -----------------------------------------------------------

export class BridgeClient {
  private child: ChildProcess | null = null;
  private next_id: number = 1;
  private stdout_reader: ReadlineInterface | null = null;
  private pending_lines: string[] = [];
  private line_waiters: Array<(line: string) => void> = [];

  /**
   * Spawn the bridge child process.
   * Matches the Rust spawn logic in the prior QMD bridge supervisor::ensure_running.
   */
  spawn(
    script_path: string,
    runtime: string,
    runtime_args: string[],
    default_db_path: string | null,
  ): void {
    const args = [...runtime_args, script_path];
    if (default_db_path) {
      args.push("--db-path", default_db_path);
    }

    this.child = spawn(runtime, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Forward stderr to our stderr for diagnostics
    this.child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    // Set up line-by-line reading of stdout
    this.stdout_reader = createInterface({
      input: this.child.stdout!,
      terminal: false,
    });

    this.stdout_reader.on("line", (line: string) => {
      if (this.line_waiters.length > 0) {
        const waiter = this.line_waiters.shift()!;
        waiter(line);
      } else {
        this.pending_lines.push(line);
      }
    });

    this.stdout_reader.on("close", () => {
      // Signal all waiting readers that the stream closed
      const waiters = this.line_waiters.splice(0);
      for (const waiter of waiters) {
        waiter("");
      }
    });
  }

  /**
   * Check if the child process is still alive.
   * Matches the Rust try_wait check in ensure_running.
   */
  is_alive(): boolean {
    if (!this.child) return false;
    // exitCode is null if the process is still running
    return this.child.exitCode === null;
  }

  /**
   * Kill the child process.
   * Matches the Rust shutdown logic.
   */
  kill(): void {
    if (!this.child) return;

    // Close stdin to signal EOF (like Rust's drop(proc.stdin))
    try {
      this.child.stdin?.end();
    } catch {
      // ignore
    }

    // Kill if still alive
    if (this.child.exitCode === null) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
    }

    this.stdout_reader?.close();
    this.stdout_reader = null;
    this.child = null;
    this.pending_lines = [];
    this.line_waiters = [];
  }

  /**
   * Send a JSON-RPC request and read until we get a matching response.
   * Skips progress events. Faithful port of Rust send_and_read.
   */
  async send_and_read(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.next_id++;

    const request = JSON.stringify({ id, method, params }) + "\n";
    this.write_to_stdin(request);

    // Read lines until we get a matching response
    while (true) {
      const line = await this.read_line();

      if (line === "") {
        throw new Error("Sidecar process closed stdout unexpectedly");
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(trimmed) as JsonRpcMessage;
      } catch (err) {
        throw new Error(
          `Failed to parse sidecar response: ${err} (line: ${trimmed})`,
        );
      }

      // Skip messages with non-matching id
      if (msg.id !== id) continue;

      // Skip progress events (matching Rust behavior)
      if (msg.event !== undefined) continue;

      if (msg.error) {
        throw new Error(msg.error.message ?? "Unknown sidecar error");
      }

      if (msg.result !== undefined) {
        return msg.result;
      }

      throw new Error(`Unexpected sidecar response: ${trimmed}`);
    }
  }

  /**
   * Send a JSON-RPC request and forward progress events to the event bus.
   * Faithful port of Rust send_and_read_with_progress.
   */
  async send_and_read_with_progress(
    method: string,
    params: Record<string, unknown>,
    event_channel: string,
  ): Promise<unknown> {
    const id = this.next_id++;

    const request = JSON.stringify({ id, method, params }) + "\n";
    this.write_to_stdin(request);

    while (true) {
      const line = await this.read_line();

      if (line === "") {
        throw new Error("Sidecar process closed stdout unexpectedly");
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(trimmed) as JsonRpcMessage;
      } catch (err) {
        throw new Error(
          `Failed to parse sidecar response: ${err} (line: ${trimmed})`,
        );
      }

      // Skip messages with non-matching id
      if (msg.id !== id) continue;

      // Forward progress events to the frontend via event bus
      if (msg.event !== undefined) {
        if (msg.data !== undefined) {
          emit_event(event_channel, msg.data);
        }
        continue;
      }

      if (msg.error) {
        throw new Error(msg.error.message ?? "Unknown sidecar error");
      }

      if (msg.result !== undefined) {
        return msg.result;
      }

      throw new Error(`Unexpected sidecar response: ${trimmed}`);
    }
  }

  // ---- Private helpers ------------------------------------------------------

  private write_to_stdin(data: string): void {
    if (!this.child || !this.child.stdin) {
      throw new Error("Sidecar not running");
    }
    this.child.stdin.write(data);
  }

  private read_line(): Promise<string> {
    // If we already have a buffered line, return it immediately
    if (this.pending_lines.length > 0) {
      return Promise.resolve(this.pending_lines.shift()!);
    }

    // Otherwise, wait for the next line
    return new Promise<string>((resolve) => {
      this.line_waiters.push(resolve);
    });
  }
}
