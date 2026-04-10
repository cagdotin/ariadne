import { describe, expect, it } from "vitest";
import type {
	MessageEntry,
	SessionEntry,
} from "@/components/session-viewer/types";
import {
	build_label_map,
	build_tool_call_map,
	build_tool_result_map,
} from "@/components/session-viewer/utils/data-builders";

function make_entry(
	overrides: Partial<SessionEntry> & { type: string },
): SessionEntry {
	return {
		id: "entry-1",
		parentId: null,
		timestamp: "2025-01-01T00:00:00Z",
		...overrides,
	} as SessionEntry;
}

function make_message_entry(message: Record<string, unknown>): MessageEntry {
	return make_entry({ type: "message", message }) as MessageEntry;
}

// ── build_tool_result_map ───────────────────────────────────────────────

describe("build_tool_result_map", () => {
	it("maps toolCallId to ToolResultMessage", () => {
		const entries: SessionEntry[] = [
			make_message_entry({
				role: "toolResult",
				toolCallId: "tc-1",
				toolName: "read",
				content: [{ type: "text", text: "file contents" }],
			}),
		];

		const map = build_tool_result_map(entries);
		expect(map.size).toBe(1);
		expect(map.get("tc-1")?.toolName).toBe("read");
	});

	it("ignores non-toolResult messages", () => {
		const entries: SessionEntry[] = [
			make_message_entry({ role: "user", content: "hello" }),
			make_message_entry({ role: "assistant", content: [] }),
		];

		const map = build_tool_result_map(entries);
		expect(map.size).toBe(0);
	});

	it("ignores non-message entries", () => {
		const entries: SessionEntry[] = [
			make_entry({ type: "compaction", summary: "compacted" }),
		];

		const map = build_tool_result_map(entries);
		expect(map.size).toBe(0);
	});

	it("handles multiple tool results", () => {
		const entries: SessionEntry[] = [
			make_message_entry({
				role: "toolResult",
				toolCallId: "tc-1",
				content: [],
			}),
			make_message_entry({
				role: "toolResult",
				toolCallId: "tc-2",
				content: [],
			}),
		];

		const map = build_tool_result_map(entries);
		expect(map.size).toBe(2);
	});

	it("skips tool results without toolCallId", () => {
		const entries: SessionEntry[] = [
			make_message_entry({
				role: "toolResult",
				content: [],
				// no toolCallId
			}),
		];

		const map = build_tool_result_map(entries);
		expect(map.size).toBe(0);
	});

	it("returns empty map for empty entries", () => {
		expect(build_tool_result_map([]).size).toBe(0);
	});
});

// ── build_tool_call_map ─────────────────────────────────────────────────

describe("build_tool_call_map", () => {
	it("maps tool call IDs to name and arguments", () => {
		const entries: SessionEntry[] = [
			make_message_entry({
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-1",
						name: "read",
						arguments: { path: "/a.ts" },
					},
				],
			}),
		];

		const map = build_tool_call_map(entries);
		expect(map.size).toBe(1);
		expect(map.get("tc-1")).toEqual({
			name: "read",
			arguments: { path: "/a.ts" },
		});
	});

	it("extracts multiple tool calls from one assistant message", () => {
		const entries: SessionEntry[] = [
			make_message_entry({
				role: "assistant",
				content: [
					{ type: "text", text: "Let me check..." },
					{ type: "toolCall", id: "tc-1", name: "read", arguments: {} },
					{ type: "toolCall", id: "tc-2", name: "write", arguments: {} },
				],
			}),
		];

		const map = build_tool_call_map(entries);
		expect(map.size).toBe(2);
	});

	it("ignores non-assistant messages", () => {
		const entries: SessionEntry[] = [
			make_message_entry({ role: "user", content: "hello" }),
		];

		const map = build_tool_call_map(entries);
		expect(map.size).toBe(0);
	});

	it("ignores assistant messages without array content", () => {
		const entries: SessionEntry[] = [
			make_message_entry({ role: "assistant", content: "text" }),
		];

		const map = build_tool_call_map(entries);
		expect(map.size).toBe(0);
	});

	it("returns empty map for empty entries", () => {
		expect(build_tool_call_map([]).size).toBe(0);
	});
});

// ── build_label_map ─────────────────────────────────────────────────────

describe("build_label_map", () => {
	it("maps targetId to label string", () => {
		const entries: SessionEntry[] = [
			make_entry({
				type: "label",
				targetId: "entry-1",
				label: "Important step",
			}) as unknown as SessionEntry,
		];

		const map = build_label_map(entries);
		expect(map.get("entry-1")).toBe("Important step");
	});

	it("ignores non-label entries", () => {
		const entries: SessionEntry[] = [
			make_message_entry({ role: "user", content: "hello" }),
		];

		const map = build_label_map(entries);
		expect(map.size).toBe(0);
	});

	it("ignores labels without targetId", () => {
		const entries: SessionEntry[] = [
			make_entry({
				type: "label",
				label: "orphan",
			}) as unknown as SessionEntry,
		];

		const map = build_label_map(entries);
		expect(map.size).toBe(0);
	});

	it("ignores labels without label text", () => {
		const entries: SessionEntry[] = [
			make_entry({
				type: "label",
				targetId: "entry-1",
			}) as unknown as SessionEntry,
		];

		const map = build_label_map(entries);
		expect(map.size).toBe(0);
	});

	it("handles multiple labels", () => {
		const entries: SessionEntry[] = [
			make_entry({
				type: "label",
				targetId: "e1",
				label: "A",
			}) as unknown as SessionEntry,
			make_entry({
				type: "label",
				targetId: "e2",
				label: "B",
			}) as unknown as SessionEntry,
		];

		const map = build_label_map(entries);
		expect(map.size).toBe(2);
	});

	it("last label wins on duplicate targetId", () => {
		const entries: SessionEntry[] = [
			make_entry({
				type: "label",
				targetId: "e1",
				label: "First",
			}) as unknown as SessionEntry,
			make_entry({
				type: "label",
				targetId: "e1",
				label: "Second",
			}) as unknown as SessionEntry,
		];

		const map = build_label_map(entries);
		expect(map.get("e1")).toBe("Second");
	});
});
