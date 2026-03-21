import type { ModelChangeEntry } from "./types";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp } from "./utils";
import { Cpu } from "lucide-react";

interface ModelChangeBlockProps {
  entry: ModelChangeEntry;
}

export function ModelChangeBlock({ entry }: ModelChangeBlockProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
      <Cpu className="size-3 opacity-50" />
      <span>Switched to model:</span>
      <span className="font-mono font-medium text-chart-4">
        {entry.provider}/{entry.modelId}
      </span>
      <span className="text-[10px]">{format_timestamp(entry.timestamp)}</span>
      <div className="ml-auto">
        <RawEntryInspector entry={entry} />
      </div>
    </div>
  );
}
