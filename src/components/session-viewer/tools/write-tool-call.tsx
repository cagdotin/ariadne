import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text, shorten_path, get_language_from_path } from "../utils";
import { FilePlus } from "lucide-react";

interface WriteToolCallProps {
  tool: ResolvedToolCall;
}

export function WriteToolCall({ tool }: WriteToolCallProps) {
  const file_path = String(tool.arguments.path ?? tool.arguments.file_path ?? "");
  const content = typeof tool.arguments.content === "string" ? tool.arguments.content : "";
  const is_error = tool.result?.isError ?? false;
  const result_text = tool.result ? extract_text(tool.result.content).trim() : "";
  const language = file_path ? get_language_from_path(file_path) : undefined;
  const line_count = content ? content.split("\n").length : 0;

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <FilePlus className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">write</span>
        <span className="font-mono text-chart-1 break-all">{shorten_path(file_path)}</span>
        {line_count > 10 && (
          <span className="text-muted-foreground">({line_count} lines)</span>
        )}
      </div>

      {content && (
        <ExpandableOutput
          text={content}
          max_lines={10}
          language={language}
        />
      )}

      {result_text && (
        <div className="mt-2 text-xs text-muted-foreground font-mono">{result_text}</div>
      )}
    </div>
  );
}
