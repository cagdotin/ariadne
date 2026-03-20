import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface GlobalContextEditorProps {
  value: string | null;
  onSave: (text: string) => Promise<void>;
}

export function GlobalContextEditor({ value, onSave }: GlobalContextEditorProps) {
  const [text, set_text] = useState(value ?? "");
  const [saving, set_saving] = useState(false);

  useEffect(() => { set_text(value ?? ""); }, [value]);

  const handle_save = async () => {
    try {
      set_saving(true);
      await onSave(text);
    } finally {
      set_saving(false);
    }
  };

  const is_dirty = text !== (value ?? "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Global Context</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
          placeholder="Add a global context description that applies to all collections..."
          value={text}
          onChange={(e) => set_text(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handle_save}
            disabled={!is_dirty || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
