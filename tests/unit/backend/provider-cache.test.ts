import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the codex module to avoid spawning real processes
vi.mock("../../../backend/provider-limits/codex", () => ({
	fetch_codex_limits: vi.fn(),
}));

// We can't use the singleton, so we test the staleness logic directly
// by importing the module fresh or testing maybe_mark_stale behavior
// through the public API

import { provider_limits_cache } from "../../../backend/provider-limits/cache";
import { fetch_codex_limits } from "../../../backend/provider-limits/codex";
import type { ProviderLimitSnapshot } from "../../../backend/provider-limits/models";

function make_snapshot(
	overrides: Partial<ProviderLimitSnapshot> = {},
): ProviderLimitSnapshot {
	return {
		provider_id: "codex",
		provider_label: "Codex",
		account_label: null,
		plan_type: null,
		source: "codex-app-server",
		source_confidence: "high",
		status: "fresh",
		fetched_at: new Date().toISOString(),
		stale_after_seconds: 900,
		windows: [],
		credits: null,
		error_message: null,
		...overrides,
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("provider_limits_cache", () => {
	it("calls fetch_codex_limits on refresh", async () => {
		const snapshot = make_snapshot();
		vi.mocked(fetch_codex_limits).mockResolvedValue(snapshot);

		const result = await provider_limits_cache.refresh();
		expect(fetch_codex_limits).toHaveBeenCalledOnce();
		expect(result).toHaveLength(1);
		expect(result[0].provider_id).toBe("codex");
	});

	it("returns cached data on subsequent get calls", async () => {
		const snapshot = make_snapshot();
		vi.mocked(fetch_codex_limits).mockResolvedValue(snapshot);

		await provider_limits_cache.refresh();
		await provider_limits_cache.get();

		// get() uses cached data, so fetch_codex_limits should not be called again
		// (only refresh() was called before, so total is still 1 call for fetch)
		// Note: since provider_limits_cache is a singleton, previous tests may have populated it
		const call_count_before = vi.mocked(fetch_codex_limits).mock.calls.length;
		const result2 = await provider_limits_cache.get();
		expect(vi.mocked(fetch_codex_limits).mock.calls.length).toBe(
			call_count_before,
		);
		expect(result2).toHaveLength(1);
	});

	it("marks stale snapshots that exceed threshold", async () => {
		const old_time = new Date(Date.now() - 1000 * 1000).toISOString(); // 1000s ago
		const snapshot = make_snapshot({ fetched_at: old_time, status: "fresh" });
		vi.mocked(fetch_codex_limits).mockResolvedValue(snapshot);

		await provider_limits_cache.refresh();
		const result = await provider_limits_cache.get();

		expect(result[0].status).toBe("stale");
	});

	it("does not overwrite error status with stale", async () => {
		const snapshot = make_snapshot({
			fetched_at: new Date(Date.now() - 2000 * 1000).toISOString(),
			status: "error",
		});
		vi.mocked(fetch_codex_limits).mockResolvedValue(snapshot);

		await provider_limits_cache.refresh();
		const result = await provider_limits_cache.get();

		expect(result[0].status).toBe("error");
	});

	it("updates last_fetched timestamp on refresh", async () => {
		vi.mocked(fetch_codex_limits).mockResolvedValue(make_snapshot());

		const before = new Date();
		await provider_limits_cache.refresh();
		const after = new Date();

		expect(provider_limits_cache.last_fetched).not.toBeNull();
		expect(
			// biome-ignore lint/style/noNonNullAssertion: guarded by not-null assertion above
			provider_limits_cache.last_fetched!.getTime(),
		).toBeGreaterThanOrEqual(before.getTime());
		// biome-ignore lint/style/noNonNullAssertion: guarded by not-null assertion above
		expect(provider_limits_cache.last_fetched!.getTime()).toBeLessThanOrEqual(
			after.getTime(),
		);
	});
});
