import type { QmdCollection, QmdIndex, QmdStatus } from "@contracts/qmd";
import type { QmdLogStats } from "@contracts/qmd-logs";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
	AlertTriangle,
	Plus,
	RefreshCw,
	ScrollText,
	Search,
	Trash2,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	qmd_add_collection,
	qmd_cleanup,
	qmd_create_index,
	qmd_delete_index,
	qmd_embed,
	qmd_get_status,
	qmd_list_collections,
	qmd_list_indexes,
	qmd_reindex,
	qmd_rename_index,
	qmd_set_global_context,
} from "@/api/qmd";
import { get_qmd_log_stats } from "@/api/qmd-logs";
import { AddCollectionDialog } from "@/components/add-collection-dialog";
import { create_qmd_collection_columns } from "@/components/columns/qmd-collection-columns";
import { CreateIndexDialog } from "@/components/create-index-dialog";
import { DataTable } from "@/components/data-table";
import { DeleteIndexDialog } from "@/components/delete-index-dialog";
import { GlobalContextEditor } from "@/components/global-context-editor";
import { IndexSelector } from "@/components/index-selector";
import { InfoTip } from "@/components/info-tip";
import { use_project_scope } from "@/components/project-scope-provider";
import { QmdFeatureGate } from "@/components/qmd-feature-gate";
import { QmdHealthBanner } from "@/components/qmd-health-banner";
import { QmdProgress } from "@/components/qmd-progress";
import { QmdSearchModal } from "@/components/qmd-search-modal";
import { StatCard } from "@/components/stat-card";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { use_qmd_operation } from "@/hooks/use-qmd-operation";
import { format_file_size, format_number } from "@/lib/format";
import { error_message } from "@/lib/utils";

const LAST_INDEX_KEY = "ariadne:qmd:last-index";

export function Qmd() {
	return (
		<QmdFeatureGate
			disabled_icon={ScrollText}
			disabled_title="QMD"
			disabled_description="QMD management and observability are behind a local experimental flag."
			unavailable_title="QMD requires qmd"
			unavailable_description="Install qmd on this machine before using Ariadne's QMD indexes and collections."
		>
			<QmdEnabled />
		</QmdFeatureGate>
	);
}

function QmdEnabled() {
	const { index: index_name } = useParams({ strict: false }) as {
		index: string;
	};
	const navigate = useNavigate();

	const [indexes, set_indexes] = useState<QmdIndex[]>([]);
	const [status, set_status] = useState<QmdStatus | null>(null);
	const [collections, set_collections] = useState<QmdCollection[]>([]);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);
	const [show_add_dialog, set_show_add_dialog] = useState(false);
	const [show_create_index_dialog, set_show_create_index_dialog] =
		useState(false);
	const [delete_target, set_delete_target] = useState<QmdIndex | null>(null);
	const [show_search, set_show_search] = useState(false);
	const [action_loading, set_action_loading] = useState<string | null>(null);
	const [log_stats, set_log_stats] = useState<QmdLogStats | null>(null);
	const {
		state: op_state,
		start_operation,
		clear_operation,
	} = use_qmd_operation();
	const { scope } = use_project_scope();
	const collection_columns = useMemo(
		() => create_qmd_collection_columns(index_name),
		[index_name],
	);

	// Save last-visited index
	useEffect(() => {
		if (index_name) {
			localStorage.setItem(LAST_INDEX_KEY, index_name);
		}
	}, [index_name]);

	const fetch_indexes = useCallback(async () => {
		try {
			const idxs = await qmd_list_indexes();
			set_indexes(idxs);
			return idxs;
		} catch {
			set_indexes([]);
			return [];
		}
	}, []);

	const fetch_data = useCallback(
		async (show_loading = false) => {
			try {
				if (show_loading) set_loading(true);
				set_error(null);

				const idxs = await fetch_indexes();

				// Auto-create default index if visiting /qmd/default and no index.sqlite exists
				const index_exists = idxs.some((idx) => idx.name === index_name);
				if (!index_exists && index_name === "default") {
					try {
						await qmd_create_index("default");
						await fetch_indexes();
					} catch {
						// The sidecar's createStore will create it on first use, that's fine
					}
				}

				try {
					const [s, cols] = await Promise.all([
						qmd_get_status(index_name),
						qmd_list_collections(index_name),
					]);
					set_status(s);
					set_collections(cols);
				} catch (_err) {
					// Index may not exist yet (first visit to a newly created index)
					set_status(null);
					set_collections([]);
				}
			} catch (err) {
				set_error(error_message(err, "Failed to load QMD data"));
			} finally {
				set_loading(false);
			}
		},
		[index_name, fetch_indexes],
	);

	useEffect(() => {
		fetch_data(true);
	}, [fetch_data]);

	// Load QMD log stats independently from the main page data
	useEffect(() => {
		let cancelled = false;
		get_qmd_log_stats(scope?.project_path)
			.then((stats) => {
				if (!cancelled) set_log_stats(stats);
			})
			.catch((err) => {
				if (import.meta.env.DEV)
					console.warn("QMD log stats fetch failed:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [scope?.project_path]);

	const handle_reindex = async () => {
		try {
			set_action_loading("reindex");
			start_operation("update");
			const result = await qmd_reindex(index_name);
			if (!result.success) set_error(result.output || "Re-index failed");
			await fetch_data();
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

	const handle_cleanup = async () => {
		try {
			set_action_loading("cleanup");
			start_operation("cleanup");
			const result = await qmd_cleanup(index_name);
			if (!result.success) set_error(result.output || "Cleanup failed");
			await fetch_data();
		} catch (err) {
			set_error(error_message(err, "Cleanup failed"));
		} finally {
			set_action_loading(null);
			clear_operation();
		}
	};

	const handle_add_collection = async (
		name: string,
		path: string,
		pattern?: string,
	) => {
		try {
			const result = await qmd_add_collection(index_name, name, path, pattern);
			if (!result.success)
				set_error(result.output || "Failed to add collection");
			await fetch_data();
		} catch (err) {
			set_error(error_message(err, "Failed to add collection"));
		}
	};

	const handle_save_global_context = async (text: string) => {
		try {
			const result = await qmd_set_global_context(index_name, text);
			if (!result.success)
				set_error(result.output || "Failed to save global context");
			await fetch_data();
		} catch (err) {
			set_error(error_message(err, "Failed to save global context"));
		}
	};

	const handle_navigate_index = (name: string) => {
		navigate({ to: "/qmd/$index", params: { index: name } });
	};

	const handle_create_index = async (name: string, description?: string) => {
		await qmd_create_index(name);
		if (description) {
			await qmd_set_global_context(name, description);
		}
		await fetch_indexes();
		navigate({ to: "/qmd/$index", params: { index: name } });
	};

	const handle_delete_index = async (name: string) => {
		await qmd_delete_index(name);
		await fetch_indexes();
		if (name === index_name) {
			navigate({ to: "/qmd/$index", params: { index: "default" } });
		}
	};

	const handle_rename_index = async (old_name: string, new_name: string) => {
		await qmd_rename_index(old_name, new_name);
		await fetch_indexes();
		if (old_name === index_name) {
			navigate({ to: "/qmd/$index", params: { index: new_name } });
		}
	};

	if (loading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-7 w-24" />
				<div className="flex flex-wrap gap-3">
					{[...Array(4)].map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
						<Skeleton key={i} className="h-[88px] flex-1 min-w-[140px]" />
					))}
				</div>
				<Skeleton className="h-48" />
				<Skeleton className="h-64" />
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="size-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	const banner_state = (() => {
		if (!status) return null;
		if (status.needs_embedding > 0) {
			return {
				kind: "needs_embedding" as const,
				count: status.needs_embedding,
				onEmbed: handle_embed,
			};
		}
		return null;
	})();

	return (
		<div className="space-y-4">
			{/* Index Selector */}
			<IndexSelector
				indexes={indexes}
				active_index={index_name}
				on_navigate={handle_navigate_index}
				on_create={() => set_show_create_index_dialog(true)}
				on_delete={(name) => {
					const idx = indexes.find((i) => i.name === name);
					if (idx) set_delete_target(idx);
				}}
				on_rename={handle_rename_index}
				disabled={op_state.is_busy}
			/>

			{/* Actions */}
			<div className="flex items-center justify-end gap-2 flex-wrap">
				{/* biome-ignore lint/a11y/useSemanticElements: div with role="button" for search trigger layout */}
				<div
					className={`flex items-center gap-2 rounded-none border border-input bg-background px-3 py-1 text-sm text-muted-foreground transition-colors ${
						op_state.is_busy || (status && status.embedded_chunks === 0)
							? "opacity-50 pointer-events-none"
							: "cursor-pointer hover:bg-accent hover:text-accent-foreground"
					}`}
					role="button"
					tabIndex={0}
					onClick={() => set_show_search(true)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") set_show_search(true);
					}}
				>
					<Search className="h-3.5 w-3.5" />
					<span>Search...</span>
				</div>
				<Link to="/qmd/logs">
					<Button size="sm" variant="outline" className="gap-1.5">
						<ScrollText className="h-3.5 w-3.5" />
						Logs
						{log_stats !== null && log_stats.total_calls > 0 && (
							<Badge
								variant="secondary"
								className="ml-0.5 text-[10px] px-1.5 py-0"
							>
								{format_number(log_stats.total_calls)}
							</Badge>
						)}
					</Button>
				</Link>
				<Button
					size="sm"
					variant="outline"
					onClick={() => set_show_add_dialog(true)}
					disabled={op_state.is_busy}
				>
					<Plus className="h-3.5 w-3.5 mr-1" />
					Add Collection
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handle_reindex}
					disabled={op_state.is_busy}
				>
					<RefreshCw
						className={`h-3.5 w-3.5 mr-1 ${action_loading === "reindex" ? "animate-spin" : ""}`}
					/>
					Re-index All
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handle_embed}
					disabled={op_state.is_busy}
				>
					<Zap className="h-3.5 w-3.5 mr-1" />
					Embed All
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handle_cleanup}
					disabled={op_state.is_busy}
				>
					<Trash2 className="h-3.5 w-3.5 mr-1" />
					Cleanup
				</Button>
				<InfoTip title="Actions" side="bottom" align="end">
					<div className="space-y-1.5">
						<p>
							<strong>Re-index All</strong> — Scans all collections for new,
							changed, or removed files and updates the index.
						</p>
						<p>
							<strong>Embed All</strong> — Generates vector embeddings for any
							documents that haven't been embedded yet. Required for semantic
							search.
						</p>
						<p>
							<strong>Cleanup</strong> — Removes orphaned data from the database
							(deleted files, stale entries) and reclaims disk space.
						</p>
					</div>
				</InfoTip>
			</div>

			{op_state.is_busy && op_state.operation && (
				<QmdProgress
					operation={op_state.operation}
					progress={op_state.progress}
				/>
			)}

			{error && (
				<Alert variant="destructive">
					<AlertTriangle className="size-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
					<AlertAction>
						<Button size="sm" variant="ghost" onClick={() => set_error(null)}>
							Dismiss
						</Button>
					</AlertAction>
				</Alert>
			)}

			{banner_state && <QmdHealthBanner state={banner_state} />}

			{status && (
				<div className="flex flex-wrap gap-3">
					<StatCard
						label="Total Documents"
						value={format_number(status.active_documents)}
						sub_label={`${format_number(status.total_documents)} total`}
						info_tip={
							<InfoTip title="Total Documents" side="bottom" align="center">
								<p>
									The number of actively indexed files across all collections.
									The "total" count includes inactive or removed documents still
									in the database — run <strong>Cleanup</strong> to purge them.
								</p>
							</InfoTip>
						}
					/>
					<StatCard
						label="Embedded Chunks"
						value={format_number(status.embedded_chunks)}
						sub_label={
							status.needs_embedding > 0
								? `${format_number(status.needs_embedding)} pending`
								: undefined
						}
						info_tip={
							<InfoTip title="Embedded Chunks" side="bottom" align="center">
								<div className="space-y-1.5">
									<p>
										Documents are split into smaller <strong>chunks</strong> and
										converted into vector embeddings — numerical representations
										of their meaning.
									</p>
									<p>
										This enables semantic search: finding content by what it
										means, not just matching exact words. If chunks are
										"pending", click <strong>Embed All</strong> to process them.
									</p>
								</div>
							</InfoTip>
						}
					/>
					<StatCard
						label="Collections"
						value={format_number(status.collection_count)}
						info_tip={
							<InfoTip title="Collections" side="bottom" align="center">
								<p>
									A <strong>collection</strong> is a group of files from a
									specific directory that share a glob pattern (e.g.{" "}
									<code className="bg-muted px-1 rounded text-[11px]">
										**/*.md
									</code>
									). Each collection is indexed and embedded independently. You
									can add context descriptions to help QMD understand what the
									files are about.
								</p>
							</InfoTip>
						}
					/>
					<StatCard
						label="DB Size"
						value={format_file_size(status.db_size_bytes)}
					/>
					<StatCard
						label="Last Indexed"
						value={
							status.days_since_update === null
								? "—"
								: status.days_since_update === 0
									? "today"
									: `${status.days_since_update}d ago`
						}
						info_tip={
							<InfoTip title="Last Indexed" side="bottom" align="end">
								<p>
									Based on the most recent file modification date across all
									indexed documents. This reflects when the content was last
									changed on disk, not when you last ran re-index.
								</p>
							</InfoTip>
						}
					/>
				</div>
			)}

			{status && (
				<GlobalContextEditor
					value={status.global_context}
					onSave={handle_save_global_context}
				/>
			)}

			<div>
				<div className="flex items-center gap-2 mb-4">
					<h2 className="text-lg font-semibold text-foreground">Collections</h2>
					<InfoTip title="What is a Collection?" side="bottom" align="start">
						<div className="space-y-1.5">
							<p>
								A collection maps to a folder on your filesystem. It defines
								which files to index using a <strong>glob pattern</strong> (e.g.{" "}
								<code className="bg-muted px-1 rounded text-[11px]">
									**/*.md
								</code>{" "}
								for all markdown files).
							</p>
							<p>
								Each collection can have its own <strong>contexts</strong> —
								descriptions attached to path prefixes that help QMD understand
								what different parts of your docs are about. This improves
								search relevance.
							</p>
						</div>
					</InfoTip>
				</div>
				{collections.length === 0 ? (
					<div className="rounded-none border border-border p-8 text-center space-y-3">
						<p className="text-muted-foreground">No collections yet.</p>
						<Button onClick={() => set_show_add_dialog(true)}>
							<Plus className="h-4 w-4 mr-2" />
							Add your first collection
						</Button>
					</div>
				) : (
					<DataTable
						columns={collection_columns}
						data={collections}
						filter_column="name"
						filter_placeholder="Search collections..."
					/>
				)}
			</div>

			{show_add_dialog && (
				<AddCollectionDialog
					onAdd={handle_add_collection}
					onClose={() => set_show_add_dialog(false)}
				/>
			)}

			{show_create_index_dialog && (
				<CreateIndexDialog
					existing_names={indexes.map((i) => i.name)}
					on_create={handle_create_index}
					on_close={() => set_show_create_index_dialog(false)}
				/>
			)}

			{delete_target && (
				<DeleteIndexDialog
					index={delete_target}
					on_delete={handle_delete_index}
					on_close={() => set_delete_target(null)}
				/>
			)}

			<QmdSearchModal
				open={show_search}
				on_close={() => set_show_search(false)}
				index_name={index_name}
				collections={collections}
			/>
		</div>
	);
}
