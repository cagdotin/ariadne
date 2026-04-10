import type { FlatTreeNode, SessionEntry, TreeNode } from "../types";

// ============================================================
// TREE BUILDING
// ============================================================

export function build_tree(
	entries: SessionEntry[],
	label_map: Map<string, string>,
): TreeNode[] {
	const node_map = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	for (const entry of entries) {
		node_map.set(entry.id, {
			entry,
			children: [],
			label: label_map.get(entry.id),
		});
	}

	for (const entry of entries) {
		// biome-ignore lint/style/noNonNullAssertion: populated from same entries
		const node = node_map.get(entry.id)!;
		if (
			entry.parentId === null ||
			entry.parentId === undefined ||
			entry.parentId === entry.id
		) {
			roots.push(node);
		} else {
			const parent = node_map.get(entry.parentId);
			if (parent) {
				parent.children.push(node);
			} else {
				roots.push(node);
			}
		}
	}

	function sort_children(node: TreeNode) {
		node.children.sort(
			(a, b) =>
				new Date(a.entry.timestamp).getTime() -
				new Date(b.entry.timestamp).getTime(),
		);
		node.children.forEach(sort_children);
	}
	roots.forEach(sort_children);

	return roots;
}

// ============================================================
// PATH FROM ROOT TO LEAF
// ============================================================

export function get_path(
	entries: SessionEntry[],
	leaf_id: string,
): SessionEntry[] {
	const by_id = new Map<string, SessionEntry>();
	for (const e of entries) by_id.set(e.id, e);

	const path: SessionEntry[] = [];
	let current = by_id.get(leaf_id);
	while (current) {
		path.unshift(current);
		if (!current.parentId || current.parentId === current.id) break;
		current = by_id.get(current.parentId);
	}
	return path;
}

export function build_active_path_ids(
	entries: SessionEntry[],
	leaf_id: string,
): Set<string> {
	const by_id = new Map<string, SessionEntry>();
	for (const e of entries) by_id.set(e.id, e);

	const ids = new Set<string>();
	let current = by_id.get(leaf_id);
	while (current) {
		ids.add(current.id);
		if (!current.parentId || current.parentId === current.id) break;
		current = by_id.get(current.parentId);
	}
	return ids;
}

// ============================================================
// FIND NEWEST LEAF
// ============================================================

export function find_newest_leaf(
	node_id: string,
	entries: SessionEntry[],
	label_map: Map<string, string>,
): string {
	const tree = build_tree(entries, label_map);
	const node_map = new Map<string, TreeNode>();
	function map_nodes(node: TreeNode) {
		node_map.set(node.entry.id, node);
		node.children.forEach(map_nodes);
	}
	tree.forEach(map_nodes);

	const node = node_map.get(node_id);
	if (!node) return node_id;

	let current = node;
	while (current.children.length > 0) {
		current = current.children[current.children.length - 1];
	}
	return current.entry.id;
}

// ============================================================
// FLATTEN TREE (for sidebar rendering)
// ============================================================

export function flatten_tree(
	roots: TreeNode[],
	active_path_ids: Set<string>,
): FlatTreeNode[] {
	const result: FlatTreeNode[] = [];
	const multiple_roots = roots.length > 1;

	// mark which subtrees contain active leaf
	const contains_active = new Map<TreeNode, boolean>();
	function mark_active(node: TreeNode): boolean {
		let has = active_path_ids.has(node.entry.id);
		for (const child of node.children) {
			if (mark_active(child)) has = true;
		}
		contains_active.set(node, has);
		return has;
	}
	roots.forEach(mark_active);

	type StackItem = [
		TreeNode,
		number,
		boolean,
		boolean,
		boolean,
		{ position: number; show: boolean }[],
		boolean,
	];
	const stack: StackItem[] = [];

	const ordered_roots = [...roots].sort(
		(a, b) => Number(contains_active.get(b)) - Number(contains_active.get(a)),
	);
	for (let i = ordered_roots.length - 1; i >= 0; i--) {
		const is_last = i === ordered_roots.length - 1;
		stack.push([
			ordered_roots[i],
			multiple_roots ? 1 : 0,
			multiple_roots,
			multiple_roots,
			is_last,
			[],
			multiple_roots,
		]);
	}

	while (stack.length > 0) {
		const [
			node,
			indent,
			just_branched,
			show_connector,
			is_last,
			gutters,
			is_virtual_root_child,
			// biome-ignore lint/style/noNonNullAssertion: guarded by while loop condition
		] = stack.pop()!;

		result.push({
			node,
			indent,
			show_connector,
			is_last,
			gutters,
			is_virtual_root_child,
			multiple_roots,
		});

		const children = node.children;
		const multiple_children = children.length > 1;

		const ordered_children = [...children].sort(
			(a, b) => Number(contains_active.get(b)) - Number(contains_active.get(a)),
		);

		let child_indent: number;
		if (multiple_children) {
			child_indent = indent + 1;
		} else if (just_branched && indent > 0) {
			child_indent = indent + 1;
		} else {
			child_indent = indent;
		}

		const connector_displayed = show_connector && !is_virtual_root_child;
		const current_display_indent = multiple_roots
			? Math.max(0, indent - 1)
			: indent;
		const connector_position = Math.max(0, current_display_indent - 1);
		const child_gutters = connector_displayed
			? [...gutters, { position: connector_position, show: !is_last }]
			: gutters;

		for (let i = ordered_children.length - 1; i >= 0; i--) {
			const child_is_last = i === ordered_children.length - 1;
			stack.push([
				ordered_children[i],
				child_indent,
				multiple_children,
				multiple_children,
				child_is_last,
				child_gutters,
				false,
			]);
		}
	}

	return result;
}

// ============================================================
// TREE PREFIX (ASCII connectors)
// ============================================================

export function build_tree_prefix(flat_node: FlatTreeNode): string {
	const {
		indent,
		show_connector,
		is_last,
		gutters,
		is_virtual_root_child,
		multiple_roots,
	} = flat_node;
	const display_indent = multiple_roots ? Math.max(0, indent - 1) : indent;
	const connector =
		show_connector && !is_virtual_root_child ? (is_last ? "└─ " : "├─ ") : "";
	const connector_position = connector ? display_indent - 1 : -1;

	const total_chars = display_indent * 3;
	const prefix_chars: string[] = [];
	for (let i = 0; i < total_chars; i++) {
		const level = Math.floor(i / 3);
		const pos_in_level = i % 3;

		const gutter = gutters.find((g) => g.position === level);
		if (gutter) {
			prefix_chars.push(pos_in_level === 0 ? (gutter.show ? "│" : " ") : " ");
		} else if (connector && level === connector_position) {
			if (pos_in_level === 0) {
				prefix_chars.push(is_last ? "└" : "├");
			} else if (pos_in_level === 1) {
				prefix_chars.push("─");
			} else {
				prefix_chars.push(" ");
			}
		} else {
			prefix_chars.push(" ");
		}
	}
	return prefix_chars.join("");
}
