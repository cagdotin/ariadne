import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { FsOps } from "../../../backend/analytics/exploration/repo-context";
import { build_repo_context } from "../../../backend/analytics/exploration/repo-context";
import {
	get_or_build_repo_context,
	invalidate_repo_context,
} from "../../../backend/analytics/exploration/repo-context-cache";

const PROJECT_ROOT = "/test/project";

// ─── Fake filesystem ────────────────────────────────────────────────────────

function make_mock_fs(file_map: Record<string, string>): FsOps {
	const dirs = new Set<string>();
	const files = new Map<string, string>();

	// Always add project root
	dirs.add(PROJECT_ROOT);

	for (const [rel_path, content] of Object.entries(file_map)) {
		const abs = path.join(PROJECT_ROOT, rel_path);
		files.set(abs, content);

		// Register all parent dirs
		let dir = path.dirname(abs);
		while (dir.length >= PROJECT_ROOT.length) {
			dirs.add(dir);
			dir = path.dirname(dir);
		}
	}

	// Build directory entries
	const dir_entries = new Map<
		string,
		Array<{ name: string; is_directory(): boolean; is_file(): boolean }>
	>();

	for (const dir of dirs) {
		const entries: Array<{
			name: string;
			is_directory(): boolean;
			is_file(): boolean;
		}> = [];
		// Add file children
		for (const abs of files.keys()) {
			if (path.dirname(abs) === dir) {
				const name = path.basename(abs);
				entries.push({
					name,
					is_directory: () => false,
					is_file: () => true,
				});
			}
		}
		// Add dir children
		for (const d of dirs) {
			if (path.dirname(d) === dir && d !== dir) {
				const name = path.basename(d);
				entries.push({
					name,
					is_directory: () => true,
					is_file: () => false,
				});
			}
		}
		dir_entries.set(dir, entries);
	}

	return {
		stat_sync(p: string) {
			if (dirs.has(p)) {
				return { is_directory: () => true, is_file: () => false };
			}
			if (files.has(p)) {
				return { is_directory: () => false, is_file: () => true };
			}
			throw new Error(`ENOENT: ${p}`);
		},
		readdir_sync(p: string) {
			const entries = dir_entries.get(p);
			if (!entries) throw new Error(`ENOENT: ${p}`);
			return entries;
		},
		read_file_sync(p: string) {
			const content = files.get(p);
			if (content === undefined) throw new Error(`ENOENT: ${p}`);
			return content;
		},
	};
}

/** FsOps that always throws (simulates non-existent root). */
const missing_fs: FsOps = {
	stat_sync() {
		throw new Error("ENOENT");
	},
	readdir_sync() {
		throw new Error("ENOENT");
	},
	read_file_sync() {
		throw new Error("ENOENT");
	},
};

/** FsOps where root is a file, not a directory. */
const file_root_fs: FsOps = {
	stat_sync() {
		return { is_directory: () => false, is_file: () => true };
	},
	readdir_sync() {
		throw new Error("ENOENT");
	},
	read_file_sync() {
		throw new Error("ENOENT");
	},
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("build_repo_context", () => {
	// ── Graceful failure ─────────────────────────────────────────────

	it("returns success: false for non-existent project root", async () => {
		const result = await build_repo_context("/nonexistent", [], missing_fs);
		expect(result.success).toBe(false);
		expect(result.artifacts).toEqual([]);
		expect(result.relations).toEqual([]);
	});

	it("returns success: false when path is a file, not directory", async () => {
		const result = await build_repo_context(
			"/some/file.txt",
			[],
			file_root_fs,
		);
		expect(result.success).toBe(false);
	});

	// ── Markdown link extraction ─────────────────────────────────────

	it("extracts markdown links from docs", async () => {
		const fs_ops = make_mock_fs({
			"docs/guide.md": "See [other doc](./api.md) for details.",
			"docs/api.md": "# API Reference\n\nSome content.",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/guide.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const doc_link_relations = result.relations.filter(
			(r) => r.kind === "doc_links_doc",
		);
		expect(doc_link_relations.length).toBe(1);
		expect(doc_link_relations[0].source_id).toContain("guide.md");
		expect(doc_link_relations[0].target_id).toContain("api.md");
	});

	it("extracts parent-relative markdown links", async () => {
		const fs_ops = make_mock_fs({
			"docs/sub/page.md": "See [guide](../guide.md) for info.",
			"docs/guide.md": "# Guide",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/sub/page.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const doc_links = result.relations.filter(
			(r) => r.kind === "doc_links_doc",
		);
		expect(doc_links.length).toBe(1);
	});

	it("ignores http links in markdown", async () => {
		const fs_ops = make_mock_fs({
			"README.md": "Visit [site](https://example.com) and [docs](./docs.md).",
			"docs.md": "# Docs",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "README.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		// Should have doc_links_doc for ./docs.md but not for https://
		const doc_links = result.relations.filter(
			(r) => r.kind === "doc_links_doc",
		);
		expect(doc_links.length).toBe(1);
	});

	// ── Wikilink extraction ──────────────────────────────────────────

	it("extracts wikilinks resolved to project root", async () => {
		const fs_ops = make_mock_fs({
			"docs/index.md": "See [[docs/guide.md]] for details.",
			"docs/guide.md": "# Guide\n\nContent here.",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/index.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const doc_links = result.relations.filter(
			(r) => r.kind === "doc_links_doc",
		);
		expect(doc_links.length).toBe(1);
	});

	it("handles wikilinks with display text", async () => {
		const fs_ops = make_mock_fs({
			"notes.md": "Read [[docs/api.md|the API docs]] first.",
			"docs/api.md": "# API",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "notes.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const doc_links = result.relations.filter(
			(r) => r.kind === "doc_links_doc",
		);
		expect(doc_links.length).toBe(1);
		expect(doc_links[0].target_id).toContain("api.md");
	});

	// ── Heading extraction ───────────────────────────────────────────

	it("creates doc_section artifacts for headings in explored docs", async () => {
		const fs_ops = make_mock_fs({
			"docs/guide.md":
				"# Title\n## Section One\n### Subsection\n## Section Two",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/guide.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const sections = result.artifacts.filter((a) => a.kind === "doc_section");
		expect(sections.length).toBe(4);
		expect(sections.map((s) => s.label)).toEqual([
			"Title",
			"Section One",
			"Subsection",
			"Section Two",
		]);

		// All sections should have parent_id pointing to the doc
		const doc_artifact = result.artifacts.find((a) => a.kind === "doc_file");
		for (const section of sections) {
			expect(section.parent_id).toBe(doc_artifact?.id);
		}

		// section_belongs_to_doc relations
		const section_rels = result.relations.filter(
			(r) => r.kind === "section_belongs_to_doc",
		);
		expect(section_rels.length).toBe(4);
	});

	it("does NOT create doc_section artifacts for unexplored docs", async () => {
		const fs_ops = make_mock_fs({
			"docs/guide.md": "See [api](./api.md).",
			"docs/api.md": "# API\n## Endpoints\n## Auth",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/guide.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		// api.md is not explored, so no sections for it
		const sections = result.artifacts.filter((a) => a.kind === "doc_section");
		// guide.md has no headings, so 0 sections
		expect(sections.length).toBe(0);
	});

	// ── Explicit path references ─────────────────────────────────────

	it("extracts backtick-quoted file path references", async () => {
		const fs_ops = make_mock_fs({
			"docs/arch.md":
				"The main entry is `src/main.ts` and config at `config/app.json`.",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "docs/arch.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const file_refs = result.relations.filter(
			(r) => r.kind === "doc_references_file",
		);
		expect(file_refs.length).toBe(2);

		const target_ids = file_refs.map((r) => r.target_id);
		expect(target_ids.some((id) => id.includes("src/main.ts"))).toBe(true);
		expect(target_ids.some((id) => id.includes("config/app.json"))).toBe(true);
	});

	it("does not extract single-word backtick as path reference", async () => {
		const fs_ops = make_mock_fs({
			"README.md": "Use `npm` to install and `true` to test.",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "README.md")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const file_refs = result.relations.filter(
			(r) => r.kind === "doc_references_file",
		);
		expect(file_refs.length).toBe(0);
	});

	// ── Import extraction ────────────────────────────────────────────

	it("extracts ES import paths from explored source files", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './utils.js';\nimport bar from '../lib/bar.ts';`,
			"src/utils.ts": "export const foo = 1;",
			"lib/bar.ts": "export default 2;",
		});
		// Note: ./utils.js resolves via .js → .ts mapping to utils.ts

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(2);
	});

	it("extracts require() paths", async () => {
		const fs_ops = make_mock_fs({
			"src/index.js": `const x = require('./helper');`,
			"src/helper.ts": "module.exports = {};",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/index.js")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});

	it("skips bare module specifiers (npm packages)", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import React from 'react';\nimport { z } from 'zod';\nimport { foo } from './local.js';`,
			"src/local.js": "export const foo = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		// Only ./local.js, not react or zod
		expect(import_rels.length).toBe(1);
	});

	it("does NOT parse imports for unexplored files", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './utils.js';`,
			"src/utils.ts": `import { bar } from './bar.js';`,
			"src/utils.js": "module.exports = {};",
			"src/bar.js": "module.exports = {};",
		});

		// Only explore app.ts, not utils.ts
		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		// Only app.ts → utils, not utils → bar
		expect(import_rels.length).toBe(1);
	});

	// ── One-hop neighbors ────────────────────────────────────────────

	it("creates unexplored neighbor artifacts for imported files", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { helper } from './helper.js';`,
			"src/helper.js": "export const helper = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		// helper should appear as unexplored neighbor
		const helper_artifact = result.artifacts.find((a) =>
			a.path.includes("helper"),
		);
		expect(helper_artifact).toBeDefined();
		expect(helper_artifact?.explored).toBe(false);

		// Should have adjacent_unexplored relation
		const adj_rels = result.relations.filter(
			(r) => r.kind === "adjacent_unexplored",
		);
		expect(adj_rels.length).toBe(1);
		expect(adj_rels[0].evidence).toBe("adjacency_only");
	});

	it("does NOT create adjacent_unexplored for already-explored imports", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { helper } from './helper.js';`,
			"src/helper.ts": `export const helper = 1;`,
			"src/helper.js": `module.exports = { helper: 1 };`,
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[
				path.join(PROJECT_ROOT, "src/app.ts"),
				path.join(PROJECT_ROOT, "src/helper.js"),
			],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const adj_rels = result.relations.filter(
			(r) => r.kind === "adjacent_unexplored",
		);
		expect(adj_rels.length).toBe(0);
	});

	// ── Artifact properties ──────────────────────────────────────────

	it("sets first_seen_turn to null for all repo-context artifacts", async () => {
		const fs_ops = make_mock_fs({
			"README.md": "# Hello\nSee `src/main.ts`.",
			"src/main.ts": `import { x } from './lib.js';`,
			"src/lib.js": "export const x = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/main.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		for (const artifact of result.artifacts) {
			expect(artifact.first_seen_turn).toBeNull();
		}
	});

	it("generates stable deterministic artifact IDs", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": "const x = 1;",
		});

		const result1 = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);
		const result2 = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result1.artifacts[0].id).toBe(result2.artifacts[0].id);
		expect(result1.artifacts[0].id).toBe("art_src/app.ts");
	});

	it("marks explored files as explored: true", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": "const x = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const app = result.artifacts.find((a) => a.path === "src/app.ts");
		expect(app?.explored).toBe(true);
	});

	// ── Ignored directories ──────────────────────────────────────────

	it("skips node_modules and other ignored directories", async () => {
		const fs_ops = make_mock_fs({
			"README.md": "# Project",
			"node_modules/pkg/README.md": "# Package",
			".git/config": "gitconfig",
		});

		const result = await build_repo_context(PROJECT_ROOT, [], fs_ops);

		expect(result.success).toBe(true);

		// Should only find the root README, not node_modules one
		const doc_artifacts = result.artifacts.filter((a) => a.kind === "doc_file");
		// With no explored paths, no docs are relevant
		expect(doc_artifacts.every((a) => !a.path.includes("node_modules"))).toBe(
			true,
		);
	});

	// ── Existence-aware import resolution ────────────────────────────

	it("extensionless import resolves to existing local file only", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './utils';`,
			"src/utils.ts": "export const foo = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});

	it("nonexistent relative import yields no relation", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { ghost } from './does-not-exist.js';`,
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(0);
	});

	it("directory import resolves to existing index file", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './lib';`,
			"src/lib/index.ts": "export const foo = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});

	it("directory import yields no relation when index file is missing", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './lib';`,
			// No src/lib/index.* exists
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(0);
	});

	it("does not create ghost unexplored neighbors from nonexistent imports", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { x } from './phantom.js';\nimport { y } from './real.js';`,
			"src/real.js": "export const y = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		// phantom should not appear at all — no artifact, no relation
		const phantom = result.artifacts.find((a) => a.path.includes("phantom"));
		expect(phantom).toBeUndefined();

		const adj_rels = result.relations.filter(
			(r) => r.kind === "adjacent_unexplored",
		);
		// Only real.js should appear as unexplored neighbor
		expect(adj_rels.length).toBe(1);
	});

	it("resolves .js import to .ts file when .js does not exist", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import { foo } from './utils.js';`,
			"src/utils.ts": "export const foo = 1;",
			// No src/utils.js exists
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});

	// ── Side-effect imports ──────────────────────────────────────────

	it("handles side-effect imports", async () => {
		const fs_ops = make_mock_fs({
			"src/app.ts": `import './polyfills.js';`,
			"src/polyfills.js": "// polyfills",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/app.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});

	// ── Export from ──────────────────────────────────────────────────

	it("handles export from statements", async () => {
		const fs_ops = make_mock_fs({
			"src/index.ts": `export { foo } from './foo.js';`,
			"src/foo.js": "export const foo = 1;",
		});

		const result = await build_repo_context(
			PROJECT_ROOT,
			[path.join(PROJECT_ROOT, "src/index.ts")],
			fs_ops,
		);

		expect(result.success).toBe(true);

		const import_rels = result.relations.filter(
			(r) => r.kind === "file_imports_file",
		);
		expect(import_rels.length).toBe(1);
	});
});

// ─── Cache tests ────────────────────────────────────────────────────────────
// Note: repo-context-cache calls build_repo_context without fs_ops (uses real fs).
// These tests verify caching behavior using real fs on the actual project root.

describe("repo-context-cache", () => {
	beforeEach(() => {
		invalidate_repo_context(PROJECT_ROOT);
	});

	it("caches results and returns same object on second call", async () => {
		// Use a real directory that exists — the project root of this repo
		const real_root = process.cwd();
		invalidate_repo_context(real_root);

		const result1 = await get_or_build_repo_context(real_root, []);
		const result2 = await get_or_build_repo_context(real_root, []);

		expect(result1).toBe(result2); // same reference
		invalidate_repo_context(real_root);
	});

	it("invalidates cache when explored paths change", async () => {
		const real_root = process.cwd();
		invalidate_repo_context(real_root);

		const result1 = await get_or_build_repo_context(real_root, []);
		const result2 = await get_or_build_repo_context(real_root, [
			"nonexistent.ts",
		]);

		expect(result1).not.toBe(result2);
		invalidate_repo_context(real_root);
	});

	it("invalidate_repo_context clears the cache", async () => {
		const real_root = process.cwd();
		invalidate_repo_context(real_root);

		const result1 = await get_or_build_repo_context(real_root, []);
		invalidate_repo_context(real_root);
		const result2 = await get_or_build_repo_context(real_root, []);

		expect(result1).not.toBe(result2);
		invalidate_repo_context(real_root);
	});

	it("expires cache after TTL", async () => {
		const real_root = process.cwd();
		invalidate_repo_context(real_root);

		const result1 = await get_or_build_repo_context(
			real_root,
			[],
			0, // 0ms TTL = always expired
		);
		const result2 = await get_or_build_repo_context(real_root, [], 0);

		expect(result1).not.toBe(result2);
		invalidate_repo_context(real_root);
	});
});
