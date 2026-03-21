import type { ResolvedToolCall } from "../types";
import { ExpandableOutput } from "../expandable-output";
import { extract_text, shorten_path, get_language_from_path } from "../utils";
import { FileText } from "lucide-react";

interface ReadToolCallProps {
  tool: ResolvedToolCall;
}

export function ReadToolCall({ tool }: ReadToolCallProps) {
  const file_path = String(tool.arguments.path ?? tool.arguments.file_path ?? "");
  const offset = tool.arguments.offset as number | undefined;
  const limit = tool.arguments.limit as number | undefined;
  const is_error = tool.result?.isError ?? false;
  const output = tool.result ? extract_text(tool.result.content) : "";
  const language = file_path ? get_language_from_path(file_path) : undefined;

  // Check for images in result
  const images = tool.result?.content.filter((c) => c.type === "image") ?? [];

  let range_label = "";
  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 1;
    const end = limit !== undefined ? start + limit - 1 : undefined;
    range_label = `:${start}${end ? `-${end}` : ""}`;
  }

  return (
    <div
      className={`rounded-md border p-3 ${
        is_error
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">read</span>
        <span className="font-mono text-chart-1 break-all">
          {shorten_path(file_path)}
          {range_label && <span className="text-warning">{range_label}</span>}
        </span>
      </div>

      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, i) =>
            "data" in img && "mimeType" in img ? (
              <img
                key={i}
                src={`data:${(img as { mimeType: string; data: string }).mimeType};base64,${(img as { data: string }).data}`}
                alt="file content"
                className="max-w-full max-h-80 rounded border border-border"
              />
            ) : null
          )}
        </div>
      )}

      {output && (
        <ExpandableOutput
          text={output}
          max_lines={10}
          language={language}
        />
      )}
    </div>
  );
}
