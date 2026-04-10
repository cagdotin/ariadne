import { describe, expect, it } from "vitest";
import { make_error_snapshot } from "../../../backend/provider-limits/codex";

// Only testing the pure utility functions — probe_app_server and
// fallback_session_logs require spawning processes / reading real files.

describe("make_error_snapshot", () => {
	it("creates an error snapshot with the given message", () => {
		const snapshot = make_error_snapshot("something went wrong");

		expect(snapshot.provider_id).toBe("codex");
		expect(snapshot.provider_label).toBe("Codex");
		expect(snapshot.status).toBe("error");
		expect(snapshot.source).toBe("none");
		expect(snapshot.source_confidence).toBe("low");
		expect(snapshot.error_message).toBe("something went wrong");
		expect(snapshot.windows).toEqual([]);
		expect(snapshot.credits).toBeNull();
		expect(snapshot.account_label).toBeNull();
		expect(snapshot.plan_type).toBeNull();
	});

	it("sets fetched_at to current time", () => {
		const before = new Date().toISOString();
		const snapshot = make_error_snapshot("err");
		const after = new Date().toISOString();

		expect(snapshot.fetched_at >= before).toBe(true);
		expect(snapshot.fetched_at <= after).toBe(true);
	});

	it("sets stale_after_seconds to 900", () => {
		const snapshot = make_error_snapshot("err");
		expect(snapshot.stale_after_seconds).toBe(900);
	});
});
