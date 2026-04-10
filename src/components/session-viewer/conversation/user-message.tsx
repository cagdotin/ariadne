import { User } from "lucide-react";
import { MarkdownContent } from "../primitives/markdown-content";
import type { ContentBlock, MessageEntry } from "../types";
import { extract_text, format_timestamp } from "../utils";
import { RawEntryInspector } from "./raw-entry-inspector";

interface UserMessageProps {
	entry: MessageEntry;
}

export function UserMessage({ entry }: UserMessageProps) {
	const msg = entry.message;
	if (msg.role !== "user") return null;

	const content = msg.content;
	const text = extract_text(content);
	const images = Array.isArray(content)
		? content.filter((c: ContentBlock) => c.type === "image")
		: [];

	return (
		<div className="relative rounded-none border border-primary/20 bg-primary/[0.04] p-4 min-w-0 overflow-hidden">
			<div className="flex items-center gap-2 mb-2">
				<div className="flex items-center justify-center size-5 rounded-full bg-primary/10">
					<User className="size-3 text-primary" />
				</div>
				<span className="text-[11px] font-medium text-primary/80">You</span>
				<span className="text-[10px] text-muted-foreground">
					{format_timestamp(entry.timestamp)}
				</span>
				<div className="ml-auto">
					<RawEntryInspector entry={entry} />
				</div>
			</div>

			{images.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-2">
					{images.map((img, i) =>
						"data" in img && "mimeType" in img ? (
							<img
								// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
								key={i}
								src={`data:${(img as { mimeType: string }).mimeType};base64,${(img as { data: string }).data}`}
								alt="user attachment"
								className="max-w-full max-h-80 rounded border border-border"
							/>
						) : null,
					)}
				</div>
			)}

			{text.trim() && <MarkdownContent content={text} />}
		</div>
	);
}
