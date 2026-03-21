import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text, shorten_path } from "../utils";
import { Pencil } from "lucide-react";

interface EditToolCallProps {
  tool: ResolvedToolCall;
}

export function EditToolCall({ tool }: EditToolCallProps) {
  const file_path = String(tool.arguments.path ?? tool.arguments.file_path ?? "");
  const is_error = tool.result?.isError ?? false;
  const result_text = tool.result ? extract_text(tool.result.content).trim() : "";
  const diff = tool.result?.details?.diff as string | undefined;

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">edit</span>
        <span className="font-mono text-chart-1 break-all">{shorten_path(file_path)}</span>
      </div>

      {diff ? (
        <div className="mt-2 rounded-[var(--radius)] bg-input p-2 px-3 text-xs font-mono leading-relaxed overflow-x-auto">
          {diff.split("\n").map((line, i) => {
            let cls = "text-muted-foreground";
            if (line.startsWith("+")) cls = "text-success bg-success/10";
            else if (line.startsWith("-")) cls = "text-destructive bg-destructive/10";
            return (
              <div key={i} className={cls}>
                {line || "\u00a0"}
              </div>
            );
          })}
        </div>
      ) : result_text ? (
        <ExpandableOutput text={result_text} max_lines={10} />
      ) : null}
    </div>
  );
}
