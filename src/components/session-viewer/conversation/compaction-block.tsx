import { ChevronDown, ChevronRight, Minimize2 } from "lucide-react";
import { useState } from "react";
import type { CompactionEntry } from "../types";
import { format_timestamp } from "../utils";
import { RawEntryInspector } from "./raw-entry-inspector";

interface CompactionBlockProps {
	entry: CompactionEntry;
}

export function CompactionBlock({ entry }: CompactionBlockProps) {
	const [expanded, set_expanded] = useState(false);
	const tokens_k = Math.round(entry.tokensBefore / 1000);

	return (
		// biome-ignore lint/a11y/useSemanticElements: div with role="button" for expandable section
		<div
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") set_expanded(!expanded);
			}}
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
				tttt
				{/* biome-ignore lint/a11y/noStaticElementInteractions: event propagation barrier */}
				<div
					role="presentation"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<RawEntryInspector entry={entry} />
				</div>
			</div>
			{expanded && (
				<pre className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed max-h-80 overflow-y-auto">
					{entry.summary}
				</pre>
			)}
		</div>
	);
}
