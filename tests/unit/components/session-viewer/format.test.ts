import { describe, expect, it } from "vitest";
import { format_tool_call_label } from "@/components/session-viewer/utils/format";

describe("format_tool_call_label", () => {
	// ── read tool ─────────────────────────────────────────────────────

	it("formats read with file_path", () => {
		expect(
			format_tool_call_label("read", { file_path: "/Users/me/src/app.ts" }),
		).toBe("[read: ~/src/app.ts]");
	});

	it("formats read with path (legacy arg name)", () => {
		expect(
			format_tool_call_label("read", { path: "/Users/me/src/app.ts" }),
		).toBe("[read: ~/src/app.ts]");
	});

	it("formats read with offset and limit", () => {
		const result = format_tool_call_label("read", {
			file_path: "/Users/me/src/app.ts",
			offset: 10,
			limit: 20,
		});
		expect(result).toBe("[read: ~/src/app.ts:10-29]");
	});

	it("formats read with offset only", () => {
		const result = format_tool_call_label("read", {
			file_path: "/Users/me/src/app.ts",
			offset: 10,
		});
		expect(result).toBe("[read: ~/src/app.ts:10]");
	});

	it("formats read with limit only (uses offset=1 as default start)", () => {
		const result = format_tool_call_label("read", {
			file_path: "/Users/me/src/app.ts",
			limit: 50,
		});
		expect(result).toBe("[read: ~/src/app.ts:1-50]");
	});

	it("formats read with no path", () => {
		expect(format_tool_call_label("read", {})).toBe("[read: ]");
	});

	// ── write tool ────────────────────────────────────────────────────

	it("formats write with file_path", () => {
		expect(
			format_tool_call_label("write", { file_path: "/Users/me/src/app.ts" }),
		).toBe("[write: ~/src/app.ts]");
	});

	it("formats write with no path", () => {
		expect(format_tool_call_label("write", {})).toBe("[write: ]");
	});

	// ── edit tool ─────────────────────────────────────────────────────

	it("formats edit with file_path", () => {
		expect(
			format_tool_call_label("edit", { file_path: "/home/user/src/app.ts" }),
		).toBe("[edit: ~/src/app.ts]");
	});

	// ── bash tool ─────────────────────────────────────────────────────

	it("formats bash with short command", () => {
		expect(format_tool_call_label("bash", { command: "ls -la" })).toBe(
			"[bash: ls -la]",
		);
	});

	it("truncates bash commands over 50 chars", () => {
		const long_cmd = "a".repeat(60);
		const result = format_tool_call_label("bash", { command: long_cmd });
		expect(result).toBe(`[bash: ${"a".repeat(50)}...]`);
	});

	it("replaces newlines and tabs in bash commands", () => {
		expect(format_tool_call_label("bash", { command: "echo\n\thello" })).toBe(
			"[bash: echo  hello]",
		);
	});

	// ── grep tool ─────────────────────────────────────────────────────

	it("formats grep with pattern and path", () => {
		expect(
			format_tool_call_label("grep", {
				pattern: "TODO",
				path: "/Users/me/src",
			}),
		).toBe("[grep: /TODO/ in ~/src]");
	});

	it("formats grep with default path", () => {
		expect(format_tool_call_label("grep", { pattern: "TODO" })).toBe(
			"[grep: /TODO/ in .]",
		);
	});

	// ── find tool ─────────────────────────────────────────────────────

	it("formats find with pattern and path", () => {
		expect(
			format_tool_call_label("find", {
				pattern: "*.ts",
				path: "/Users/me/src",
			}),
		).toBe("[find: *.ts in ~/src]");
	});

	// ── ls tool ───────────────────────────────────────────────────────

	it("formats ls with path", () => {
		expect(format_tool_call_label("ls", { path: "/Users/me/src" })).toBe(
			"[ls: ~/src]",
		);
	});

	it("formats ls with default path", () => {
		expect(format_tool_call_label("ls", {})).toBe("[ls: .]");
	});

	// ── unknown tool ──────────────────────────────────────────────────

	it("formats unknown tool with JSON args", () => {
		const result = format_tool_call_label("custom_tool", { key: "value" });
		expect(result).toBe('[custom_tool: {"key":"value"}]');
	});

	it("truncates long JSON args for unknown tools", () => {
		const long_val = "x".repeat(50);
		const result = format_tool_call_label("custom", { key: long_val });
		expect(result).toMatch(/^\[custom: .{40}\.\.\.\]$/);
	});
});
