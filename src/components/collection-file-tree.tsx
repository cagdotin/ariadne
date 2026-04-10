import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileTreeNode } from "@/lib/qmd-tree";
import { build_file_tree, collect_file_paths } from "@/lib/qmd-tree";
import { ToggleState } from "@/lib/toggle-state";
import { cn } from "@/lib/utils";

interface CollectionFileTreeProps {
	filesystem_paths: string[];
	indexed_paths: string[];
	collection_name: string;
	repo_root: string;
	on_apply: (adds: string[], removes: string[]) => Promise<void>;
}

export function CollectionFileTree({
	filesystem_paths,
	indexed_paths,
	collection_name: _collection_name,
	repo_root: _repo_root,
	on_apply,
}: CollectionFileTreeProps) {
	const [toggle, set_toggle] = useState(() => new ToggleState(indexed_paths));
	const [collapsed, set_collapsed] = useState<Set<string>>(() => new Set());
	const [applying, set_applying] = useState(false);
	// Force re-renders when toggle mutates
	const [, set_tick] = useState(0);

	const tree_roots = useMemo(
		() => build_file_tree(filesystem_paths, toggle.indexed_set),
		[filesystem_paths, toggle.indexed_set],
	);

	const indexed_count = useMemo(() => {
		let count = 0;
		for (const p of filesystem_paths) {
			if (toggle.is_effectively_indexed(p)) count++;
		}
		return count;
	}, [filesystem_paths, toggle]);

	const pending_count = toggle.pending_count();

	const handle_toggle_expand = useCallback((path: string) => {
		set_collapsed((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}, []);

	const handle_toggle_inclusion = useCallback(
		(node: FileTreeNode) => {
			toggle.toggle_node(node);
			set_tick((t) => t + 1);
		},
		[toggle],
	);

	const handle_apply = async () => {
		if (!toggle.has_pending()) return;
		set_applying(true);
		try {
			const adds = [...toggle.pending_adds];
			const removes = [...toggle.pending_removes];
			await on_apply(adds, removes);
			// Reset toggle state after successful apply — parent will refresh paths
		} catch (err) {
			console.error("[CollectionFileTree] Apply failed:", err);
		} finally {
			set_applying(false);
		}
	};

	// Reset toggle when indexed_paths change (e.g. after apply + refresh)
	useMemo(() => {
		set_toggle(new ToggleState(indexed_paths));
	}, [indexed_paths]);

	if (filesystem_paths.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No files found. The collection path may not exist or the glob pattern
					matches no files.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-base">
						<span className="text-primary">{indexed_count}</span>
						<span className="text-muted-foreground">
							/{filesystem_paths.length} indexed
						</span>
					</CardTitle>
					<div className="flex items-center gap-3">
						{pending_count > 0 && (
							<>
								<span className="text-sm text-yellow-500">
									{pending_count} pending
								</span>
								<Button size="sm" onClick={handle_apply} disabled={applying}>
									{applying ? "Applying..." : `Apply ${pending_count} Changes`}
								</Button>
							</>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className="max-h-[600px] overflow-y-auto px-2 py-1">
					{tree_roots.map((node, i) => (
						<TreeNodeRow
							key={node.path}
							node={node}
							depth={0}
							is_last={i === tree_roots.length - 1}
							collapsed={collapsed}
							toggle={toggle}
							on_toggle_expand={handle_toggle_expand}
							on_toggle_inclusion={handle_toggle_inclusion}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

// ── Indicator Circle ──────────────────────────────────────

function IndicatorCircle({
	node,
	toggle,
	on_click,
}: {
	node: FileTreeNode;
	toggle: ToggleState;
	on_click: () => void;
}) {
	let symbol: string;
	let color_class: string;

	if (node.is_dir) {
		const descendant_paths = collect_file_paths(node);
		if (descendant_paths.length === 0) {
			symbol = "○";
			color_class = "text-muted-foreground";
		} else {
			let idx_count = 0;
			let has_pending = false;
			for (const p of descendant_paths) {
				if (toggle.is_effectively_indexed(p)) idx_count++;
				if (toggle.pending_adds.has(p) || toggle.pending_removes.has(p))
					has_pending = true;
			}
			const base_color = has_pending ? "text-yellow-500" : "text-primary";
			if (idx_count === descendant_paths.length) {
				symbol = "●";
				color_class = base_color;
			} else if (idx_count > 0) {
				symbol = "◐";
				color_class = base_color;
			} else {
				symbol = "○";
				color_class = has_pending ? "text-yellow-500" : "text-muted-foreground";
			}
		}
	} else {
		const is_pending_add = toggle.pending_adds.has(node.path);
		const is_pending_remove = toggle.pending_removes.has(node.path);
		if (is_pending_add) {
			symbol = "◉";
			color_class = "text-primary";
		} else if (is_pending_remove) {
			symbol = "◎";
			color_class = "text-yellow-500";
		} else if (toggle.indexed_set.has(node.path)) {
			symbol = "●";
			color_class = "text-primary";
		} else {
			symbol = "○";
			color_class = "text-muted-foreground";
		}
	}

	return (
		<Button
			variant="ghost"
			size="icon-xs"
			onClick={(e) => {
				e.stopPropagation();
				on_click();
			}}
			className={cn(
				"shrink-0 text-sm leading-none hover:scale-125",
				color_class,
			)}
			title={node.is_dir ? "Toggle all files in folder" : "Toggle inclusion"}
		>
			{symbol}
		</Button>
	);
}

// ── Recursive Tree Node Row ───────────────────────────────

function TreeNodeRow({
	node,
	depth,
	is_last: _is_last,
	collapsed,
	toggle,
	on_toggle_expand,
	on_toggle_inclusion,
}: {
	node: FileTreeNode;
	depth: number;
	is_last: boolean;
	collapsed: Set<string>;
	toggle: ToggleState;
	on_toggle_expand: (path: string) => void;
	on_toggle_inclusion: (node: FileTreeNode) => void;
}) {
	const is_expanded = node.is_dir && !collapsed.has(node.path);
	const has_children = node.is_dir && node.children.length > 0;
	const indent = depth * 20;

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: conditional role="button" applied when has_children */}
			<div
				className={cn(
					"flex items-center gap-1.5 py-0.5 px-1 rounded-sm text-sm",
					"hover:bg-accent/50 transition-colors",
					node.is_dir ? "cursor-pointer" : "",
				)}
				style={{ paddingLeft: indent + 4 }}
				role={has_children ? "button" : undefined}
				tabIndex={has_children ? 0 : undefined}
				onClick={has_children ? () => on_toggle_expand(node.path) : undefined}
				onKeyDown={
					has_children
						? (e) => {
								if (e.key === "Enter" || e.key === " ")
									on_toggle_expand(node.path);
							}
						: undefined
				}
			>
				<IndicatorCircle
					node={node}
					toggle={toggle}
					on_click={() => on_toggle_inclusion(node)}
				/>

				{has_children ? (
					is_expanded ? (
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					)
				) : (
					<span className="w-3.5 shrink-0" />
				)}

				<span className={cn("truncate", node.is_dir ? "font-medium" : "")}>
					{node.name}
					{node.is_dir ? "/" : ""}
				</span>

				{node.is_dir && (
					<span className="text-xs text-muted-foreground ml-auto shrink-0">
						({node.file_count})
					</span>
				)}
			</div>

			{is_expanded &&
				has_children &&
				node.children.map((child, i) => (
					<TreeNodeRow
						key={child.path}
						node={child}
						depth={depth + 1}
						is_last={i === node.children.length - 1}
						collapsed={collapsed}
						toggle={toggle}
						on_toggle_expand={on_toggle_expand}
						on_toggle_inclusion={on_toggle_inclusion}
					/>
				))}
		</>
	);
}
