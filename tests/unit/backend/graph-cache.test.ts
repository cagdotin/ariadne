import { beforeEach, describe, expect, it } from "vitest";
import {
	MAX_CACHE_ENTRIES,
	REPLAY_CACHE_TTL_MS,
	clear_graph_cache,
	get_cached_graph,
	set_cached_graph,
} from "../../../backend/analytics/graph/graph-cache";
import type { SessionGraphPayload } from "../../../contracts/graph/types";

function make_payload(session_id: string): SessionGraphPayload {
	return {
		session_id,
		project_path: "/project",
		nodes: [],
		edges: [],
		has_repo_context: false,
		derived_at: "2026-04-13T10:00:00Z",
	};
}

describe("graph-cache", () => {
	beforeEach(() => {
		clear_graph_cache();
	});

	it("returns null for uncached session", () => {
		expect(get_cached_graph("unknown")).toBeNull();
	});

	it("returns cached payload within TTL", () => {
		const payload = make_payload("sess-1");
		const now = 1000000;
		set_cached_graph("sess-1", payload, now);
		expect(get_cached_graph("sess-1", now + 1000)).toEqual(payload);
	});

	it("returns null after TTL expires", () => {
		const payload = make_payload("sess-1");
		const now = 1000000;
		set_cached_graph("sess-1", payload, now);
		expect(get_cached_graph("sess-1", now + REPLAY_CACHE_TTL_MS + 1)).toBeNull();
	});

	it("returns payload at exact TTL boundary", () => {
		const payload = make_payload("sess-1");
		const now = 1000000;
		set_cached_graph("sess-1", payload, now);
		// At exact boundary, TTL hasn't elapsed yet
		expect(get_cached_graph("sess-1", now + REPLAY_CACHE_TTL_MS)).toEqual(payload);
	});

	it("removes expired entry from cache on access", () => {
		const payload = make_payload("sess-1");
		const now = 1000000;
		set_cached_graph("sess-1", payload, now);
		// First access after expiry returns null and cleans up
		expect(get_cached_graph("sess-1", now + REPLAY_CACHE_TTL_MS + 1)).toBeNull();
		// Second access also returns null (entry was removed)
		expect(get_cached_graph("sess-1", now)).toBeNull();
	});

	it("clear_graph_cache removes all entries", () => {
		set_cached_graph("a", make_payload("a"));
		set_cached_graph("b", make_payload("b"));
		clear_graph_cache();
		expect(get_cached_graph("a")).toBeNull();
		expect(get_cached_graph("b")).toBeNull();
	});

	it("evicts oldest entry when exceeding max cache size", () => {
		const base_time = 1000000;
		// Fill cache to the max
		for (let i = 0; i < MAX_CACHE_ENTRIES; i++) {
			set_cached_graph(`sess-${i}`, make_payload(`sess-${i}`), base_time + i);
		}
		// All entries should be accessible
		expect(get_cached_graph("sess-0", base_time + MAX_CACHE_ENTRIES)).not.toBeNull();

		// Add one more — should evict sess-0 (oldest)
		set_cached_graph(
			"sess-overflow",
			make_payload("sess-overflow"),
			base_time + MAX_CACHE_ENTRIES,
		);
		expect(get_cached_graph("sess-0", base_time + MAX_CACHE_ENTRIES)).toBeNull();
		expect(get_cached_graph("sess-overflow", base_time + MAX_CACHE_ENTRIES)).not.toBeNull();
		// Other entries should still be there
		expect(get_cached_graph("sess-1", base_time + MAX_CACHE_ENTRIES)).not.toBeNull();
	});

	it("overwrites existing entry with fresh timestamp", () => {
		const now = 1000000;
		set_cached_graph("sess-1", make_payload("sess-1"), now);
		// Overwrite at a later time
		const updated = make_payload("sess-1");
		updated.has_repo_context = true;
		set_cached_graph("sess-1", updated, now + REPLAY_CACHE_TTL_MS);
		// Should be accessible for another full TTL from the new timestamp
		expect(
			get_cached_graph("sess-1", now + REPLAY_CACHE_TTL_MS + REPLAY_CACHE_TTL_MS),
		)?.toEqual(updated);
	});
});
