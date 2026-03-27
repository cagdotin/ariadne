import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { error_message } from "@/lib/utils";

interface CreateIndexDialogProps {
  existing_names: string[];
  on_create: (name: string, description?: string) => Promise<void>;
  on_close: () => void;
}

export function CreateIndexDialog({
  existing_names,
  on_create,
  on_close,
}: CreateIndexDialogProps) {
  const [name, set_name] = useState("");
  const [description, set_description] = useState("");
  const [submitting, set_submitting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const validate_name = (value: string): string | null => {
    if (!value.trim()) return "Name is required";
    if (!/^[a-z][a-z0-9-]*$/.test(value)) {
      return "Must start with a letter; only lowercase letters, numbers, and hyphens";
    }
    if (value.length > 32) return "Max 32 characters";
    if (value === "index" || value === "models") return `"${value}" is reserved`;
    if (existing_names.includes(value)) return "An index with this name already exists";
    return null;
  };

  const name_error = name.length > 0 ? validate_name(name) : null;
  const can_submit = name.trim().length > 0 && !name_error && !submitting;

  const handle_submit = async () => {
    const validation = validate_name(name);
    if (validation) {
      set_error(validation);
      return;
    }
    try {
      set_submitting(true);
      set_error(null);
      await on_create(name.trim(), description.trim() || undefined);
      on_close();
    } catch (err) {
      set_error(error_message(err, "Failed to create index"));
    } finally {
      set_submitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) on_close(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create Index</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input
              placeholder="work"
              value={name}
              onChange={(e) => set_name(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && can_submit) handle_submit();
              }}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {name_error ? (
              <p className="text-xs text-destructive">{name_error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="Work projects and documentation"
              value={description}
              onChange={(e) => set_description(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && can_submit) handle_submit();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Sets the global context for this index. Can be changed later.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={on_close}>Cancel</Button>
          <Button onClick={handle_submit} disabled={!can_submit}>
            {submitting ? "Creating..." : "Create Index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
