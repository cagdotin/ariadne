import { describe, expect, it } from "vitest";
import {
	make_file_node_id,
	make_framing_node_id,
	normalize_graph_path,
} from "../../../backend/analytics/graph/graph-ids";

describe("normalize_graph_path", () => {
	it("converts absolute path to relative under project root", () => {
		expect(normalize_graph_path("/project/src/foo.ts", "/project")).toBe(
			"src/foo.ts",
		);
	});

	it("returns relative path unchanged", () => {
		expect(normalize_graph_path("src/foo.ts", "/project")).toBe("src/foo.ts");
	});

	it("handles empty project root", () => {
		expect(normalize_graph_path("/project/src/foo.ts", "")).toBe(
			"/project/src/foo.ts",
		);
	});
});

describe("make_file_node_id", () => {
	it("produces consistent IDs from absolute and relative paths", () => {
		const from_abs = make_file_node_id("/project/src/foo.ts", "/project");
		const from_rel = make_file_node_id("src/foo.ts", "/project");
		expect(from_abs).toBe(from_rel);
	});

	it("sanitizes path separators to underscores", () => {
		const id = make_file_node_id("/project/src/utils/bar.ts", "/project");
		expect(id).toBe("file_src_utils_bar.ts");
	});

	it("collapses repeated underscores", () => {
		// A path with special chars that would produce multiple underscores
		const id = make_file_node_id("/project/src//foo.ts", "/project");
		expect(id).not.toContain("__");
	});

	it("replay-derived and ambient references to same file produce same ID", () => {
		// Simulate replay: agent reads /project/AGENTS.md
		const replay_id = make_file_node_id("/project/AGENTS.md", "/project");
		// Simulate augmentation: scan finds /project/AGENTS.md
		const ambient_id = make_file_node_id("/project/AGENTS.md", "/project");
		expect(replay_id).toBe(ambient_id);
	});

	it("AGENTS.md in different dirs produce different IDs", () => {
		const root_id = make_file_node_id("/project/AGENTS.md", "/project");
		const docs_id = make_file_node_id(
			"/project/docs/AGENTS.md",
			"/project",
		);
		expect(root_id).not.toBe(docs_id);
	});

	it("preserves dots in extensions", () => {
		const id = make_file_node_id("/project/README.md", "/project");
		expect(id).toContain("README.md");
	});
});

describe("make_framing_node_id", () => {
	it("generates stable framing IDs", () => {
		expect(make_framing_node_id("model", "mc1")).toBe("framing_model_mc1");
		expect(make_framing_node_id("thinking", "tl1")).toBe(
			"framing_thinking_tl1",
		);
	});
});
