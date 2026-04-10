// ── File tree data model ────────────────────────────────────
// Ported from agents/extensions/qmd/ui/data.ts

/**
 * Re-implementation of QMD's internal handelize function.
 * Normalizes filesystem paths to the format QMD stores in its database.
 * Must match the behavior of handelize() in @tobilu/qmd store.ts.
 */
export function handelize_path(file_path: string): string {
	return file_path
		.toLowerCase()
		.split("/")
		.map((segment, idx, arr) => {
			const is_last = idx === arr.length - 1;
			if (is_last) {
				const ext_match = segment.match(/(\.[a-z0-9]+)$/i);
				const ext = ext_match ? ext_match[1] : "";
				const name_without_ext = ext ? segment.slice(0, -ext.length) : segment;
				const cleaned = name_without_ext
					.replace(/[^\p{L}\p{N}$]+/gu, "-")
					.replace(/^-+|-+$/g, "");
				return cleaned + ext;
			}
			return segment.replace(/[^\p{L}\p{N}$]+/gu, "-").replace(/^-+|-+$/g, "");
		})
		.filter(Boolean)
		.join("/");
}

/**
 * Build a set of filesystem paths that are indexed in QMD.
 * Maps handleized DB paths back to their original filesystem paths
 * by computing handelize(fs_path) and checking against the DB set.
 */
export function resolve_indexed_paths(
	filesystem_paths: string[],
	db_indexed_paths: string[],
): Set<string> {
	const db_set = new Set(db_indexed_paths);
	const result = new Set<string>();
	for (const fs_path of filesystem_paths) {
		if (db_set.has(handelize_path(fs_path))) {
			result.add(fs_path);
		}
	}
	return result;
}

export type DirIndexStatus = "all" | "some" | "none";

export interface FileTreeNode {
	name: string;
	path: string;
	is_dir: boolean;
	children: FileTreeNode[];
	file_count: number;
	/** For files: whether the file is in the QMD index */
	indexed: boolean;
	/** For dirs: aggregate index status of descendant files */
	dir_index_status: DirIndexStatus;
}

export interface FlatTreeEntry {
	node: FileTreeNode;
	depth: number;
	is_last: boolean;
	parent_is_last: boolean[];
}

/**
 * Build a hierarchical tree from flat file paths.
 * Directories that contain only a single child directory are collapsed
 * into one node (e.g. `docs/exec-plans/active` instead of three levels).
 */
export function build_file_tree(
	paths: string[],
	indexed_set?: Set<string>,
): FileTreeNode[] {
	const idx = indexed_set ?? new Set<string>();
	const root: FileTreeNode = {
		name: "",
		path: "",
		is_dir: true,
		children: [],
		file_count: 0,
		indexed: false,
		dir_index_status: "none",
	};

	for (const file_path of paths) {
		const segments = file_path.split("/");
		let current = root;

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const is_last = i === segments.length - 1;

			if (is_last) {
				current.children.push({
					name: seg,
					path: file_path,
					is_dir: false,
					children: [],
					file_count: 0,
					indexed: idx.has(file_path),
					dir_index_status: "none",
				});
			} else {
				const partial_path = segments.slice(0, i + 1).join("/");
				let child = current.children.find(
					(c) => c.is_dir && c.path === partial_path,
				);
				if (!child) {
					child = {
						name: seg,
						path: partial_path,
						is_dir: true,
						children: [],
						file_count: 0,
						indexed: false,
						dir_index_status: "none",
					};
					current.children.push(child);
				}
				current = child;
			}
		}
	}

	count_files(root);
	compute_dir_index_status(root);
	sort_tree(root);
	collapse_single_child_dirs(root);

	return root.children;
}

export function count_files(node: FileTreeNode): number {
	if (!node.is_dir) {
		node.file_count = 0;
		return 1;
	}
	let total = 0;
	for (const child of node.children) {
		total += count_files(child);
	}
	node.file_count = total;
	return total;
}

export function compute_dir_index_status(node: FileTreeNode): {
	indexed: number;
	total: number;
} {
	if (!node.is_dir) {
		return { indexed: node.indexed ? 1 : 0, total: 1 };
	}

	let indexed_count = 0;
	let total_count = 0;
	for (const child of node.children) {
		const r = compute_dir_index_status(child);
		indexed_count += r.indexed;
		total_count += r.total;
	}

	if (total_count === 0) {
		node.dir_index_status = "none";
	} else if (indexed_count === total_count) {
		node.dir_index_status = "all";
	} else if (indexed_count > 0) {
		node.dir_index_status = "some";
	} else {
		node.dir_index_status = "none";
	}

	return { indexed: indexed_count, total: total_count };
}

export function sort_tree(node: FileTreeNode): void {
	if (!node.is_dir) return;
	node.children.sort((a, b) => {
		if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	for (const child of node.children) {
		sort_tree(child);
	}
}

export function collapse_single_child_dirs(node: FileTreeNode): void {
	for (const child of node.children) {
		if (child.is_dir) {
			while (child.children.length === 1 && child.children[0].is_dir) {
				const grandchild = child.children[0];
				child.name = `${child.name}/${grandchild.name}`;
				child.path = grandchild.path;
				child.children = grandchild.children;
				child.file_count = grandchild.file_count;
				child.dir_index_status = grandchild.dir_index_status;
			}
			collapse_single_child_dirs(child);
		}
	}
}

/** Collect all descendant file paths from a tree node. */
export function collect_file_paths(node: FileTreeNode): string[] {
	const paths: string[] = [];
	function walk(n: FileTreeNode): void {
		if (!n.is_dir) {
			paths.push(n.path);
		} else {
			for (const child of n.children) {
				walk(child);
			}
		}
	}
	walk(node);
	return paths;
}

/** Flatten the tree into a list of visible nodes, respecting the collapsed set. */
export function flatten_tree(
	roots: FileTreeNode[],
	collapsed: Set<string>,
): FlatTreeEntry[] {
	const result: FlatTreeEntry[] = [];

	function walk(
		nodes: FileTreeNode[],
		depth: number,
		parent_is_last: boolean[],
	): void {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const is_last = i === nodes.length - 1;
			result.push({
				node,
				depth,
				is_last,
				parent_is_last: [...parent_is_last],
			});

			if (node.is_dir && !collapsed.has(node.path)) {
				walk(node.children, depth + 1, [...parent_is_last, is_last]);
			}
		}
	}

	walk(roots, 0, []);
	return result;
}
