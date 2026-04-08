// ---- Request router: maps channel names to handler functions ----------------

export type RequestHandler = (
  payload: Record<string, unknown>,
) => Promise<unknown>;

const handlers = new Map<string, RequestHandler>();

export function register_handler(
  channel: string,
  handler: RequestHandler,
): void {
  if (handlers.has(channel)) {
    console.warn(`[request-router] overwriting handler for channel "${channel}"`);
  }
  handlers.set(channel, handler);
}

export async function route_request(
  channel: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel "${channel}"`);
  }
  return handler(payload);
}
