import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@/components/session-viewer/types";
import { get_unrendered_properties } from "@/components/session-viewer/utils/property-audit";

function make_entry(overrides: Record<string, unknown>): SessionEntry {
	return {
		id: "entry-1",
		parentId: null,
		timestamp: "2025-01-01T00:00:00Z",
		...overrides,
	} as SessionEntry;
}

describe("get_unrendered_properties", () => {
	it("returns empty for a message entry with only known keys", () => {
		const entry = make_entry({
			type: "message",
			message: { role: "user", content: "hello" },
		});
		expect(get_unrendered_properties(entry)).toEqual([]);
	});

	it("identifies unknown properties on a message entry", () => {
		const entry = make_entry({
			type: "message",
			message: { role: "user", content: "hello" },
			unknownProp: "surprise",
			anotherExtra: 42,
		});
		const unrendered = get_unrendered_properties(entry);
		expect(unrendered).toHaveLength(2);
		expect(unrendered.map((u) => u.key).sort()).toEqual([
			"anotherExtra",
			"unknownProp",
		]);
	});

	it("recognizes all compaction keys", () => {
		const entry = make_entry({
			type: "compaction",
			summary: "compacted",
			firstKeptEntryId: "e2",
			tokensBefore: 5000,
			details: {},
			fromHook: true,
		});
		expect(get_unrendered_properties(entry)).toEqual([]);
	});

	it("recognizes all model_change keys", () => {
		const entry = make_entry({
			type: "model_change",
			provider: "anthropic",
			modelId: "claude-3",
		});
		expect(get_unrendered_properties(entry)).toEqual([]);
	});

	it("recognizes all label keys", () => {
		const entry = make_entry({
			type: "label",
			targetId: "e1",
			label: "step 1",
		});
		expect(get_unrendered_properties(entry)).toEqual([]);
	});

	it("recognizes custom_message keys", () => {
		const entry = make_entry({
			type: "custom_message",
			customType: "hook",
			content: "hello",
			details: {},
			display: true,
		});
		expect(get_unrendered_properties(entry)).toEqual([]);
	});

	it("falls back to BASE_KEYS for unknown entry type", () => {
		const entry = make_entry({
			type: "future_type" as string,
			newField: "value",
		});
		const unrendered = get_unrendered_properties(entry);
		expect(unrendered).toHaveLength(1);
		expect(unrendered[0].key).toBe("newField");
	});

	it("base keys are never reported as unrendered", () => {
		const entry = make_entry({ type: "message", message: {} });
		const unrendered = get_unrendered_properties(entry);
		const keys = unrendered.map((u) => u.key);
		expect(keys).not.toContain("type");
		expect(keys).not.toContain("id");
		expect(keys).not.toContain("parentId");
		expect(keys).not.toContain("timestamp");
	});
});
