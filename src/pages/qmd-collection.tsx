import type { QmdCollectionDetail, QmdIndex } from "@contracts/qmd";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
	AlertTriangle as AlertTriangleIcon,
	FolderTree,
	MessageSquare,
	RefreshCw,
	Settings,
	Trash2,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	qmd_add_context,
	qmd_embed,
	qmd_get_collection_detail,
	qmd_get_indexed_paths,
	qmd_list_indexes,
	qmd_reindex,
	qmd_remove_collection,
	qmd_remove_context,
	qmd_scan_filesystem,
	qmd_toggle_files,
} from "@/api/qmd";
import { CollectionFileTree } from "@/components/collection-file-tree";
import { ContextEditor } from "@/components/context-editor";
import { IndexSelector } from "@/components/index-selector";
import { InfoTip } from "@/components/info-tip";
import { QmdFeatureGate } from "@/components/qmd-feature-gate";
import { QmdProgress } from "@/components/qmd-progress";
import { StatCard } from "@/components/stat-card";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { use_qmd_operation } from "@/hooks/use-qmd-operation";
import { format_date_relative, format_number } from "@/lib/format";
import { resolve_indexed_paths } from "@/lib/qmd-tree";
import { error_message } from "@/lib/utils";

const LAST_INDEX_KEY = "ariadne:qmd:last-index";

export function QmdCollection() {
	return (
		<QmdFeatureGate
			disabled_icon={Settings}
			disabled_title="QMD collection"
			disabled_description="Collection-level QMD controls are disabled until the QMD experimental setting is turned back on."
			unavailable_title="QMD collections require qmd"
			unavailable_description="Install qmd on this machine before opening collection-level QMD controls."
		>
			<QmdCollectionEnabled />
		</QmdFeatureGate>
	);
}

function QmdCollectionEnabled() {
	const { index: index_name, collection: collection_name } = useParams({
		strict: false,
	}) as {
		index: string;
		collection: string;
	};
	const navigate = useNavigate();
	const [indexes, set_indexes] = useState<QmdIndex[]>([]);
	const [detail, set_detail] = useState<QmdCollectionDetail | null>(null);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);
	const [action_loading, set_action_loading] = useState<string | null>(null);
	const [confirm_remove, set_confirm_remove] = useState(false);
	const [active_tab, set_active_tab] = useState("files");
	const {
		state: op_state,
		start_operation,
		clear_operation,
	} = use_qmd_operation();

	// File tree data (loaded separately, can be slow)
	const [fs_paths, set_fs_paths] = useState<string[] | null>(null);
	const [indexed_paths, set_indexed_paths] = useState<string[] | null>(null);
	const [tree_loading, set_tree_loading] = useState(false);
	const [tree_error, set_tree_error] = useState<string | null>(null);

	// Save last-visited index
	useEffect(() => {
		if (index_name) {
			localStorage.setItem(LAST_INDEX_KEY, index_name);
		}
	}, [index_name]);

	const fetch_indexes = async () => {
		try {
			const idxs = await qmd_list_indexes();
			set_indexes(idxs);
		} catch {
			set_indexes([]);
		}
	};

	const fetch_data = async (show_loading = false) => {
		if (!collection_name) return;
		try {
			if (show_loading) set_loading(true);
			set_error(null);
			await fetch_indexes();
			const d = await qmd_get_collection_detail(index_name, collection_name);
			set_detail(d);
		} catch (err) {
			set_error(error_message(err, "Failed to load collection"));
		} finally {
			set_loading(false);
		}
	};

	const fetch_tree_data = async () => {
		if (!collection_name) return;
		try {
			set_tree_loading(true);
			set_tree_error(null);
			const [fs, db_idx] = await Promise.all([
				qmd_scan_filesystem(index_name, collection_name),
				qmd_get_indexed_paths(index_name, collection_name),
			]);
			const resolved = resolve_indexed_paths(fs, db_idx);
			set_fs_paths(fs);
			set_indexed_paths([...resolved]);
		} catch (err) {
			set_tree_error(error_message(err, "Failed to scan files"));
		} finally {
			set_tree_loading(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-fetch when route params change
	useEffect(() => {
		fetch_data(true);
	}, [index_name, collection_name]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fetch tree only when tab or collection changes
	useEffect(() => {
		if (active_tab === "files" && fs_paths === null && !tree_loading) {
			fetch_tree_data();
		}
	}, [active_tab, collection_name]);

	const handle_reindex = async () => {
		try {
			set_action_loading("reindex");
			start_operation("update");
			const result = await qmd_reindex(index_name);
			if (!result.success) set_error(result.output || "Re-index failed");
			await fetch_data();
			await fetch_tree_data();
		} catch (err) {
			set_error(error_message(err, "Re-index failed"));
		} finally {
			set_action_loading(null);
			clear_operation();
		}
	};

	const handle_embed = async () => {
		try {
			set_action_loading("embed");
			start_operation("embed");
			const result = await qmd_embed(index_name);
			if (!result.success) set_error(result.output || "Embed failed");
			await fetch_data();
		} catch (err) {
			set_error(error_message(err, "Embed failed"));
		} finally {
			set_action_loading(null);
			clear_operation();
		}
	};

	const handle_remove = async () => {
		try {
			set_action_loading("remove");
			const result = await qmd_remove_collection(index_name, collection_name);
			if (result.success) {
				navigate({ to: "/qmd/$index", params: { index: index_name } });
			} else {
				set_error(result.output || "Failed to remove collection");
			}
		} catch (err) {
			set_error(error_message(err, "Failed to remove collection"));
		} finally {
			set_action_loading(null);
		}
	};

	const handle_add_context = async (path: string, description: string) => {
		await qmd_add_context(index_name, collection_name, path, description);
		await fetch_data();
	};

	const handle_remove_context = async (path: string) => {
		await qmd_remove_context(index_name, collection_name, path);
		await fetch_data();
	};

	const handle_apply_toggle = async (adds: string[], removes: string[]) => {
		if (!detail) return;
		await qmd_toggle_files(
			index_name,
			collection_name,
			detail.collection.path,
			adds,
			removes,
		);
		await fetch_data();
		await fetch_tree_data();
	};

	const handle_navigate_index = (name: string) => {
		navigate({ to: "/qmd/$index", params: { index: name } });
	};

	if (loading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-7 w-32" />
				<div className="flex flex-wrap gap-3">
					{[...Array(3)].map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
						<Skeleton key={i} className="h-[88px] flex-1 min-w-[140px]" />
					))}
				</div>
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-64" />
			</div>
		);
	}

	if (error && !detail) {
		return (
			<div className="space-y-4">
				<IndexSelector
					indexes={indexes}
					active_index={index_name}
					on_navigate={handle_navigate_index}
					on_create={() => {}}
					on_delete={() => {}}
					on_rename={() => {}}
					disabled={op_state.is_busy}
				/>
				<Alert variant="destructive">
					<AlertTriangleIcon className="size-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			</div>
		);
	}

	if (!detail) return null;

	const { collection } = detail;
	const needs_embedding =
		collection.active_doc_count - collection.embedded_count;

	return (
		<div className="space-y-4">
			{/* Index Selector */}
			<IndexSelector
				indexes={indexes}
				active_index={index_name}
				on_navigate={handle_navigate_index}
				on_create={() => {}}
				on_delete={() => {}}
				on_rename={() => {}}
				disabled={op_state.is_busy}
			/>

			{/* Actions */}
			<div className="flex items-center justify-end gap-2 flex-wrap">
				<Button
					size="sm"
					variant="outline"
					onClick={handle_reindex}
					disabled={op_state.is_busy}
				>
					<RefreshCw
						className={`h-3.5 w-3.5 mr-1 ${action_loading === "reindex" ? "animate-spin" : ""}`}
					/>
					Re-index
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handle_embed}
					disabled={op_state.is_busy}
				>
					<Zap className="h-3.5 w-3.5 mr-1" />
					Embed
				</Button>
				{confirm_remove ? (
					<div className="flex items-center gap-1">
						<span className="text-xs text-muted-foreground">
							Remove collection?
						</span>
						<Button
							size="sm"
							variant="destructive"
							onClick={handle_remove}
							disabled={op_state.is_busy}
						>
							Confirm
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => set_confirm_remove(false)}
						>
							Cancel
						</Button>
					</div>
				) : (
					<Button
						size="sm"
						variant="destructive"
						onClick={() => set_confirm_remove(true)}
						disabled={op_state.is_busy}
					>
						<Trash2 className="h-3.5 w-3.5 mr-1" />
						Remove
					</Button>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<Alert variant="destructive">
					<AlertTriangleIcon className="size-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
					<AlertAction>
						<Button size="sm" variant="ghost" onClick={() => set_error(null)}>
							Dismiss
						</Button>
					</AlertAction>
				</Alert>
			)}

			{/* Progress */}
			{op_state.is_busy && op_state.operation && (
				<QmdProgress
					operation={op_state.operation}
					progress={op_state.progress}
				/>
			)}

			{/* Stat Cards */}
			<div className="flex flex-wrap gap-3">
				<StatCard
					label="Documents"
					value={format_number(collection.active_doc_count)}
					info_tip={
						<InfoTip title="Documents" side="bottom" align="center">
							<p>
								The number of active files in this collection that have been
								indexed by QMD. Only files matching the collection's glob
								pattern and that are toggled on in the Files tab are counted.
							</p>
						</InfoTip>
					}
				/>
				<StatCard
					label="Needing Embedding"
					value={format_number(Math.max(0, needs_embedding))}
					info_tip={
						<InfoTip title="Needing Embedding" side="bottom" align="center">
							<p>
								Documents that have been indexed but not yet converted into
								vector embeddings. Embeddings enable semantic search — finding
								documents by meaning rather than exact keywords. Click{" "}
								<strong>Embed</strong> to process these.
							</p>
						</InfoTip>
					}
				/>
				<StatCard
					label="Last Updated"
					value={
						collection.last_modified
							? format_date_relative(collection.last_modified)
							: "—"
					}
				/>
			</div>

			{/* Tabs */}
			<Tabs value={active_tab} onValueChange={set_active_tab}>
				<TabsList variant="line">
					<TabsTrigger value="files">
						<FolderTree className="size-4" />
						Files
					</TabsTrigger>
					<TabsTrigger value="settings">
						<Settings className="size-4" />
						Settings
					</TabsTrigger>
					<TabsTrigger value="contexts">
						<MessageSquare className="size-4" />
						Contexts
						{collection.contexts.length > 0 && (
							<Badge variant="secondary">{collection.contexts.length}</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="files">
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<InfoTip title="File Tree" side="bottom" align="start">
								<div className="space-y-2">
									<p>
										This tree shows all files matching the collection's glob
										pattern. Click files or folders to toggle them in or out of
										the index.
									</p>
									<p className="font-medium text-foreground">
										Status indicators:
									</p>
									<ul className="space-y-1 ml-1">
										<li>
											<span className="font-mono text-foreground">●</span> —
											Fully indexed
										</li>
										<li>
											<span className="font-mono text-foreground">◐</span> —
											Partially indexed (some children)
										</li>
										<li>
											<span className="font-mono text-foreground">○</span> — Not
											indexed
										</li>
										<li>
											<span className="font-mono text-yellow-500">◉</span> —
											Pending add (will be indexed)
										</li>
										<li>
											<span className="font-mono text-yellow-500">◎</span> —
											Pending remove (will be unindexed)
										</li>
									</ul>
									<p>
										Changes are staged until you click{" "}
										<strong>Apply Changes</strong>.
									</p>
								</div>
							</InfoTip>
						</div>
						{tree_loading ? (
							<div className="space-y-2">
								<Skeleton className="h-8 w-48" />
								<Skeleton className="h-[400px]" />
							</div>
						) : tree_error ? (
							<Card>
								<CardContent className="py-8 text-center text-muted-foreground">
									{tree_error}
								</CardContent>
							</Card>
						) : fs_paths && indexed_paths ? (
							<CollectionFileTree
								filesystem_paths={fs_paths}
								indexed_paths={indexed_paths}
								collection_name={collection_name}
								repo_root={collection.path}
								on_apply={handle_apply_toggle}
							/>
						) : null}
					</div>
				</TabsContent>

				<TabsContent value="settings">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-base">Collection Settings</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
								<div>
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
										Path
									</p>
									<p className="text-foreground font-mono text-xs break-all">
										{collection.path}
									</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
										Glob Pattern
										<InfoTip title="Glob Pattern" side="bottom" align="start">
											<div className="space-y-1.5">
												<p>
													A pattern that determines which files QMD will
													discover in this collection's directory.
												</p>
												<p className="font-medium text-foreground">
													Common patterns:
												</p>
												<ul className="space-y-0.5 ml-1">
													<li>
														<code className="bg-muted px-1 rounded text-[11px]">
															**/*.md
														</code>{" "}
														— All markdown files, any depth
													</li>
													<li>
														<code className="bg-muted px-1 rounded text-[11px]">
															{"docs/**/*.md"}
														</code>{" "}
														— Only in the docs folder
													</li>
													<li>
														<code className="bg-muted px-1 rounded text-[11px]">
															*.md
														</code>{" "}
														— Only top-level markdown files
													</li>
												</ul>
											</div>
										</InfoTip>
									</p>
									<p className="text-foreground font-mono text-xs">
										{collection.pattern}
									</p>
								</div>
								{collection.ignore_patterns.length > 0 && (
									<div>
										<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
											Ignore Patterns
										</p>
										<div className="flex flex-wrap gap-1">
											{collection.ignore_patterns.map((p) => (
												<Badge
													key={p}
													variant="secondary"
													className="font-mono"
												>
													{p}
												</Badge>
											))}
										</div>
									</div>
								)}
								<div>
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
										Include by Default
										<InfoTip
											title="Include by Default"
											side="bottom"
											align="start"
										>
											<p>
												When enabled, all files matching the glob pattern are
												automatically included in the index. When disabled, you
												must manually toggle individual files on in the Files
												tab. Useful for large repos where you only want to index
												specific documents.
											</p>
										</InfoTip>
									</p>
									<Badge
										variant={
											collection.include_by_default ? "default" : "secondary"
										}
									>
										{collection.include_by_default ? "Yes" : "No"}
									</Badge>
								</div>
								{collection.update_command && (
									<div className="sm:col-span-2">
										<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
											Update Command
										</p>
										<p className="text-foreground font-mono text-xs">
											{collection.update_command}
										</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="contexts">
					<ContextEditor
						contexts={collection.contexts}
						onAdd={handle_add_context}
						onRemove={handle_remove_context}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
