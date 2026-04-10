import { describe, expect, it } from "vitest";
import {
	register_handler,
	route_request,
} from "../../../backend/runtime/request-router";

// Note: request-router uses a module-level Map, so handlers persist across tests.
// We work around this by using unique channel names per test.

describe("request-router", () => {
	it("routes a request to a registered handler", async () => {
		register_handler("test_channel_1", async (payload) => {
			return { received: payload.value };
		});

		const result = await route_request("test_channel_1", { value: 42 });
		expect(result).toEqual({ received: 42 });
	});

	it("throws for unregistered channel", async () => {
		await expect(route_request("nonexistent_channel_xyz", {})).rejects.toThrow(
			'No handler registered for channel "nonexistent_channel_xyz"',
		);
	});

	it("propagates handler errors", async () => {
		register_handler("test_channel_error", async () => {
			throw new Error("handler failed");
		});

		await expect(route_request("test_channel_error", {})).rejects.toThrow(
			"handler failed",
		);
	});

	it("passes payload to handler", async () => {
		let captured_payload: Record<string, unknown> = {};
		register_handler("test_channel_payload", async (payload) => {
			captured_payload = payload;
			return null;
		});

		await route_request("test_channel_payload", { a: 1, b: "two" });
		expect(captured_payload).toEqual({ a: 1, b: "two" });
	});

	it("allows overwriting a handler (with warning)", async () => {
		register_handler("test_channel_overwrite", async () => "first");
		register_handler("test_channel_overwrite", async () => "second");

		const result = await route_request("test_channel_overwrite", {});
		expect(result).toBe("second");
	});

	it("handles async handlers that return promises", async () => {
		register_handler("test_channel_async", async () => {
			return new Promise((resolve) => setTimeout(() => resolve("delayed"), 10));
		});

		const result = await route_request("test_channel_async", {});
		expect(result).toBe("delayed");
	});
});
