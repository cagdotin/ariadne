import type { CustomMessageEntry } from "./types";
import { MarkdownContent } from "./markdown-content";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp, extract_text } from "./utils";
import { Puzzle } from "lucide-react";

interface CustomMessageBlockProps {
  entry: CustomMessageEntry;
}

export function CustomMessageBlock({ entry }: CustomMessageBlockProps) {
  if (!entry.display) return null;

  const text =
    typeof entry.content === "string"
      ? entry.content
      : extract_text(entry.content);

  return (
    <div className="rounded-md border border-chart-5/30 bg-chart-5/5 p-3">
      <div className="flex items-center gap-2 text-xs mb-2">
        <Puzzle className="size-3.5 shrink-0 text-chart-5" />
        <span className="font-semibold text-chart-5">[{entry.customType}]</span>
        <span className="text-[10px] text-muted-foreground">
          {format_timestamp(entry.timestamp)}
        </span>
        <div className="ml-auto">
          <RawEntryInspector entry={entry} />
        </div>
      </div>
      {text.trim() && <MarkdownContent content={text} />}
    </div>
  );
}
