// ---- Backend supervisor: manages the backend child process from Electron main

import { type ChildProcess, fork } from "node:child_process";
import crypto from "node:crypto";
import {
	type BackendErrorResponse,
	type BackendRequest,
	type BackendResponse,
	is_backend_event,
	is_backend_ready,
	is_backend_response,
} from "../../backend/runtime/protocol.js";
import { get_backend_entry_path } from "./paths.js";

// ---- State ------------------------------------------------------------------

let backend_process: ChildProcess | null = null;
let has_restarted = false;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
};

const pending_requests = new Map<string, PendingRequest>();
const event_callbacks: Array<(event: string, payload: unknown) => void> = [];

const HANDSHAKE_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

// ---- Public API -------------------------------------------------------------

export function start_backend(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		backend_process = fork(get_backend_entry_path(), [], {
			stdio: ["pipe", "pipe", "pipe", "ipc"],
		});

		// Forward child stdout/stderr to main console
		backend_process.stdout?.on("data", (data: Buffer) => {
			console.log(`[backend] ${data.toString().trimEnd()}`);
		});
		backend_process.stderr?.on("data", (data: Buffer) => {
			console.error(`[backend] ${data.toString().trimEnd()}`);
		});

		const handshake_timer = setTimeout(() => {
			reject(new Error("Backend handshake timed out"));
			cleanup_process();
		}, HANDSHAKE_TIMEOUT_MS);

		backend_process.on("message", (msg: unknown) => {
			if (is_backend_ready(msg)) {
				clearTimeout(handshake_timer);
				console.log("[supervisor] backend ready");
				resolve();
				return;
			}

			if (is_backend_response(msg)) {
				const typed = msg as BackendResponse | BackendErrorResponse;
				const pending = pending_requests.get(typed.id);
				if (pending) {
					clearTimeout(pending.timer);
					pending_requests.delete(typed.id);
					if (typed.ok) {
						pending.resolve(typed.result);
					} else {
						pending.reject(new Error(typed.error.message));
					}
				}
				return;
			}

			if (is_backend_event(msg)) {
				for (const cb of event_callbacks) {
					try {
						cb(msg.event, msg.payload);
					} catch (err) {
						console.error("[supervisor] event callback error:", err);
					}
				}
				return;
			}
		});

		backend_process.on("exit", (code, signal) => {
			console.warn(
				`[supervisor] backend exited (code=${code}, signal=${signal})`,
			);
			backend_process = null;

			// Reject all pending requests
			for (const [id, pending] of pending_requests) {
				clearTimeout(pending.timer);
				pending.reject(new Error("Backend process exited"));
				pending_requests.delete(id);
			}

			// Auto-restart once
			if (!has_restarted && code !== 0) {
				has_restarted = true;
				console.log("[supervisor] attempting auto-restart...");
				start_backend().catch((err) => {
					console.error("[supervisor] auto-restart failed:", err);
				});
			}
		});

		backend_process.on("error", (err) => {
			console.error("[supervisor] backend process error:", err);
			clearTimeout(handshake_timer);
			reject(err);
		});
	});
}

export function stop_backend(): Promise<void> {
	return new Promise<void>((resolve) => {
		if (!backend_process) {
			resolve();
			return;
		}

		const force_kill_timer = setTimeout(() => {
			if (backend_process) {
				console.warn("[supervisor] force killing backend");
				backend_process.kill("SIGKILL");
				backend_process = null;
			}
			resolve();
		}, SHUTDOWN_TIMEOUT_MS);

		backend_process.once("exit", () => {
			clearTimeout(force_kill_timer);
			backend_process = null;
			resolve();
		});

		backend_process.kill("SIGTERM");
	});
}

export function send_request(
	channel: string,
	payload: Record<string, unknown>,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		if (!backend_process) {
			reject(new Error("Backend process is not running"));
			return;
		}

		const id = crypto.randomUUID();

		const timer = setTimeout(() => {
			pending_requests.delete(id);
			reject(new Error(`Request to "${channel}" timed out`));
		}, REQUEST_TIMEOUT_MS);

		pending_requests.set(id, { resolve, reject, timer });

		const request: BackendRequest = { id, channel, payload };
		backend_process.send(request);
	});
}

export function on_backend_event(
	callback: (event: string, payload: unknown) => void,
): void {
	event_callbacks.push(callback);
}

// ---- Internal ---------------------------------------------------------------

function cleanup_process(): void {
	if (backend_process) {
		backend_process.kill("SIGKILL");
		backend_process = null;
	}
}
