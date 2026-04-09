import { useState } from "react";
import type { CompactionEntry } from "../types";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp } from "../utils";
import { Minimize2, ChevronRight, ChevronDown } from "lucide-react";

interface CompactionBlockProps {
  entry: CompactionEntry;
}

export function CompactionBlock({ entry }: CompactionBlockProps) {
  const [expanded, set_expanded] = useState(false);
  const tokens_k = Math.round(entry.tokensBefore / 1000);

  return (
    <div
      className="rounded-none border border-chart-4/30 bg-chart-4/5 p-3 cursor-pointer"
      onClick={() => set_expanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs">
        <Minimize2 className="size-3.5 shrink-0 text-chart-4" />
        <span className="font-semibold text-chart-4">compaction</span>
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          Compacted from {tokens_k}k tokens
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto mr-1">
          {format_timestamp(entry.timestamp)}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <RawEntryInspector entry={entry} />
        </div>
      </div>
      {expanded && (
        <pre className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
          {entry.summary}
        </pre>
      )}
    </div>
  );
}
