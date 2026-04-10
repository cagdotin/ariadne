import type { QmdLogEntry } from "@contracts/qmd-logs";
import { AlertTriangle, Check, Copy, Terminal } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { format_date } from "@/lib/format";

interface QmdLogOutputDialogProps {
	entry: QmdLogEntry;
	on_close: () => void;
}

export function QmdLogOutputDialog({
	entry,
	on_close,
}: QmdLogOutputDialogProps) {
	const [copied, set_copied] = useState(false);

	const handle_copy = useCallback(() => {
		navigator.clipboard.writeText(entry.output_text);
		set_copied(true);
		setTimeout(() => set_copied(false), 2000);
	}, [entry.output_text]);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) on_close();
			}}
		>
			<DialogContent
				className="sm:max-w-3xl max-h-[86vh] flex flex-col overflow-hidden p-0"
				showCloseButton={false}
			>
				{/* Header */}
				<DialogHeader className="px-4 pt-4 pb-0">
					<div className="flex items-center gap-2">
						<Terminal className="size-4 text-muted-foreground" />
						<DialogTitle>QMD Call Detail</DialogTitle>
						{entry.is_error && (
							<Badge variant="destructive">
								<AlertTriangle className="size-3" />
								error
							</Badge>
						)}
						{!entry.has_output && <Badge variant="outline">incomplete</Badge>}
					</div>
				</DialogHeader>

				{/* Metadata */}
				<DialogDescription
					render={<div />}
					className="px-4 py-3 border-b border-t space-y-2 shrink-0 bg-muted/20"
				>
					<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
						<div>
							<span className="text-muted-foreground">Project:</span>{" "}
							<span className="font-medium">{entry.project_name}</span>
						</div>
						<div>
							<span className="text-muted-foreground">Session:</span>{" "}
							<span className="font-mono">
								{entry.session_id.slice(0, 12)}…
							</span>
						</div>
						<div>
							<span className="text-muted-foreground">Time:</span>{" "}
							<span>
								{entry.timestamp ? format_date(entry.timestamp) : "—"}
							</span>
						</div>
						<div>
							<span className="text-muted-foreground">Subcommand:</span>{" "}
							<Badge variant="secondary" className="font-mono">
								{entry.subcommand}
							</Badge>
						</div>
						{entry.collections.length > 0 && (
							<div className="col-span-2">
								<span className="text-muted-foreground">Collections:</span>{" "}
								{entry.collections.map((c) => (
									<Badge key={c} variant="outline" className="font-mono mr-1">
										{c}
									</Badge>
								))}
							</div>
						)}
						{entry.index_name && (
							<div>
								<span className="text-muted-foreground">Index:</span>{" "}
								<span className="font-mono">{entry.index_name}</span>
							</div>
						)}
					</div>
				</DialogDescription>

				{/* Raw command */}
				<div className="px-4 py-3 border-b shrink-0">
					<div className="text-xs font-medium text-muted-foreground mb-1.5">
						Command
					</div>
					<pre className="text-xs bg-muted/40 rounded-none p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
						{entry.raw_command}
					</pre>
				</div>

				{/* Output */}
				<div className="flex-1 overflow-y-auto px-4 py-3">
					<div className="flex items-center justify-between mb-1.5">
						<div className="text-xs font-medium text-muted-foreground">
							Output
						</div>
						{entry.output_text && (
							<Button size="sm" variant="ghost" onClick={handle_copy}>
								{copied ? (
									<Check className="size-3" />
								) : (
									<Copy className="size-3" />
								)}
								{copied ? "Copied" : "Copy"}
							</Button>
						)}
					</div>
					{entry.output_text ? (
						<pre className="text-xs bg-muted/30 rounded-none p-3 overflow-auto whitespace-pre-wrap break-words leading-relaxed max-h-[50vh]">
							{entry.output_text}
						</pre>
					) : (
						<div className="text-center py-8 text-sm text-muted-foreground">
							No output captured for this call.
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
