import { useState } from "react";
import { AlertTriangle, Copy, Check, X } from "lucide-react";
import type { SessionEntry } from "./types";
import { get_unrendered_properties } from "./utils";

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
      <button
        onClick={() => set_open(true)}
        className="inline-flex items-center gap-1 text-[10px] text-warning opacity-60 hover:opacity-100 transition-opacity"
        title={`${unrendered.length} unrendered ${unrendered.length === 1 ? "property" : "properties"}`}
      >
        <AlertTriangle className="size-3" />
        <span>{unrendered.length}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <AlertTriangle className="size-4" />
                Unrendered Properties
              </div>
              <button
                onClick={() => set_open(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              <div className="text-xs text-muted-foreground">
                Entry <code className="rounded bg-muted px-1 py-0.5 text-foreground">{entry.type}</code>{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">{entry.id}</code>
              </div>

              {unrendered.map(({ key, value }) => (
                <div key={key} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-mono font-semibold text-foreground mb-1">
                    {key}
                  </div>
                  <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={handle_copy}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-accent transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="size-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy diagnostic
                  </>
                )}
              </button>
              <button
                onClick={() => set_open(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
