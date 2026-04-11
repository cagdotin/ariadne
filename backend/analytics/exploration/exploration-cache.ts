/**
 * Simple in-memory cache for exploration payloads, keyed by session_id.
 */

import type { ExplorationPayload } from "../../../contracts/exploration/types.js";

const cache = new Map<string, ExplorationPayload>();

export function get_cached(session_id: string): ExplorationPayload | null {
	return cache.get(session_id) ?? null;
}

export function set_cached(
	session_id: string,
	payload: ExplorationPayload,
): void {
	cache.set(session_id, payload);
}

export function clear_cache(): void {
	cache.clear();
}
