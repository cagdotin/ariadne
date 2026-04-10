import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@/components/session-viewer/types";
import { compute_stats } from "@/components/session-viewer/utils/stats";

function make_entry(overrides: Record<string, unknown>): SessionEntry {
	return {
		id: `entry-${Math.random().toString(36).slice(2, 8)}`,
		parentId: null,
		timestamp: "2025-01-01T00:00:00Z",
		type: "message",
		...overrides,
	} as SessionEntry;
}

function user_msg(content: string): SessionEntry {
	return make_entry({
		type: "message",
		message: { role: "user", content },
	});
}

function assistant_msg(overrides: Record<string, unknown> = {}): SessionEntry {
	return make_entry({
		type: "message",
		message: {
			role: "assistant",
			content: [],
			...overrides,
		},
	});
}

function tool_result_msg(): SessionEntry {
	return make_entry({
		type: "message",
		message: {
			role: "toolResult",
			toolCallId: "tc-1",
			content: [],
		},
	});
}

describe("compute_stats", () => {
	it("returns zero stats for empty entries", () => {
		const stats = compute_stats([]);
		expect(stats.user_messages).toBe(0);
		expect(stats.assistant_messages).toBe(0);
		expect(stats.tool_results).toBe(0);
		expect(stats.tool_calls).toBe(0);
		expect(stats.compactions).toBe(0);
		expect(stats.branch_summaries).toBe(0);
		expect(stats.custom_messages).toBe(0);
		expect(stats.models).toEqual([]);
		expect(stats.tokens.input).toBe(0);
		expect(stats.cost.input).toBe(0);
	});

	it("counts user messages", () => {
		const stats = compute_stats([user_msg("hi"), user_msg("bye")]);
		expect(stats.user_messages).toBe(2);
	});

	it("counts assistant messages", () => {
		const stats = compute_stats([assistant_msg(), assistant_msg()]);
		expect(stats.assistant_messages).toBe(2);
	});

	it("counts tool results", () => {
		const stats = compute_stats([tool_result_msg(), tool_result_msg()]);
		expect(stats.tool_results).toBe(2);
	});

	it("counts tool calls within assistant content blocks", () => {
		const stats = compute_stats([
			assistant_msg({
				content: [
					{ type: "text", text: "Let me check" },
					{ type: "toolCall", id: "tc-1", name: "read", arguments: {} },
					{ type: "toolCall", id: "tc-2", name: "write", arguments: {} },
				],
			}),
		]);
		expect(stats.tool_calls).toBe(2);
	});

	it("accumulates token usage across messages", () => {
		const stats = compute_stats([
			assistant_msg({
				usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5 },
			}),
			assistant_msg({
				usage: { input: 200, output: 100, cacheRead: 20, cacheWrite: 10 },
			}),
		]);

		expect(stats.tokens.input).toBe(300);
		expect(stats.tokens.output).toBe(150);
		expect(stats.tokens.cache_read).toBe(30);
		expect(stats.tokens.cache_write).toBe(15);
	});

	it("accumulates cost across messages", () => {
		const stats = compute_stats([
			assistant_msg({
				usage: {
					input: 100,
					output: 50,
					cost: {
						input: 0.01,
						output: 0.02,
						cacheRead: 0.001,
						cacheWrite: 0.002,
					},
				},
			}),
			assistant_msg({
				usage: {
					input: 100,
					output: 50,
					cost: {
						input: 0.03,
						output: 0.04,
						cacheRead: 0.003,
						cacheWrite: 0.004,
					},
				},
			}),
		]);

		expect(stats.cost.input).toBeCloseTo(0.04);
		expect(stats.cost.output).toBeCloseTo(0.06);
		expect(stats.cost.cache_read).toBeCloseTo(0.004);
		expect(stats.cost.cache_write).toBeCloseTo(0.006);
	});

	it("handles missing usage fields gracefully", () => {
		const stats = compute_stats([assistant_msg({ usage: {} })]);
		expect(stats.tokens.input).toBe(0);
		expect(stats.tokens.output).toBe(0);
	});

	it("handles missing cost within usage", () => {
		const stats = compute_stats([assistant_msg({ usage: { input: 100 } })]);
		expect(stats.cost.input).toBe(0);
	});

	it("collects unique models", () => {
		const stats = compute_stats([
			assistant_msg({ model: "claude-3" }),
			assistant_msg({ model: "claude-3" }),
			assistant_msg({ model: "gpt-4" }),
		]);
		expect(stats.models.sort()).toEqual(["claude-3", "gpt-4"]);
	});

	it("includes provider in model name when present", () => {
		const stats = compute_stats([
			assistant_msg({ model: "claude-3", provider: "anthropic" }),
		]);
		expect(stats.models).toEqual(["anthropic/claude-3"]);
	});

	it("counts compaction entries", () => {
		const stats = compute_stats([
			make_entry({ type: "compaction", summary: "compacted" }),
			make_entry({ type: "compaction", summary: "compacted again" }),
		]);
		expect(stats.compactions).toBe(2);
	});

	it("counts branch_summary entries", () => {
		const stats = compute_stats([
			make_entry({ type: "branch_summary", fromId: "x", summary: "branched" }),
		]);
		expect(stats.branch_summaries).toBe(1);
	});

	it("counts custom_message entries", () => {
		const stats = compute_stats([
			make_entry({
				type: "custom_message",
				customType: "hook",
				content: "hi",
				display: true,
			}),
		]);
		expect(stats.custom_messages).toBe(1);
	});

	it("handles mixed entry types in a realistic session", () => {
		const stats = compute_stats([
			user_msg("Write a function"),
			assistant_msg({
				model: "claude-3",
				content: [
					{ type: "text", text: "Sure" },
					{ type: "toolCall", id: "tc-1", name: "write", arguments: {} },
				],
				usage: { input: 500, output: 200, cost: { input: 0.05, output: 0.02 } },
			}),
			tool_result_msg(),
			assistant_msg({
				model: "claude-3",
				content: [{ type: "text", text: "Done!" }],
				usage: { input: 600, output: 100 },
			}),
			make_entry({ type: "compaction", summary: "compacted" }),
		]);

		expect(stats.user_messages).toBe(1);
		expect(stats.assistant_messages).toBe(2);
		expect(stats.tool_results).toBe(1);
		expect(stats.tool_calls).toBe(1);
		expect(stats.compactions).toBe(1);
		expect(stats.tokens.input).toBe(1100);
		expect(stats.tokens.output).toBe(300);
		expect(stats.models).toEqual(["claude-3"]);
	});
});
