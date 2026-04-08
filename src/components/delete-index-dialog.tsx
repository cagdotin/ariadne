import { useState } from "react";
import type { QmdIndex } from "@contracts/qmd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { error_message } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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
    <Dialog open onOpenChange={(open) => { if (!open) on_close(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete Index</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>This action cannot be undone</AlertTitle>
            <AlertDescription>
              <p>
                Are you sure you want to delete the{" "}
                <strong className="text-foreground">"{index.name}"</strong> index?
              </p>
              <p className="mt-1">This will permanently remove:</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1">
                <li>{index.collection_count} collection{index.collection_count !== 1 ? "s" : ""}</li>
                <li>{index.document_count} document{index.document_count !== 1 ? "s" : ""}</li>
                <li>All vector embeddings</li>
              </ul>
            </AlertDescription>
          </Alert>

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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={on_close}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handle_delete}
            disabled={!confirmed || deleting}
          >
            {deleting ? "Deleting..." : "Delete Index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
