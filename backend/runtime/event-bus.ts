// ---- Event bus: pushes BackendEvent messages to the parent process ----------

import type { BackendEvent } from "./protocol.js";

export function emit_event(channel: string, payload: unknown): void {
  if (typeof process.send !== "function") {
    console.warn("[event-bus] process.send unavailable — not running as a child process");
    return;
  }

  const message: BackendEvent = { event: channel, payload };
  process.send(message);
}
