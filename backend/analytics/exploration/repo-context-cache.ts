import type { RepoContextResult } from "./repo-context.js";
import { build_repo_context } from "./repo-context.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
	result: RepoContextResult;
	built_at: number;
	explored_key: string; // sorted explored paths joined, for invalidation on change
}

const cache = new Map<string, CacheEntry>();

function make_explored_key(explored_paths: string[]): string {
	return [...explored_paths].sort().join("\0");
}

/**
 * Returns a cached repo context if available and fresh, otherwise builds one.
 * Cache is keyed by project_root and invalidated when explored_paths change
 * or the TTL expires.
 */
export async function get_or_build_repo_context(
	project_root: string,
	explored_paths: string[],
	ttl_ms: number = DEFAULT_TTL_MS,
): Promise<RepoContextResult> {
	const explored_key = make_explored_key(explored_paths);
	const cached = cache.get(project_root);

	if (cached) {
		const age = Date.now() - cached.built_at;
		if (age < ttl_ms && cached.explored_key === explored_key) {
			return cached.result;
		}
	}

	const result = await build_repo_context(project_root, explored_paths);

	cache.set(project_root, {
		result,
		built_at: Date.now(),
		explored_key,
	});

	return result;
}

/**
 * Removes a cached repo context for the given project root.
 */
export function invalidate_repo_context(project_root: string): void {
	cache.delete(project_root);
}
