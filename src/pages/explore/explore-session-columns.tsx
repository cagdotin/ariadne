import type { FileSessionDetail } from "@contracts/analytics/file-sessions";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { format_cost, format_duration } from "@/lib/format";

export const explore_session_columns: ColumnDef<FileSessionDetail>[] = [
	{
		id: "session",
		accessorKey: "session_id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Session" />
		),
		size: 90,
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground truncate block">
				{row.original.session_id.slice(0, 8)}
			</span>
		),
	},
	{
		id: "started_at",
		accessorKey: "started_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Date" />
		),
		size: 100,
		cell: ({ row }) => {
			const dt = new Date(row.original.started_at);
			return (
				<span className="text-xs tabular-nums text-muted-foreground">
					{dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
				</span>
			);
		},
	},
	{
		id: "model",
		accessorKey: "model_id",
		header: "Model",
		size: 140,
		cell: ({ row }) => (
			<span className="text-xs text-muted-foreground truncate block">
				{row.original.model_id ?? "—"}
			</span>
		),
	},
	{
		id: "reads",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Reads" />,
		size: 70,
		accessorFn: (row) => row.file_ops.reduce((s, fo) => s + fo.read_count, 0),
		cell: ({ getValue }) => {
			const v = getValue() as number;
			return <span className="text-xs tabular-nums text-blue-400">{v > 0 ? v : "—"}</span>;
		},
	},
	{
		id: "edits",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Edits" />,
		size: 70,
		accessorFn: (row) => row.file_ops.reduce((s, fo) => s + fo.edit_count, 0),
		cell: ({ getValue }) => {
			const v = getValue() as number;
			return <span className="text-xs tabular-nums text-green-400">{v > 0 ? v : "—"}</span>;
		},
	},
	{
		id: "writes",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Writes" />,
		size: 70,
		accessorFn: (row) => row.file_ops.reduce((s, fo) => s + fo.write_count, 0),
		cell: ({ getValue }) => {
			const v = getValue() as number;
			return <span className="text-xs tabular-nums text-orange-400">{v > 0 ? v : "—"}</span>;
		},
	},
	{
		id: "total_ops",
		accessorKey: "total_file_ops",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Ops" />,
		size: 60,
		cell: ({ row }) => (
			<span className="text-xs tabular-nums font-medium">{row.original.total_file_ops}</span>
		),
	},
	{
		id: "files",
		header: "Files",
		size: 50,
		accessorFn: (row) => row.file_ops.length,
		cell: ({ row }) => {
			const ops = row.original.file_ops;
			if (ops.length <= 1)
				return <span className="text-xs tabular-nums text-muted-foreground">{ops.length}</span>;
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger className="text-xs tabular-nums cursor-default">{ops.length}</TooltipTrigger>
						<TooltipContent side="bottom" align="start" className="max-w-72">
							<ul className="flex flex-col gap-0.5">
								{ops.slice(0, 10).map((fo) => (
									<li key={fo.path} className="flex justify-between gap-4 text-xs">
										<span className="truncate max-w-[180px]">{fo.path.split("/").pop()}</span>
										<span className="tabular-nums text-muted-foreground shrink-0">
											R:{fo.read_count} E:{fo.edit_count} W:{fo.write_count}
										</span>
									</li>
								))}
								{ops.length > 10 && <li className="text-xs text-muted-foreground">+{ops.length - 10} more</li>}
							</ul>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
	{
		id: "cost",
		accessorKey: "total_cost",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
		size: 80,
		cell: ({ row }) => (
			<span className="text-xs tabular-nums">{format_cost(row.original.total_cost)}</span>
		),
	},
	{
		id: "duration",
		accessorKey: "duration_seconds",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
		size: 80,
		cell: ({ row }) => {
			const val = row.original.duration_seconds;
			return <span className="text-xs tabular-nums">{val === null ? "—" : format_duration(val)}</span>;
		},
	},
	{
		id: "message",
		accessorKey: "prompt_preview",
		header: "Message",
		size: undefined,
		meta: { className: "w-auto" },
		cell: ({ row }) => (
			<span className="text-xs text-muted-foreground truncate block">
				{row.original.prompt_preview || "—"}
			</span>
		),
	},
];
