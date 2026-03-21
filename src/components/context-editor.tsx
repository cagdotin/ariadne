import { useState } from "react";
import type { QmdContext } from "@/schemas/qmd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import { Plus, Trash2 } from "lucide-react";

interface ContextEditorProps {
  contexts: QmdContext[];
  onAdd: (path: string, description: string) => Promise<void>;
  onRemove: (path: string) => Promise<void>;
}

interface DraftRow {
  path: string;
  context: string;
}

export function ContextEditor({ contexts, onAdd, onRemove }: ContextEditorProps) {
  const [draft, set_draft] = useState<DraftRow | null>(null);
  const [pending_delete, set_pending_delete] = useState<string | null>(null);
  const [busy, set_busy] = useState(false);

  const handle_add = async () => {
    if (!draft || !draft.path.trim()) return;
    try {
      set_busy(true);
      await onAdd(draft.path.trim(), draft.context.trim());
      set_draft(null);
    } finally {
      set_busy(false);
    }
  };

  const handle_remove = async (path: string) => {
    try {
      set_busy(true);
      await onRemove(path);
      set_pending_delete(null);
    } finally {
      set_busy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Contexts</CardTitle>
            <InfoTip title="Collection Contexts" side="right" align="start">
              <div className="space-y-1.5">
                <p>Contexts are descriptions attached to <strong>path prefixes</strong> within this collection. They tell QMD what different sections of your documents are about.</p>
                <p className="font-medium text-foreground">Example:</p>
                <ul className="space-y-0.5 ml-1">
                  <li><code className="bg-muted px-1 rounded text-[11px]">docs/api</code> → <em>"REST API reference documentation"</em></li>
                  <li><code className="bg-muted px-1 rounded text-[11px]">guides/</code> → <em>"Step-by-step tutorials for beginners"</em></li>
                </ul>
                <p>This metadata improves search relevance by giving QMD extra understanding of your file structure.</p>
              </div>
            </InfoTip>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => set_draft({ path: "", context: "" })}
            disabled={draft !== null}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Context
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {contexts.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">No contexts defined for this collection.</p>
        )}
        {contexts.map((ctx) => (
          <div key={ctx.path} className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground w-48 shrink-0 truncate">{ctx.path}</span>
            <span className="text-sm text-foreground flex-1 truncate">{ctx.context}</span>
            {pending_delete === ctx.path ? (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">Delete?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-xs"
                  onClick={() => handle_remove(ctx.path)}
                  disabled={busy}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => set_pending_delete(null)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => set_pending_delete(ctx.path)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {draft !== null && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Path prefix (e.g. docs/api)"
              value={draft.path}
              onChange={(e) => set_draft({ ...draft, path: e.target.value })}
              className="w-48 shrink-0 text-xs h-7"
            />
            <Input
              placeholder="Description"
              value={draft.context}
              onChange={(e) => set_draft({ ...draft, context: e.target.value })}
              className="flex-1 text-sm h-7"
            />
            <Button size="sm" className="h-7 px-3" onClick={handle_add} disabled={busy || !draft.path.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => set_draft(null)}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
