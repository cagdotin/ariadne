import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import type { QmdCollectionDetail } from "@/schemas/qmd";
import {
  qmd_get_collection_detail,
  qmd_add_context,
  qmd_remove_context,
  qmd_reindex,
  qmd_embed,
  qmd_remove_collection,
} from "@/api/qmd";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { qmd_document_columns } from "@/components/columns/qmd-document-columns";
import { ContextEditor } from "@/components/context-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { format_number, format_date_relative } from "@/lib/format";
import { RefreshCw, Zap, Trash2 } from "lucide-react";

export function QmdCollection() {
  const { name } = useParams({ strict: false }) as { name: string };
  const navigate = useNavigate();
  const [detail, set_detail] = useState<QmdCollectionDetail | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [action_loading, set_action_loading] = useState<string | null>(null);
  const [confirm_remove, set_confirm_remove] = useState(false);

  const fetch_data = async () => {
    if (!name) return;
    try {
      set_loading(true);
      set_error(null);
      const d = await qmd_get_collection_detail(name);
      set_detail(d);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to load collection");
    } finally {
      set_loading(false);
    }
  };

  useEffect(() => { fetch_data(); }, [name]);

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

  const handle_remove = async () => {
    try {
      set_action_loading("remove");
      const result = await qmd_remove_collection(name);
      if (result.success) {
        navigate({ to: "/qmd" });
      } else {
        set_error(result.output || "Failed to remove collection");
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to remove collection");
    } finally {
      set_action_loading(null);
    }
  };

  const handle_add_context = async (path: string, description: string) => {
    await qmd_add_context(name, path, description);
    await fetch_data();
  };

  const handle_remove_context = async (path: string) => {
    await qmd_remove_context(name, path);
    await fetch_data();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-32" />
        <div className="flex flex-wrap gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[88px] flex-1 min-w-[140px]" />)}
        </div>
        <Skeleton className="h-40" />
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

  if (!detail) return null;

  const { collection, documents } = detail;
  const needs_embedding = collection.active_doc_count - collection.embedded_count;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/qmd" />}>
              QMD
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{collection.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header + Actions */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">{collection.name}</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handle_reindex}
            disabled={action_loading !== null}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${action_loading === "reindex" ? "animate-spin" : ""}`} />
            Re-index
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handle_embed}
            disabled={action_loading !== null}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Embed
          </Button>
          {confirm_remove ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Remove collection?</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={handle_remove}
                disabled={action_loading !== null}
              >
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => set_confirm_remove(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => set_confirm_remove(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Documents"
          value={format_number(collection.active_doc_count)}
        />
        <StatCard
          label="Needing Embedding"
          value={format_number(Math.max(0, needs_embedding))}
        />
        <StatCard
          label="Last Updated"
          value={collection.last_modified ? format_date_relative(collection.last_modified) : "—"}
        />
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Path</p>
              <p className="text-foreground font-mono text-xs break-all">{collection.path}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Glob Pattern</p>
              <p className="text-foreground font-mono text-xs">{collection.pattern}</p>
            </div>
            {collection.ignore_patterns.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ignore Patterns</p>
                <div className="flex flex-wrap gap-1">
                  {collection.ignore_patterns.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Include by Default</p>
              <Badge variant={collection.include_by_default ? "default" : "secondary"}>
                {collection.include_by_default ? "Yes" : "No"}
              </Badge>
            </div>
            {collection.update_command && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Update Command</p>
                <p className="text-foreground font-mono text-xs">{collection.update_command}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Context Editor */}
      <ContextEditor
        contexts={collection.contexts}
        onAdd={handle_add_context}
        onRemove={handle_remove_context}
      />

      {/* Documents Table */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Documents</h2>
        <DataTable
          columns={qmd_document_columns}
          data={documents}
          filter_column="path"
          filter_placeholder="Search documents..."
        />
      </div>
    </div>
  );
}
