import type { MessageEntry, BashExecutionMessage } from "./types";
import { ExpandableOutput } from "./expandable-output";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp } from "./utils";
import { Terminal } from "lucide-react";

interface BashExecutionBlockProps {
  entry: MessageEntry;
}

export function BashExecutionBlock({ entry }: BashExecutionBlockProps) {
  const msg = entry.message as BashExecutionMessage;
  const is_error = msg.cancelled || (msg.exitCode !== 0 && msg.exitCode !== null);

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs mb-1">
        <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">
          {format_timestamp(entry.timestamp)}
        </span>
        <div className="ml-auto">
          <RawEntryInspector entry={entry} />
        </div>
      </div>
      <pre className="text-xs font-mono font-medium text-foreground whitespace-pre-wrap break-all">
        <span className="text-muted-foreground select-none">$ </span>
        {msg.command}
      </pre>
      {msg.output && <ExpandableOutput text={msg.output} max_lines={10} />}
      {msg.cancelled && (
        <div className="text-xs text-warning mt-1">(cancelled)</div>
      )}
      {!msg.cancelled && msg.exitCode !== 0 && msg.exitCode !== null && msg.exitCode !== undefined && (
        <div className="text-xs text-destructive mt-1">(exit {msg.exitCode})</div>
      )}
    </div>
  );
}
