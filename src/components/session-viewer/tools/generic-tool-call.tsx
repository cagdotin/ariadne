import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text } from "../utils";
import { Wrench, AlertTriangle } from "lucide-react";

interface GenericToolCallProps {
  tool: ResolvedToolCall;
}

export function GenericToolCall({ tool }: GenericToolCallProps) {
  const is_error = tool.result?.isError ?? false;
  const output = tool.result ? extract_text(tool.result.content).trim() : "";
  const args_json = JSON.stringify(tool.arguments, null, 2);

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">{tool.name}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-1.5 py-0.5 text-[10px] text-warning">
          <AlertTriangle className="size-2.5" />
          custom tool
        </span>
      </div>

      <ExpandableOutput text={args_json} max_lines={6} language="json" />

      {output && (
        <>
          <div className="text-[10px] text-muted-foreground mt-2 mb-1 font-medium uppercase tracking-wider">
            Result
          </div>
          <ExpandableOutput text={output} max_lines={8} />
        </>
      )}
    </div>
  );
}
