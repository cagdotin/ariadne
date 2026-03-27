import { useCallback, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { QmdLogEntry } from "@/schemas/qmd-logs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format_date } from "@/lib/format";
import { X, Copy, Check, Terminal, AlertTriangle } from "lucide-react";

interface QmdLogOutputDialogProps {
  entry: QmdLogEntry;
  on_close: () => void;
}

export function QmdLogOutputDialog({ entry, on_close }: QmdLogOutputDialogProps) {
  const [copied, set_copied] = useState(false);

  const handle_copy = useCallback(() => {
    navigator.clipboard.writeText(entry.output_text);
    set_copied(true);
    setTimeout(() => set_copied(false), 2000);
  }, [entry.output_text]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) on_close(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] pointer-events-none"
        >
          <Card className="w-full max-w-3xl mx-4 max-h-[86vh] flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <Dialog.Title className="text-sm font-semibold">
                  QMD Call Detail
                </Dialog.Title>
                {entry.is_error && (
                  <Badge variant="destructive" className="text-[11px]">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    error
                  </Badge>
                )}
                {!entry.has_output && (
                  <Badge variant="outline" className="text-[11px]">incomplete</Badge>
                )}
              </div>
              <Dialog.Close
                render={
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                }
              />
            </div>

            {/* Metadata */}
            <Dialog.Description render={<div />} className="px-4 py-3 border-b space-y-2 shrink-0 bg-muted/20">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <span className="text-muted-foreground">Project:</span>{" "}
                  <span className="font-medium">{entry.project_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Session:</span>{" "}
                  <span className="font-mono">{entry.session_id.slice(0, 12)}…</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time:</span>{" "}
                  <span>{entry.timestamp ? format_date(entry.timestamp) : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Subcommand:</span>{" "}
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {entry.subcommand}
                  </Badge>
                </div>
                {entry.collections.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Collections:</span>{" "}
                    {entry.collections.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-[10px] mr-1">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                {entry.index_name && (
                  <div>
                    <span className="text-muted-foreground">Index:</span>{" "}
                    <span className="font-mono">{entry.index_name}</span>
                  </div>
                )}
              </div>
            </Dialog.Description>

            {/* Raw command */}
            <div className="px-4 py-3 border-b shrink-0">
              <div className="text-xs font-medium text-muted-foreground mb-1.5">Command</div>
              <pre className="text-xs bg-muted/40 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                {entry.raw_command}
              </pre>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground">Output</div>
                {entry.output_text && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1"
                    onClick={handle_copy}
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>
              {entry.output_text ? (
                <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto whitespace-pre-wrap break-words leading-relaxed max-h-[50vh]">
                  {entry.output_text}
                </pre>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No output captured for this call.
                </div>
              )}
            </div>
          </Card>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
