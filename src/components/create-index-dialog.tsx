import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { error_message } from "@/lib/utils";
import { X } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Create Index</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={on_close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={on_close}>Cancel</Button>
            <Button onClick={handle_submit} disabled={!can_submit}>
              {submitting ? "Creating..." : "Create Index"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
