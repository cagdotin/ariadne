import { useState } from "react";
import type { QmdIndex } from "@/schemas/qmd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { error_message } from "@/lib/utils";
import { X, AlertTriangle } from "lucide-react";

interface DeleteIndexDialogProps {
  index: QmdIndex;
  on_delete: (name: string) => Promise<void>;
  on_close: () => void;
}

export function DeleteIndexDialog({
  index,
  on_delete,
  on_close,
}: DeleteIndexDialogProps) {
  const [confirmation, set_confirmation] = useState("");
  const [deleting, set_deleting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const confirmed = confirmation === index.name;

  const handle_delete = async () => {
    if (!confirmed) return;
    try {
      set_deleting(true);
      set_error(null);
      await on_delete(index.name);
      on_close();
    } catch (err) {
      set_error(error_message(err, "Failed to delete index"));
    } finally {
      set_deleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Delete Index</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={on_close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p>
                Are you sure you want to delete the{" "}
                <strong className="text-foreground">"{index.name}"</strong> index?
              </p>
              <p className="text-muted-foreground">This will permanently remove:</p>
              <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
                <li>{index.collection_count} collection{index.collection_count !== 1 ? "s" : ""}</li>
                <li>{index.document_count} document{index.document_count !== 1 ? "s" : ""}</li>
                <li>All vector embeddings</li>
              </ul>
              <p className="text-destructive font-medium mt-2">This action cannot be undone.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Type <span className="font-mono text-destructive">"{index.name}"</span> to confirm:
            </label>
            <Input
              placeholder={index.name}
              value={confirmation}
              onChange={(e) => set_confirmation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmed) handle_delete();
              }}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={on_close}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handle_delete}
              disabled={!confirmed || deleting}
            >
              {deleting ? "Deleting..." : "Delete Index"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
