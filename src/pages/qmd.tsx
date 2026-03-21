import { useState, useEffect } from "react";
import type { QmdStatus, QmdCollection, QmdAvailability } from "@/schemas/qmd";
import {
  qmd_check_availability,
  qmd_get_status,
  qmd_list_collections,
  qmd_add_collection,
  qmd_set_global_context,
  qmd_reindex,
  qmd_embed,
  qmd_cleanup,
} from "@/api/qmd";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { qmd_collection_columns } from "@/components/columns/qmd-collection-columns";
import { QmdHealthBanner } from "@/components/qmd-health-banner";
import { GlobalContextEditor } from "@/components/global-context-editor";
import { AddCollectionDialog } from "@/components/add-collection-dialog";
import { QmdProgress } from "@/components/qmd-progress";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format_number, format_file_size } from "@/lib/format";
import { error_message } from "@/lib/utils";
import { RefreshCw, Plus, Zap, Trash2 } from "lucide-react";
import { use_qmd_operation } from "@/hooks/use-qmd-operation";

export function Qmd() {
  const [availability, set_availability] = useState<QmdAvailability | null>(null);
  const [status, set_status] = useState<QmdStatus | null>(null);
  const [collections, set_collections] = useState<QmdCollection[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [show_add_dialog, set_show_add_dialog] = useState(false);
  const [action_loading, set_action_loading] = useState<string | null>(null);
  const { state: op_state, start_operation, clear_operation } = use_qmd_operation();

  const fetch_data = async () => {
    try {
      set_loading(true);
      set_error(null);
      const avail = await qmd_check_availability();
      set_availability(avail);
      if (!avail.installed) return;
      const [s, cols] = await Promise.all([qmd_get_status(), qmd_list_collections()]);
      set_status(s);
      set_collections(cols);
    } catch (err) {
      set_error(error_message(err, "Failed to load QMD data"));
    } finally {
      set_loading(false);
    }
  };

  useEffect(() => { fetch_data(); }, []);

  const handle_reindex = async () => {
    try {
      set_action_loading("reindex");
      start_operation("update");
      const result = await qmd_reindex();
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
      const result = await qmd_embed();
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
      const result = await qmd_cleanup();
      if (!result.success) set_error(result.output || "Cleanup failed");
      await fetch_data();
    } catch (err) {
      set_error(error_message(err, "Cleanup failed"));
    } finally {
      set_action_loading(null);
      clear_operation();
    }
  };

  const handle_add_collection = async (name: string, path: string, pattern?: string) => {
    try {
      const result = await qmd_add_collection(name, path, pattern);
      if (!result.success) set_error(result.output || "Failed to add collection");
      await fetch_data();
    } catch (err) {
      set_error(error_message(err, "Failed to add collection"));
    }
  };

  const handle_save_global_context = async (text: string) => {
    try {
      const result = await qmd_set_global_context(text);
      if (!result.success) set_error(result.output || "Failed to save global context");
      await fetch_data();
    } catch (err) {
      set_error(error_message(err, "Failed to save global context"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-14 w-full" />
        <div className="flex flex-wrap gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[88px] flex-1 min-w-[140px]" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/20 border border-destructive p-4 text-destructive">
        Error: {error}
      </div>
    );
  }

  // Not installed
  if (availability && !availability.installed) {
    return (
      <div className="space-y-4">
        <QmdHealthBanner state={{ kind: "not_installed" }} />
        <div className="rounded-md border border-border p-6 text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            QMD is a hybrid search engine for markdown files. Install it to get started.
          </p>
          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">npm install -g @tobilu/qmd</code>
        </div>
      </div>
    );
  }

  const banner_state = (() => {
    if (!status) return null;
    if (status.needs_embedding > 0) {
      return { kind: "needs_embedding" as const, count: status.needs_embedding, onEmbed: handle_embed };
    }
    if (status.days_since_update !== null && status.days_since_update > 7) {
      return { kind: "stale" as const, days: status.days_since_update, onReindex: handle_reindex };
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <InfoTip title="What is QMD?" side="bottom" align="start">
            <div className="space-y-2">
              <p>QMD (Query Markdown) is a hybrid search engine for markdown files. It indexes your documents and creates vector embeddings so you can search by meaning, not just keywords.</p>
              <p className="font-medium text-foreground">Workflow:</p>
              <ol className="space-y-0.5 ml-1 list-decimal list-inside">
                <li>Create a <strong>collection</strong> pointing to a folder</li>
                <li><strong>Re-index</strong> to scan and register files</li>
                <li><strong>Embed</strong> to generate vector embeddings</li>
                <li>Query your documents with semantic search</li>
              </ol>
            </div>
          </InfoTip>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${action_loading === "reindex" ? "animate-spin" : ""}`} />
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
              <p><strong>Re-index All</strong> — Scans all collections for new, changed, or removed files and updates the index.</p>
              <p><strong>Embed All</strong> — Generates vector embeddings for any documents that haven't been embedded yet. Required for semantic search.</p>
              <p><strong>Cleanup</strong> — Removes orphaned data from the database (deleted files, stale entries) and reclaims disk space.</p>
            </div>
          </InfoTip>
        </div>
      </div>

      {op_state.is_busy && op_state.operation && (
        <QmdProgress operation={op_state.operation} progress={op_state.progress} />
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
                <p>The number of actively indexed files across all collections. The "total" count includes inactive or removed documents still in the database — run <strong>Cleanup</strong> to purge them.</p>
              </InfoTip>
            }
          />
          <StatCard
            label="Embedded Chunks"
            value={format_number(status.embedded_chunks)}
            sub_label={status.needs_embedding > 0 ? `${format_number(status.needs_embedding)} pending` : undefined}
            info_tip={
              <InfoTip title="Embedded Chunks" side="bottom" align="center">
                <div className="space-y-1.5">
                  <p>Documents are split into smaller <strong>chunks</strong> and converted into vector embeddings — numerical representations of their meaning.</p>
                  <p>This enables semantic search: finding content by what it means, not just matching exact words. If chunks are "pending", click <strong>Embed All</strong> to process them.</p>
                </div>
              </InfoTip>
            }
          />
          <StatCard
            label="Collections"
            value={format_number(status.collection_count)}
            info_tip={
              <InfoTip title="Collections" side="bottom" align="center">
                <p>A <strong>collection</strong> is a group of files from a specific directory that share a glob pattern (e.g. <code className="bg-muted px-1 rounded text-[11px]">**/*.md</code>). Each collection is indexed and embedded independently. You can add context descriptions to help QMD understand what the files are about.</p>
              </InfoTip>
            }
          />
          <StatCard
            label="DB Size"
            value={format_file_size(status.db_size_bytes)}
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
              <p>A collection maps to a folder on your filesystem. It defines which files to index using a <strong>glob pattern</strong> (e.g. <code className="bg-muted px-1 rounded text-[11px]">**/*.md</code> for all markdown files).</p>
              <p>Each collection can have its own <strong>contexts</strong> — descriptions attached to path prefixes that help QMD understand what different parts of your docs are about. This improves search relevance.</p>
            </div>
          </InfoTip>
        </div>
        {collections.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center space-y-3">
            <p className="text-muted-foreground">No collections yet.</p>
            <Button onClick={() => set_show_add_dialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add your first collection
            </Button>
          </div>
        ) : (
          <DataTable
            columns={qmd_collection_columns}
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
    </div>
  );
}
