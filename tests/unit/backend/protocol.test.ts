import { describe, expect, it } from "vitest";
import {
	is_backend_event,
	is_backend_ready,
	is_backend_response,
} from "../../../backend/runtime/protocol";

// ── is_backend_ready ────────────────────────────────────────────────────

describe("is_backend_ready", () => {
	it("returns true for valid ready message", () => {
		expect(is_backend_ready({ type: "ready" })).toBe(true);
	});

	it("returns false when type is wrong", () => {
		expect(is_backend_ready({ type: "notready" })).toBe(false);
	});

	it("returns false for null", () => {
		expect(is_backend_ready(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(is_backend_ready(undefined)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(is_backend_ready("ready")).toBe(false);
		expect(is_backend_ready(42)).toBe(false);
	});

	it("returns false when missing type field", () => {
		expect(is_backend_ready({ foo: "bar" })).toBe(false);
	});
});

// ── is_backend_event ────────────────────────────────────────────────────

describe("is_backend_event", () => {
	it("returns true for valid event message", () => {
		expect(is_backend_event({ event: "qmd:progress", payload: {} })).toBe(true);
	});

	it("returns false when event is not a string", () => {
		expect(is_backend_event({ event: 42, payload: {} })).toBe(false);
	});

	it("returns false when missing event field", () => {
		expect(is_backend_event({ payload: {} })).toBe(false);
	});

	it("returns false for null/undefined", () => {
		expect(is_backend_event(null)).toBe(false);
		expect(is_backend_event(undefined)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(is_backend_event("event")).toBe(false);
	});
});

// ── is_backend_response ─────────────────────────────────────────────────

describe("is_backend_response", () => {
	it("returns true for success response", () => {
		expect(is_backend_response({ id: "1", ok: true, result: {} })).toBe(true);
	});

	it("returns true for error response", () => {
		expect(
			is_backend_response({
				id: "1",
				ok: false,
				error: { code: "ERR", message: "fail" },
			}),
		).toBe(true);
	});

	it("returns false when missing id", () => {
		expect(is_backend_response({ ok: true, result: {} })).toBe(false);
	});

	it("returns false when missing ok", () => {
		expect(is_backend_response({ id: "1", result: {} })).toBe(false);
	});

	it("returns false for null/undefined", () => {
		expect(is_backend_response(null)).toBe(false);
		expect(is_backend_response(undefined)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(is_backend_response("response")).toBe(false);
	});
});
