/**
 * In-memory cache for derived session graphs with TTL-based freshness.
 *
 * Freshness policy:
 * - Replay-derived graph is cached per session_id with a configurable TTL.
 * - Ambient repo augmentation is always applied fresh on each request
 *   (handled in commands.ts by cloning the cached replay graph before augmenting).
 * - Cache entries expire after REPLAY_CACHE_TTL_MS (default: 5 minutes).
 * - Callers can force invalidation via clear_graph_cache().
 */

import type { SessionGraphPayload } from "../../../contracts/graph/types.js";

/** Default TTL for replay-derived graph cache entries: 5 minutes. */
export const REPLAY_CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum number of sessions to keep in the cache. Evicts oldest on insert. */
export const MAX_CACHE_ENTRIES = 20;

interface CacheEntry {
	payload: SessionGraphPayload;
	cached_at: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Get a cached replay graph if it exists and is within the freshness window.
 * Returns null if the entry has expired or does not exist.
 */
export function get_cached_graph(
	session_id: string,
	now: number = Date.now(),
): SessionGraphPayload | null {
	const entry = cache.get(session_id);
	if (!entry) return null;
	if (now - entry.cached_at > REPLAY_CACHE_TTL_MS) {
		cache.delete(session_id);
		return null;
	}
	return entry.payload;
}

/**
 * Store a replay-derived graph in the cache with a freshness timestamp.
 */
export function set_cached_graph(
	session_id: string,
	payload: SessionGraphPayload,
	now: number = Date.now(),
): void {
	cache.set(session_id, { payload, cached_at: now });

	// Evict oldest entries when cache exceeds size limit
	if (cache.size > MAX_CACHE_ENTRIES) {
		let oldest_key: string | null = null;
		let oldest_time = Infinity;
		for (const [key, entry] of cache) {
			if (entry.cached_at < oldest_time) {
				oldest_time = entry.cached_at;
				oldest_key = key;
			}
		}
		if (oldest_key) cache.delete(oldest_key);
	}
}

/**
 * Explicitly invalidate all cached graphs.
 */
export function clear_graph_cache(): void {
	cache.clear();
}
