import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import { error_message } from "@/lib/utils";
import { X, FolderOpen } from "lucide-react";

interface AddCollectionDialogProps {
  onAdd: (name: string, path: string, pattern?: string) => Promise<void>;
  onClose: () => void;
}

export function AddCollectionDialog({ onAdd, onClose }: AddCollectionDialogProps) {
  const [name, set_name] = useState("");
  const [path, set_path] = useState("");
  const [pattern, set_pattern] = useState("**/*.md");
  const [submitting, set_submitting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const handle_browse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select folder to index",
      });
      if (selected) {
        set_path(selected);
        // Auto-derive name from folder name if name is empty
        if (!name.trim()) {
          const folder_name = selected.split("/").filter(Boolean).pop();
          if (folder_name) set_name(folder_name);
        }
      }
    } catch {
      // User cancelled — ignore
    }
  };

  const handle_submit = async () => {
    if (!name.trim()) { set_error("Name is required"); return; }
    if (!path.trim()) { set_error("Path is required"); return; }
    try {
      set_submitting(true);
      set_error(null);
      await onAdd(name.trim(), path.trim(), pattern.trim() || undefined);
      onClose();
    } catch (err) {
      set_error(error_message(err, "Failed to add collection"));
    } finally {
      set_submitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Add Collection</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input
              placeholder="my-docs"
              value={name}
              onChange={(e) => set_name(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Path to docs</label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="/path/to/docs"
                value={path}
                onChange={(e) => set_path(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handle_browse}
                title="Browse for folder"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              Glob Pattern
              <InfoTip title="Glob Pattern" side="right" align="center" className="w-64">
                <div className="space-y-1.5">
                  <p>A pattern that determines which files to include from the selected folder.</p>
                  <p className="font-medium text-foreground">Examples:</p>
                  <ul className="space-y-0.5 ml-1">
                    <li><code className="bg-muted px-1 rounded text-[11px]">**/*.md</code> — All markdown files</li>
                    <li><code className="bg-muted px-1 rounded text-[11px]">{"**/*.{md,mdx}"}</code> — Markdown + MDX</li>
                    <li><code className="bg-muted px-1 rounded text-[11px]">docs/**/*.md</code> — Only in docs/</li>
                  </ul>
                </div>
              </InfoTip>
            </label>
            <Input
              placeholder="**/*.md"
              value={pattern}
              onChange={(e) => set_pattern(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Default: **/*.md</p>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handle_submit} disabled={submitting}>
              {submitting ? "Adding..." : "Add Collection"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
