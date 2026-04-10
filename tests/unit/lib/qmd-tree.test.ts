import { describe, expect, it } from "vitest";
import {
	build_file_tree,
	collapse_single_child_dirs,
	collect_file_paths,
	compute_dir_index_status,
	count_files,
	type FileTreeNode,
	flatten_tree,
	handelize_path,
	resolve_indexed_paths,
	sort_tree,
} from "@/lib/qmd-tree";

// ── handelize_path ──────────────────────────────────────────────────────

describe("handelize_path", () => {
	it("lowercases the entire path", () => {
		expect(handelize_path("SRC/App.ts")).toBe("src/app.ts");
	});

	it("replaces special characters with hyphens in directory segments", () => {
		expect(handelize_path("my project/file.ts")).toBe("my-project/file.ts");
	});

	it("replaces special characters in file name but preserves extension", () => {
		expect(handelize_path("My Component.test.tsx")).toBe(
			"my-component-test.tsx",
		);
	});

	it("strips leading and trailing hyphens from segments", () => {
		expect(handelize_path("--src--/--file--.ts")).toBe("src/file.ts");
	});

	it("filters out empty segments", () => {
		expect(handelize_path("src//utils///file.ts")).toBe("src/utils/file.ts");
	});

	it("handles files without extensions", () => {
		expect(handelize_path("Makefile")).toBe("makefile");
	});

	it("handles deeply nested paths", () => {
		expect(handelize_path("src/components/ui/Button.tsx")).toBe(
			"src/components/ui/button.tsx",
		);
	});

	it("handles special characters in file names with dots", () => {
		expect(handelize_path("vite.config.ts")).toBe("vite-config.ts");
	});

	it("preserves dollar signs", () => {
		expect(handelize_path("$utils/index.ts")).toBe("$utils/index.ts");
	});

	it("handles unicode letters", () => {
		expect(handelize_path("ñoño/café.ts")).toBe("ñoño/café.ts");
	});
});

// ── resolve_indexed_paths ───────────────────────────────────────────────

describe("resolve_indexed_paths", () => {
	it("returns filesystem paths whose handleized form matches the DB set", () => {
		const fs_paths = ["src/App.tsx", "src/index.ts", "README.md"];
		const db_paths = ["src/app.tsx", "readme.md"];

		const result = resolve_indexed_paths(fs_paths, db_paths);

		expect(result.has("src/App.tsx")).toBe(true);
		expect(result.has("README.md")).toBe(true);
		expect(result.has("src/index.ts")).toBe(false);
	});

	it("returns empty set when no matches", () => {
		const result = resolve_indexed_paths(["a.ts"], ["b.ts"]);
		expect(result.size).toBe(0);
	});

	it("returns empty set for empty inputs", () => {
		expect(resolve_indexed_paths([], []).size).toBe(0);
	});
});

// ── build_file_tree ─────────────────────────────────────────────────────

describe("build_file_tree", () => {
	it("builds a tree from flat file paths", () => {
		const tree = build_file_tree(["src/a.ts", "src/b.ts", "README.md"]);

		expect(tree).toHaveLength(2); // src/ dir + README.md file
		const src = tree.find((n) => n.is_dir);
		const readme = tree.find((n) => !n.is_dir);
		expect(src).toBeDefined();
		expect(readme?.name).toBe("README.md");
		expect(src?.children).toHaveLength(2);
	});

	it("sorts directories before files", () => {
		const tree = build_file_tree(["z.ts", "a/b.ts"]);
		expect(tree[0].is_dir).toBe(true);
		expect(tree[1].is_dir).toBe(false);
	});

	it("sorts alphabetically within the same type", () => {
		const tree = build_file_tree(["c.ts", "a.ts", "b.ts"]);
		expect(tree.map((n) => n.name)).toEqual(["a.ts", "b.ts", "c.ts"]);
	});

	it("collapses single-child directory chains", () => {
		const tree = build_file_tree(["a/b/c/file.ts"]);

		// a/b/c should be collapsed into one node
		expect(tree).toHaveLength(1);
		expect(tree[0].is_dir).toBe(true);
		expect(tree[0].name).toBe("a/b/c");
		expect(tree[0].children).toHaveLength(1);
		expect(tree[0].children[0].name).toBe("file.ts");
	});

	it("does not collapse directories with multiple children", () => {
		const tree = build_file_tree(["a/b/x.ts", "a/b/y.ts"]);

		// a should collapse with b since b is the only child of a
		expect(tree).toHaveLength(1);
		expect(tree[0].name).toBe("a/b");
		expect(tree[0].children).toHaveLength(2);
	});

	it("marks indexed files when indexed_set is provided", () => {
		const indexed = new Set(["src/a.ts"]);
		const tree = build_file_tree(["src/a.ts", "src/b.ts"], indexed);

		const src = tree[0];
		const a = src.children.find((c) => c.name === "a.ts");
		const b = src.children.find((c) => c.name === "b.ts");
		expect(a?.indexed).toBe(true);
		expect(b?.indexed).toBe(false);
	});

	it("returns empty array for empty input", () => {
		expect(build_file_tree([])).toEqual([]);
	});

	it("handles single file at root level", () => {
		const tree = build_file_tree(["file.ts"]);
		expect(tree).toHaveLength(1);
		expect(tree[0].name).toBe("file.ts");
		expect(tree[0].is_dir).toBe(false);
	});
});

// ── count_files ─────────────────────────────────────────────────────────

describe("count_files", () => {
	it("counts zero for a leaf file", () => {
		const file: FileTreeNode = {
			name: "a.ts",
			path: "a.ts",
			is_dir: false,
			children: [],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};
		expect(count_files(file)).toBe(1);
		expect(file.file_count).toBe(0); // files have file_count=0
	});

	it("counts files in a directory recursively", () => {
		const dir: FileTreeNode = {
			name: "src",
			path: "src",
			is_dir: true,
			children: [
				{
					name: "a.ts",
					path: "src/a.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
				{
					name: "sub",
					path: "src/sub",
					is_dir: true,
					children: [
						{
							name: "b.ts",
							path: "src/sub/b.ts",
							is_dir: false,
							children: [],
							file_count: 0,
							indexed: false,
							dir_index_status: "none",
						},
					],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		expect(count_files(dir)).toBe(2);
		expect(dir.file_count).toBe(2);
		expect(dir.children[1].file_count).toBe(1); // sub dir
	});
});

// ── compute_dir_index_status ────────────────────────────────────────────

describe("compute_dir_index_status", () => {
	it("returns 'all' when all files are indexed", () => {
		const dir: FileTreeNode = {
			name: "src",
			path: "src",
			is_dir: true,
			children: [
				{
					name: "a.ts",
					path: "a.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: true,
					dir_index_status: "none",
				},
				{
					name: "b.ts",
					path: "b.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: true,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		compute_dir_index_status(dir);
		expect(dir.dir_index_status).toBe("all");
	});

	it("returns 'some' when partially indexed", () => {
		const dir: FileTreeNode = {
			name: "src",
			path: "src",
			is_dir: true,
			children: [
				{
					name: "a.ts",
					path: "a.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: true,
					dir_index_status: "none",
				},
				{
					name: "b.ts",
					path: "b.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		compute_dir_index_status(dir);
		expect(dir.dir_index_status).toBe("some");
	});

	it("returns 'none' when no files are indexed", () => {
		const dir: FileTreeNode = {
			name: "src",
			path: "src",
			is_dir: true,
			children: [
				{
					name: "a.ts",
					path: "a.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		compute_dir_index_status(dir);
		expect(dir.dir_index_status).toBe("none");
	});

	it("returns 'none' for empty directory", () => {
		const dir: FileTreeNode = {
			name: "empty",
			path: "empty",
			is_dir: true,
			children: [],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		compute_dir_index_status(dir);
		expect(dir.dir_index_status).toBe("none");
	});

	it("propagates status through nested directories", () => {
		const dir: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "sub",
					path: "sub",
					is_dir: true,
					children: [
						{
							name: "a.ts",
							path: "a.ts",
							is_dir: false,
							children: [],
							file_count: 0,
							indexed: true,
							dir_index_status: "none",
						},
					],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
				{
					name: "b.ts",
					path: "b.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		compute_dir_index_status(dir);
		expect(dir.dir_index_status).toBe("some");
		expect(dir.children[0].dir_index_status).toBe("all");
	});
});

// ── sort_tree ───────────────────────────────────────────────────────────

describe("sort_tree", () => {
	it("places directories before files", () => {
		const root: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "z.ts",
					path: "z.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
				{
					name: "a",
					path: "a",
					is_dir: true,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		sort_tree(root);
		expect(root.children[0].name).toBe("a");
		expect(root.children[1].name).toBe("z.ts");
	});

	it("sorts alphabetically within same type", () => {
		const root: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "c.ts",
					path: "c.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
				{
					name: "a.ts",
					path: "a.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
				{
					name: "b.ts",
					path: "b.ts",
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};

		sort_tree(root);
		expect(root.children.map((c) => c.name)).toEqual(["a.ts", "b.ts", "c.ts"]);
	});

	it("is a no-op on file nodes", () => {
		const file: FileTreeNode = {
			name: "a.ts",
			path: "a.ts",
			is_dir: false,
			children: [],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};
		sort_tree(file); // should not throw
	});
});

// ── collapse_single_child_dirs ──────────────────────────────────────────

describe("collapse_single_child_dirs", () => {
	it("collapses a chain of single-child directories", () => {
		const root: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "a",
					path: "a",
					is_dir: true,
					children: [
						{
							name: "b",
							path: "a/b",
							is_dir: true,
							children: [
								{
									name: "file.ts",
									path: "a/b/file.ts",
									is_dir: false,
									children: [],
									file_count: 0,
									indexed: false,
									dir_index_status: "none",
								},
							],
							file_count: 1,
							indexed: false,
							dir_index_status: "none",
						},
					],
					file_count: 1,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 1,
			indexed: false,
			dir_index_status: "none",
		};

		collapse_single_child_dirs(root);
		expect(root.children[0].name).toBe("a/b");
		expect(root.children[0].children[0].name).toBe("file.ts");
	});

	it("does not collapse when directory has multiple children", () => {
		const root: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "a",
					path: "a",
					is_dir: true,
					children: [
						{
							name: "x.ts",
							path: "a/x.ts",
							is_dir: false,
							children: [],
							file_count: 0,
							indexed: false,
							dir_index_status: "none",
						},
						{
							name: "y.ts",
							path: "a/y.ts",
							is_dir: false,
							children: [],
							file_count: 0,
							indexed: false,
							dir_index_status: "none",
						},
					],
					file_count: 2,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 2,
			indexed: false,
			dir_index_status: "none",
		};

		collapse_single_child_dirs(root);
		expect(root.children[0].name).toBe("a");
		expect(root.children[0].children).toHaveLength(2);
	});

	it("stops collapsing when single child is a file", () => {
		const root: FileTreeNode = {
			name: "root",
			path: "root",
			is_dir: true,
			children: [
				{
					name: "a",
					path: "a",
					is_dir: true,
					children: [
						{
							name: "file.ts",
							path: "a/file.ts",
							is_dir: false,
							children: [],
							file_count: 0,
							indexed: false,
							dir_index_status: "none",
						},
					],
					file_count: 1,
					indexed: false,
					dir_index_status: "none",
				},
			],
			file_count: 1,
			indexed: false,
			dir_index_status: "none",
		};

		collapse_single_child_dirs(root);
		// Single file child — should NOT collapse (only dirs collapse)
		expect(root.children[0].name).toBe("a");
	});
});

// ── collect_file_paths ──────────────────────────────────────────────────

describe("collect_file_paths", () => {
	it("collects all descendant file paths", () => {
		const tree = build_file_tree(["src/a.ts", "src/b.ts", "README.md"]);
		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const dir = tree.find((n) => n.is_dir)!;
		const paths = collect_file_paths(dir);
		expect(paths.sort()).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("returns single path for a file node", () => {
		const file: FileTreeNode = {
			name: "a.ts",
			path: "src/a.ts",
			is_dir: false,
			children: [],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};
		expect(collect_file_paths(file)).toEqual(["src/a.ts"]);
	});

	it("returns empty for empty directory", () => {
		const dir: FileTreeNode = {
			name: "empty",
			path: "empty",
			is_dir: true,
			children: [],
			file_count: 0,
			indexed: false,
			dir_index_status: "none",
		};
		expect(collect_file_paths(dir)).toEqual([]);
	});
});

// ── flatten_tree ────────────────────────────────────────────────────────

describe("flatten_tree", () => {
	it("flattens all nodes when none are collapsed", () => {
		const tree = build_file_tree(["src/a.ts", "src/b.ts"]);
		const flat = flatten_tree(tree, new Set());

		// src dir + 2 files
		expect(flat.length).toBeGreaterThanOrEqual(3);
	});

	it("hides children of collapsed directories", () => {
		const tree = build_file_tree(["src/a.ts", "src/b.ts"]);
		// biome-ignore lint/style/noNonNullAssertion: known to match in test data
		const src_node = tree.find((n) => n.is_dir)!;
		const collapsed = new Set([src_node.path]);
		const flat = flatten_tree(tree, collapsed);

		// only root-level entries should be visible
		const dir_entries = flat.filter((f) => f.node.is_dir);
		const file_entries = flat.filter((f) => !f.node.is_dir);

		// src dir is visible, but its children are not
		expect(dir_entries).toHaveLength(1);
		// only root-level files (none in this case) should be visible
		expect(file_entries).toHaveLength(0);
	});

	it("tracks depth correctly", () => {
		const tree = build_file_tree(["src/a.ts"]);
		const flat = flatten_tree(tree, new Set());

		expect(flat[0].depth).toBe(0); // src dir
		expect(flat[1].depth).toBe(1); // a.ts under src
	});

	it("marks last entries correctly", () => {
		const tree = build_file_tree(["a.ts", "b.ts"]);
		const flat = flatten_tree(tree, new Set());

		expect(flat[0].is_last).toBe(false);
		expect(flat[1].is_last).toBe(true);
	});

	it("returns empty for empty tree", () => {
		expect(flatten_tree([], new Set())).toEqual([]);
	});
});
