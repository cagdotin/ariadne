// ---- Backend entry point: forked as a child process from Electron main ------

import type {
	BackendErrorResponse,
	BackendReady,
	BackendRequest,
	BackendResponse,
} from "./runtime/protocol.js";
import { route_request } from "./runtime/request-router.js";

// Register all stub handlers (side-effect import)
import "./stubs/index.js";

// Register real QMD handlers (overrides stubs)
import "./qmd/commands.js";

// Register real QMD log handlers (overrides stubs)
import "./qmd-logs/commands.js";

// Register real provider-limits handlers (overrides stubs)
import "./provider-limits/commands.js";

// Register real analytics handlers (overrides stubs)
import "./analytics/commands.js";

// Register exploration handlers
import "./analytics/exploration/commands.js";

// Register graph IR handlers
import "./analytics/graph/commands.js";

// ---- IPC message listener ---------------------------------------------------

function send_message(
	msg: BackendResponse | BackendErrorResponse | BackendReady,
): void {
	if (typeof process.send !== "function") {
		console.warn(
			"[backend] process.send unavailable — not running as a child process",
		);
		return;
	}
	process.send(msg);
}

function is_backend_request(msg: unknown): msg is BackendRequest {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"id" in msg &&
		"channel" in msg &&
		"payload" in msg
	);
}

process.on("message", async (raw: unknown) => {
	if (!is_backend_request(raw)) {
		console.warn("[backend] received malformed message:", raw);
		return;
	}

	const { id, channel, payload } = raw;

	try {
		const result = await route_request(channel, payload);
		send_message({ id, ok: true, result });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		send_message({
			id,
			ok: false,
			error: { code: "HANDLER_ERROR", message },
		});
	}
});

// ---- Graceful shutdown ------------------------------------------------------

process.on("SIGTERM", () => {
	process.exit(0);
});

// ---- Handshake: signal readiness to parent ----------------------------------

send_message({ type: "ready" });
