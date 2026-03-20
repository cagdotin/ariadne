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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format_number, format_file_size } from "@/lib/format";
import { RefreshCw, Plus, Zap, Trash2 } from "lucide-react";

export function Qmd() {
  const [availability, set_availability] = useState<QmdAvailability | null>(null);
  const [status, set_status] = useState<QmdStatus | null>(null);
  const [collections, set_collections] = useState<QmdCollection[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [show_add_dialog, set_show_add_dialog] = useState(false);
  const [action_loading, set_action_loading] = useState<string | null>(null);

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
      set_error(err instanceof Error ? err.message : "Failed to load QMD data");
    } finally {
      set_loading(false);
    }
  };

  useEffect(() => { fetch_data(); }, []);

  const handle_reindex = async () => {
    try {
      set_action_loading("reindex");
      const result = await qmd_reindex();
      if (!result.success) set_error(result.output || "Re-index failed");
      await fetch_data();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Re-index failed");
    } finally {
      set_action_loading(null);
    }
  };

  const handle_embed = async () => {
    try {
      set_action_loading("embed");
      const result = await qmd_embed();
      if (!result.success) set_error(result.output || "Embed failed");
      await fetch_data();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Embed failed");
    } finally {
      set_action_loading(null);
    }
  };

  const handle_cleanup = async () => {
    try {
      set_action_loading("cleanup");
      const result = await qmd_cleanup();
      if (!result.success) set_error(result.output || "Cleanup failed");
      await fetch_data();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      set_action_loading(null);
    }
  };

  const handle_add_collection = async (name: string, path: string, pattern?: string) => {
    try {
      const result = await qmd_add_collection(name, path, pattern);
      if (!result.success) set_error(result.output || "Failed to add collection");
      await fetch_data();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to add collection");
    }
  };

  const handle_save_global_context = async (text: string) => {
    try {
      const result = await qmd_set_global_context(text);
      if (!result.success) set_error(result.output || "Failed to save global context");
      await fetch_data();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to save global context");
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
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">QMD</h1>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">QMD</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => set_show_add_dialog(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Collection
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handle_reindex}
            disabled={action_loading !== null}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${action_loading === "reindex" ? "animate-spin" : ""}`} />
            Re-index All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handle_embed}
            disabled={action_loading !== null}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Embed All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handle_cleanup}
            disabled={action_loading !== null}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Cleanup
          </Button>
        </div>
      </div>

      {banner_state && <QmdHealthBanner state={banner_state} />}

      {status && (
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="Total Documents"
            value={format_number(status.active_documents)}
            sub_label={`${format_number(status.total_documents)} total`}
          />
          <StatCard
            label="Embedded Chunks"
            value={format_number(status.embedded_chunks)}
            sub_label={status.needs_embedding > 0 ? `${format_number(status.needs_embedding)} pending` : undefined}
          />
          <StatCard
            label="Collections"
            value={format_number(status.collection_count)}
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
        <h2 className="text-lg font-semibold text-foreground mb-4">Collections</h2>
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
