import { AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QmdLogsToolbarProps {
	search: string;
	on_search_change: (value: string) => void;
	subcommand_filter: string | null;
	on_subcommand_filter_change: (value: string | null) => void;
	error_only: boolean;
	on_error_only_change: (value: boolean) => void;
	available_subcommands: string[];
}

export function QmdLogsToolbar({
	search,
	on_search_change,
	subcommand_filter,
	on_subcommand_filter_change,
	error_only,
	on_error_only_change,
	available_subcommands,
}: QmdLogsToolbarProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<div className="relative flex-1 min-w-[200px] max-w-sm">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
				<Input
					placeholder="Search commands, arguments, output..."
					value={search}
					onChange={(e) => on_search_change(e.target.value)}
					className="pl-8"
				/>
			</div>

			<div className="flex items-center gap-1.5 flex-wrap">
				<Badge
					variant={subcommand_filter === null ? "default" : "outline"}
					className="cursor-pointer"
					onClick={() => on_subcommand_filter_change(null)}
				>
					All
				</Badge>
				{available_subcommands.map((cmd) => (
					<Badge
						key={cmd}
						variant={subcommand_filter === cmd ? "default" : "outline"}
						className="cursor-pointer font-mono"
						onClick={() =>
							on_subcommand_filter_change(
								subcommand_filter === cmd ? null : cmd,
							)
						}
					>
						{cmd}
					</Badge>
				))}
			</div>

			<Badge
				variant={error_only ? "destructive" : "outline"}
				className="cursor-pointer"
				onClick={() => on_error_only_change(!error_only)}
			>
				<AlertTriangle className="size-3" />
				Errors only
			</Badge>

			{(search || subcommand_filter || error_only) && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						on_search_change("");
						on_subcommand_filter_change(null);
						on_error_only_change(false);
					}}
				>
					Clear filters
				</Button>
			)}
		</div>
	);
}
