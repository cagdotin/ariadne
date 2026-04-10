import { GitBranch } from "lucide-react";
import { MarkdownContent } from "../primitives/markdown-content";
import type { BranchSummaryEntry } from "../types";
import { format_timestamp } from "../utils";
import { RawEntryInspector } from "./raw-entry-inspector";

interface BranchSummaryBlockProps {
	entry: BranchSummaryEntry;
}

export function BranchSummaryBlock({ entry }: BranchSummaryBlockProps) {
	return (
		<div className="rounded-none border border-chart-2/30 bg-chart-2/5 p-3">
			<div className="flex items-center gap-2 text-xs mb-2">
				<GitBranch className="size-3.5 shrink-0 text-chart-2" />
				<span className="font-semibold text-chart-2">Branch Summary</span>
				<span className="text-[10px] text-muted-foreground">
					{format_timestamp(entry.timestamp)}
				</span>
				<div className="ml-auto">
					<RawEntryInspector entry={entry} />
				</div>
			</div>
			<MarkdownContent content={entry.summary} />
		</div>
	);
}
