import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
	find_codex_binary,
	make_error_snapshot,
} from "../../../backend/provider-limits/codex";

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	return {
		...original,
		existsSync: vi.fn(() => false),
	};
});

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
	execSync: vi.fn(() => {
		throw new Error("not found");
	}),
}));

// ── epoch_to_rfc3339 (tested indirectly via make_error_snapshot behavior) ──
// epoch_to_rfc3339 is not exported, but we can test its contract through
// the normalize_window functions that use it. Since those are also internal,
// we test the exported helpers and the data shapes they produce.

describe("make_error_snapshot", () => {
	it("creates a well-formed error snapshot", () => {
		const snap = make_error_snapshot("rpc failed");
		expect(snap.provider_id).toBe("codex");
		expect(snap.provider_label).toBe("Codex");
		expect(snap.status).toBe("error");
		expect(snap.source).toBe("none");
		expect(snap.source_confidence).toBe("low");
		expect(snap.error_message).toBe("rpc failed");
		expect(snap.windows).toEqual([]);
		expect(snap.credits).toBeNull();
		expect(snap.stale_after_seconds).toBe(900);
	});

	it("sets fetched_at to a valid ISO timestamp", () => {
		const snap = make_error_snapshot("err");
		const parsed = new Date(snap.fetched_at);
		expect(parsed.getTime()).not.toBeNaN();
	});

	it("handles empty error message", () => {
		const snap = make_error_snapshot("");
		expect(snap.error_message).toBe("");
	});

	it("handles long error messages", () => {
		const long = "x".repeat(1000);
		const snap = make_error_snapshot(long);
		expect(snap.error_message).toBe(long);
	});
});

describe("find_codex_binary", () => {
	it("returns null when no binary is found", () => {
		vi.mocked(existsSync).mockReturnValue(false);
		expect(find_codex_binary()).toBeNull();
	});

	it("returns first existing candidate", () => {
		vi.mocked(existsSync).mockImplementation((p) => {
			return String(p) === "/opt/homebrew/bin/codex";
		});
		expect(find_codex_binary()).toBe("/opt/homebrew/bin/codex");
	});

	it("checks home .bun/bin path first", () => {
		const checked: string[] = [];
		vi.mocked(existsSync).mockImplementation((p) => {
			checked.push(String(p));
			return false;
		});
		find_codex_binary();
		// First candidate should be ~/.bun/bin/codex
		expect(checked[0]).toContain(".bun/bin/codex");
	});
});
