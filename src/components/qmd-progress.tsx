import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EmbedProgress, UpdateProgress } from "@/hooks/use-qmd-operation";
import { format_file_size } from "@/lib/format";

interface QmdProgressProps {
	operation: "update" | "embed" | "cleanup";
	progress: UpdateProgress | EmbedProgress | null;
}

function is_update_progress(
	p: UpdateProgress | EmbedProgress,
): p is UpdateProgress {
	return "file" in p;
}

export function QmdProgress({ operation, progress }: QmdProgressProps) {
	if (operation === "cleanup") {
		return (
			<Card>
				<CardContent className="py-4 flex items-center gap-3">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Cleaning up...</span>
				</CardContent>
			</Card>
		);
	}

	if (!progress) {
		return (
			<Card>
				<CardContent className="py-4 flex items-center gap-3">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						{operation === "update" ? "Re-indexing..." : "Embedding..."}
					</span>
				</CardContent>
			</Card>
		);
	}

	if (is_update_progress(progress)) {
		const pct =
			progress.total > 0
				? Math.round((progress.current / progress.total) * 100)
				: 0;
		return (
			<Card>
				<CardContent className="py-4 space-y-2">
					<Progress value={pct}>
						<div className="flex items-center justify-between w-full">
							<span className="text-sm font-medium">
								Re-indexing {progress.collection}...
							</span>
							<span className="text-sm text-muted-foreground">
								{progress.current}/{progress.total} files
							</span>
						</div>
					</Progress>
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground font-mono truncate max-w-[80%]">
							{progress.file}
						</span>
						<span className="text-xs text-muted-foreground">{pct}%</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	// EmbedProgress
	const ep = progress as EmbedProgress;
	const pct =
		ep.total_chunks > 0
			? Math.round((ep.chunks_embedded / ep.total_chunks) * 100)
			: 0;
	return (
		<Card>
			<CardContent className="py-4 space-y-2">
				<Progress value={pct}>
					<div className="flex items-center justify-between w-full">
						<span className="text-sm font-medium">Embedding...</span>
						<span className="text-sm text-muted-foreground">
							{ep.chunks_embedded}/{ep.total_chunks} chunks
						</span>
					</div>
				</Progress>
				<div className="flex items-center justify-between">
					<span className="text-xs text-muted-foreground">
						{format_file_size(ep.bytes_processed)} /{" "}
						{format_file_size(ep.total_bytes)}
					</span>
					<span className="text-xs text-muted-foreground">{pct}%</span>
				</div>
			</CardContent>
		</Card>
	);
}
