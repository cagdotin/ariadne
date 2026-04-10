import type { QmdLogEntry } from "@contracts/qmd-logs";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { format_date_relative } from "@/lib/format";

export function create_qmd_log_columns(
	on_view_output: (entry: QmdLogEntry) => void,
): ColumnDef<QmdLogEntry>[] {
	return [
		{
			accessorKey: "timestamp",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Time" />
			),
			size: 110,
			cell: ({ row }) => (
				<span className="text-muted-foreground text-xs whitespace-nowrap">
					{row.original.timestamp
						? format_date_relative(row.original.timestamp)
						: "—"}
				</span>
			),
		},
		{
			accessorKey: "project_name",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Project" />
			),
			size: 130,
			cell: ({ row }) => (
				<span
					className="text-sm truncate block"
					title={row.original.project_path}
				>
					{row.original.project_name}
				</span>
			),
		},
		{
			accessorKey: "session_id",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Session" />
			),
			size: 100,
			cell: ({ row }) => (
				<span className="text-xs font-mono text-muted-foreground truncate block">
					{row.original.session_id.slice(0, 8)}…
				</span>
			),
		},
		{
			accessorKey: "subcommand",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Subcommand" />
			),
			size: 100,
			cell: ({ row }) => (
				<Badge variant="secondary" className="font-mono text-[11px]">
					{row.original.subcommand}
				</Badge>
			),
		},
		{
			accessorKey: "primary_argument",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Argument" />
			),
			cell: ({ row }) => (
				<span
					className="text-sm truncate block"
					title={row.original.primary_argument ?? undefined}
				>
					{row.original.primary_argument ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "is_error",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="Status" />
			),
			size: 80,
			cell: ({ row }) => {
				if (!row.original.has_output) {
					return (
						<Badge variant="outline" className="text-[11px]">
							incomplete
						</Badge>
					);
				}
				return row.original.is_error ? (
					<Badge variant="destructive" className="text-[11px]">
						error
					</Badge>
				) : (
					<Badge
						variant="secondary"
						className="text-[11px] text-emerald-600 dark:text-emerald-400"
					>
						ok
					</Badge>
				);
			},
		},
		{
			accessorKey: "output_preview",
			header: "Output",
			size: 200,
			cell: ({ row }) => (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						on_view_output(row.original);
					}}
					className="text-xs text-muted-foreground truncate block text-left hover:text-foreground transition-colors max-w-full cursor-pointer"
					title="Click to view full output"
				>
					{row.original.output_preview || "(no output)"}
				</button>
			),
		},
	];
}
