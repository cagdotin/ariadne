import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@/components/session-viewer/types";
import {
	extract_text,
	has_text_content,
} from "@/components/session-viewer/utils/text";

// ── extract_text ────────────────────────────────────────────────────────

describe("extract_text", () => {
	it("returns string content directly", () => {
		expect(extract_text("hello world")).toBe("hello world");
	});

	it("returns empty string for empty string input", () => {
		expect(extract_text("")).toBe("");
	});

	it("extracts text from a single text block", () => {
		const blocks: ContentBlock[] = [{ type: "text", text: "hello" }];
		expect(extract_text(blocks)).toBe("hello");
	});

	it("concatenates text from multiple text blocks", () => {
		const blocks: ContentBlock[] = [
			{ type: "text", text: "hello " },
			{ type: "text", text: "world" },
		];
		expect(extract_text(blocks)).toBe("hello world");
	});

	it("ignores non-text blocks", () => {
		const blocks: ContentBlock[] = [
			{ type: "text", text: "before" },
			{ type: "thinking", thinking: "pondering..." },
			{ type: "text", text: " after" },
			{ type: "image", data: "base64data", mimeType: "image/png" },
		];
		expect(extract_text(blocks)).toBe("before after");
	});

	it("ignores text blocks with empty text", () => {
		const blocks: ContentBlock[] = [
			{ type: "text", text: "" },
			{ type: "text", text: "real" },
		];
		expect(extract_text(blocks)).toBe("real");
	});

	it("returns empty string for array with no text blocks", () => {
		const blocks: ContentBlock[] = [{ type: "thinking", thinking: "hmm" }];
		expect(extract_text(blocks)).toBe("");
	});

	it("returns empty string for empty array", () => {
		expect(extract_text([])).toBe("");
	});

	it("handles toolCall blocks without crashing", () => {
		const blocks: ContentBlock[] = [
			{
				type: "toolCall",
				id: "tc1",
				name: "read",
				arguments: { path: "/a.ts" },
			},
			{ type: "text", text: "result" },
		];
		expect(extract_text(blocks)).toBe("result");
	});
});

// ── has_text_content ────────────────────────────────────────────────────

describe("has_text_content", () => {
	it("returns true for non-empty string", () => {
		expect(has_text_content("hello")).toBe(true);
	});

	it("returns false for empty string", () => {
		expect(has_text_content("")).toBe(false);
	});

	it("returns false for whitespace-only string", () => {
		expect(has_text_content("   \n\t  ")).toBe(false);
	});

	it("returns true when content blocks contain text", () => {
		expect(has_text_content([{ type: "text", text: "hi" }])).toBe(true);
	});

	it("returns false when content blocks have no text", () => {
		expect(has_text_content([{ type: "thinking", thinking: "..." }])).toBe(
			false,
		);
	});

	it("returns false for empty array", () => {
		expect(has_text_content([])).toBe(false);
	});

	it("returns false when text blocks only contain whitespace", () => {
		expect(has_text_content([{ type: "text", text: "   " }])).toBe(false);
	});
});
