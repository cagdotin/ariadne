// ---- IPC envelope types for main <-> backend communication --------------------

export type BackendRequest = {
  id: string;
  channel: string;
  payload: Record<string, unknown>;
};

export type BackendResponse = {
  id: string;
  ok: true;
  result: unknown;
};

export type BackendErrorResponse = {
  id: string;
  ok: false;
  error: { code: string; message: string };
};

export type BackendEvent = {
  event: string;
  payload: unknown;
};

export type BackendReady = {
  type: "ready";
};

export type BackendMessage =
  | BackendResponse
  | BackendErrorResponse
  | BackendEvent
  | BackendReady;

export type MainMessage = BackendRequest;

// ---- Type guards ------------------------------------------------------------

export function is_backend_ready(msg: unknown): msg is BackendReady {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as Record<string, unknown>).type === "ready"
  );
}

export function is_backend_event(msg: unknown): msg is BackendEvent {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "event" in msg &&
    typeof (msg as Record<string, unknown>).event === "string"
  );
}

export function is_backend_response(
  msg: unknown,
): msg is BackendResponse | BackendErrorResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "id" in msg &&
    "ok" in msg
  );
}
