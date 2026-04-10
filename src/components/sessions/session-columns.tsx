import type { SessionSummary } from "@contracts/sessions/summary";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { format_cost, format_duration, format_tokens } from "@/lib/format";

export const session_columns: ColumnDef<SessionSummary>[] = [
	{
		id: "session",
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="ID" />
		),
		size: 80,
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground truncate block">
				{row.original.id.slice(0, 8)}
			</span>
		),
		enableGlobalFilter: true,
	},
	{
		id: "model",
		header: "Model",
		size: 160,
		accessorFn: (row) => {
			const models = row.models_used;
			if (!models.length) return "";
			const primary = models.reduce((a, b) =>
				b.message_count > a.message_count ? b : a,
			);
			return primary.model_id;
		},
		cell: ({ getValue }) => (
			<span className="text-xs text-muted-foreground truncate block">
				{getValue() as string}
			</span>
		),
	},
	{
		accessorKey: "duration_seconds",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Duration" />
		),
		size: 90,
		cell: ({ row }) => {
			const val = row.original.duration_seconds;
			return (
				<span className="text-xs tabular-nums">
					{val === null ? "—" : format_duration(val)}
				</span>
			);
		},
	},
	{
		accessorKey: "total_cost",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Cost" />
		),
		size: 80,
		cell: ({ row }) => (
			<span className="text-xs tabular-nums">
				{format_cost(row.original.total_cost)}
			</span>
		),
	},
	{
		accessorKey: "total_tokens",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tokens" />
		),
		size: 90,
		cell: ({ row }) => (
			<span className="text-xs tabular-nums">
				{format_tokens(row.original.total_tokens)}
			</span>
		),
	},
	{
		id: "tools",
		header: "Tools",
		size: 60,
		accessorFn: (row) =>
			Object.values(row.tool_calls).sort((a, b) => b.calls - a.calls),
		cell: ({ getValue }) => {
			const tools = getValue() as {
				name: string;
				calls: number;
				errors: number;
			}[];
			if (!tools.length)
				return <span className="text-xs text-muted-foreground">0</span>;
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger className="text-xs tabular-nums cursor-default">
							{tools.length}
						</TooltipTrigger>
						<TooltipContent side="bottom" align="start" className="max-w-64">
							<ul className="flex flex-col gap-0.5">
								{tools.map((t) => (
									<li
										key={t.name}
										className="flex justify-between gap-4 text-xs"
									>
										<span>{t.name}</span>
										<span className="tabular-nums text-muted-foreground">
											{t.calls}
										</span>
									</li>
								))}
							</ul>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
	{
		id: "message",
		header: "Message",
		size: undefined,
		meta: { className: "w-auto" },
		accessorFn: (row) => row.title || row.first_user_message || "",
		cell: ({ getValue }) => (
			<span className="text-xs text-muted-foreground truncate block">
				{getValue() as string}
			</span>
		),
	},
];

export const project_column: ColumnDef<SessionSummary> = {
	accessorKey: "project_name",
	header: ({ column }) => (
		<DataTableColumnHeader column={column} title="Project" />
	),
	size: 120,
	cell: ({ row }) => (
		<span className="truncate block text-xs">{row.original.project_name}</span>
	),
};

export const session_columns_with_project: ColumnDef<SessionSummary>[] = [
	session_columns[0],
	project_column,
	...session_columns.slice(1),
];
