import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text, shorten_path } from "../utils";
import { FolderSearch } from "lucide-react";

interface FindToolCallProps {
  tool: ResolvedToolCall;
}

export function FindToolCall({ tool }: FindToolCallProps) {
  const pattern = String(tool.arguments.pattern ?? "");
  const path = String(tool.arguments.path ?? ".");
  const is_error = tool.result?.isError ?? false;
  const output = tool.result ? extract_text(tool.result.content).trim() : "";

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <FolderSearch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">find</span>
        <span className="font-mono text-warning">{pattern}</span>
        <span className="text-muted-foreground">in</span>
        <span className="font-mono text-chart-1 break-all">{shorten_path(path)}</span>
      </div>
      {output && <ExpandableOutput text={output} max_lines={8} />}
    </div>
  );
}
