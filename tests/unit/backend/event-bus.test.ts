import { afterEach, describe, expect, it, vi } from "vitest";
import { emit_event } from "../../../backend/runtime/event-bus";

describe("emit_event", () => {
	const original_send = process.send;

	afterEach(() => {
		process.send = original_send;
	});

	it("calls process.send with event envelope", () => {
		const mock_send = vi.fn();
		process.send = mock_send;

		emit_event("qmd:progress", { percent: 50 });

		expect(mock_send).toHaveBeenCalledOnce();
		expect(mock_send).toHaveBeenCalledWith({
			event: "qmd:progress",
			payload: { percent: 50 },
		});
	});

	it("does not throw when process.send is unavailable", () => {
		process.send = undefined;
		expect(() => emit_event("test", {})).not.toThrow();
	});

	it("handles various payload types", () => {
		const mock_send = vi.fn();
		process.send = mock_send;

		emit_event("test", null);
		emit_event("test", "string payload");
		emit_event("test", [1, 2, 3]);

		expect(mock_send).toHaveBeenCalledTimes(3);
	});
});
