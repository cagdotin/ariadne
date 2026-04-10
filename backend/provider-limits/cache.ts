// ---- Provider limits cache (faithful port of the legacy provider-limits cache) ----

import { fetch_codex_limits } from "./codex.js";
import type {
	ProviderLimitSnapshot,
	ProviderLimitsResponse,
} from "./models.js";

const STALE_THRESHOLD_SECONDS = 900;

function maybe_mark_stale(
	snapshot: ProviderLimitSnapshot,
	now: Date,
): ProviderLimitSnapshot {
	// Don't overwrite error status
	if (snapshot.status === "error") {
		return snapshot;
	}

	const fetched = new Date(snapshot.fetched_at);
	if (Number.isNaN(fetched.getTime())) {
		return snapshot;
	}

	const age_secs = Math.floor((now.getTime() - fetched.getTime()) / 1000);
	if (age_secs > STALE_THRESHOLD_SECONDS) {
		return { ...snapshot, status: "stale" };
	}

	return snapshot;
}

class ProviderLimitsCache {
	private data: ProviderLimitSnapshot[] | null = null;
	private last_fetched_at: Date | null = null;
	private refreshing: boolean = false;

	get last_fetched(): Date | null {
		return this.last_fetched_at;
	}

	async get(): Promise<ProviderLimitsResponse> {
		if (this.data !== null) {
			const now = new Date();
			return this.data.map((s) => maybe_mark_stale(s, now));
		}

		// No cached data -- do a synchronous fetch.
		return this.refresh();
	}

	async refresh(): Promise<ProviderLimitsResponse> {
		// Guard against concurrent refreshes.
		if (this.refreshing) {
			return this.data ?? [];
		}

		this.refreshing = true;

		try {
			const providers: ProviderLimitSnapshot[] = [];

			// Phase 1: Codex
			const codex_snapshot = await fetch_codex_limits();
			providers.push(codex_snapshot);

			// Update cache
			this.data = providers;
			this.last_fetched_at = new Date();

			return providers;
		} finally {
			this.refreshing = false;
		}
	}
}

// Singleton instance
export const provider_limits_cache = new ProviderLimitsCache();
