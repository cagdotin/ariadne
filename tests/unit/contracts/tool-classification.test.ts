import { describe, expect, it } from "vitest";
import {
	classify_tool_action,
	is_discovery_tool,
	is_doc_path,
} from "../../../contracts/graph/tool-classification";

describe("is_discovery_tool", () => {
	it("recognizes named discovery tools", () => {
		expect(is_discovery_tool("Glob")).toBe(true);
		expect(is_discovery_tool("Grep")).toBe(true);
		expect(is_discovery_tool("Search")).toBe(true);
		expect(is_discovery_tool("ListDir")).toBe(true);
	});

	it("rejects non-discovery tools", () => {
		expect(is_discovery_tool("Read")).toBe(false);
		expect(is_discovery_tool("Edit")).toBe(false);
		expect(is_discovery_tool("Write")).toBe(false);
	});

	it("recognizes discovery programs via Bash", () => {
		expect(is_discovery_tool("Bash", "rg -l foo")).toBe(true);
		expect(is_discovery_tool("bash", "grep -r bar")).toBe(true);
		expect(is_discovery_tool("Bash", "find . -name '*.ts'")).toBe(true);
		expect(is_discovery_tool("Bash", "ls -la")).toBe(true);
	});

	it("rejects non-discovery bash commands", () => {
		expect(is_discovery_tool("Bash", "npm install")).toBe(false);
		expect(is_discovery_tool("Bash", "git status")).toBe(false);
	});

	it("handles undefined bash command", () => {
		expect(is_discovery_tool("Bash")).toBe(false);
	});
});

describe("is_doc_path", () => {
	it("recognizes markdown files", () => {
		expect(is_doc_path("README.md")).toBe(true);
		expect(is_doc_path("docs/PLAN.mdx")).toBe(true);
		expect(is_doc_path("notes.txt")).toBe(true);
		expect(is_doc_path("guide.rst")).toBe(true);
	});

	it("rejects source files", () => {
		expect(is_doc_path("index.ts")).toBe(false);
		expect(is_doc_path("app.tsx")).toBe(false);
		expect(is_doc_path("style.css")).toBe(false);
	});

	it("handles paths without extensions", () => {
		expect(is_doc_path("Makefile")).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(is_doc_path("README.MD")).toBe(true);
		expect(is_doc_path("file.TXT")).toBe(true);
	});
});

describe("classify_tool_action", () => {
	it("classifies Read on source as read", () => {
		expect(classify_tool_action("Read", "src/foo.ts")).toBe("read");
	});

	it("classifies Read on doc as doc_read", () => {
		expect(classify_tool_action("Read", "README.md")).toBe("doc_read");
	});

	it("classifies Edit as edit", () => {
		expect(classify_tool_action("Edit", "src/foo.ts")).toBe("edit");
	});

	it("classifies Write as write", () => {
		expect(classify_tool_action("Write", "src/new.ts")).toBe("write");
	});

	it("classifies Glob as search", () => {
		expect(classify_tool_action("Glob")).toBe("search");
	});

	it("classifies Bash with rg as search", () => {
		expect(classify_tool_action("Bash", undefined, "rg -l pattern")).toBe("search");
	});

	it("classifies unknown tool as opaque", () => {
		expect(classify_tool_action("CustomTool")).toBe("opaque");
	});

	it("is case-insensitive on tool name", () => {
		expect(classify_tool_action("read", "src/foo.ts")).toBe("read");
		expect(classify_tool_action("edit", "src/foo.ts")).toBe("edit");
		expect(classify_tool_action("write", "src/foo.ts")).toBe("write");
	});
});
