import { useState } from "react";
import { AlertTriangle, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SessionEntry } from "../types";
import { get_unrendered_properties } from "../utils";

interface RawEntryInspectorProps {
  entry: SessionEntry;
}

export function RawEntryInspector({ entry }: RawEntryInspectorProps) {
  const [open, set_open] = useState(false);
  const [copied, set_copied] = useState(false);
  const unrendered = get_unrendered_properties(entry);

  if (unrendered.length === 0) return null;

  const diagnostic_text = [
    `## Unrendered properties on session entry`,
    ``,
    `**Entry type**: \`${entry.type}\``,
    `**Entry ID**: \`${entry.id}\``,
    `**Timestamp**: ${entry.timestamp}`,
    ``,
    `The following properties exist on this entry but are not displayed by the session viewer:`,
    ``,
    ...unrendered.map(
      ({ key, value }) =>
        `- **\`${key}\`**: \`${JSON.stringify(value, null, 2)}\``
    ),
    ``,
    `Please add rendering support for these properties in the appropriate component under \`src/components/session-viewer/\`.`,
  ].join("\n");

  const handle_copy = async () => {
    await navigator.clipboard.writeText(diagnostic_text);
    set_copied(true);
    setTimeout(() => set_copied(false), 1500);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => set_open(true)}
        className="gap-1 text-[10px] text-warning opacity-60 hover:opacity-100"
        title={`${unrendered.length} unrendered ${unrendered.length === 1 ? "property" : "properties"}`}
      >
        <AlertTriangle className="size-3" />
        <span>{unrendered.length}</span>
      </Button>

      <Dialog open={open} onOpenChange={set_open}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4" />
              Unrendered Properties
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto space-y-3 flex-1">
            <div className="text-xs text-muted-foreground">
              Entry <code className="rounded bg-muted px-1 py-0.5 text-foreground">{entry.type}</code>{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">{entry.id}</code>
            </div>

            {unrendered.map(({ key, value }) => (
              <div key={key} className="rounded-none border border-border bg-muted/30 p-3">
                <div className="text-xs font-mono font-semibold text-foreground mb-1">
                  {key}
                </div>
                <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={handle_copy}>
              {copied ? (
                <><Check className="size-3" /> Copied</>
              ) : (
                <><Copy className="size-3" /> Copy diagnostic</>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set_open(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
