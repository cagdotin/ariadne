import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text } from "../utils";
import { Terminal } from "lucide-react";

interface BashToolCallProps {
  tool: ResolvedToolCall;
}

export function BashToolCall({ tool }: BashToolCallProps) {
  const command = typeof tool.arguments.command === "string" ? tool.arguments.command : "";
  const is_error = tool.result?.isError ?? false;
  const output = tool.result ? extract_text(tool.result.content).trim() : "";

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-start gap-2">
        <Terminal className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <pre className="text-xs font-mono font-medium text-foreground whitespace-pre-wrap break-all flex-1">
          <span className="text-muted-foreground select-none">$ </span>
          {command}
        </pre>
      </div>
      {output && <ExpandableOutput text={output} max_lines={5} />}
    </div>
  );
}
