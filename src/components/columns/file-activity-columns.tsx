import { ColumnDef } from "@tanstack/react-table";
import { NameCount } from "@/schemas/analytics";
import { DataTableColumnHeader } from "@/components/data-table";

export const file_activity_columns: ColumnDef<NameCount>[] = [
  {
    accessorKey: "name",
    header: "Path",
    cell: ({ row }) => (
      <span className="truncate font-mono text-xs block" title={row.original.name}>
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: "count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Count" />,
    cell: ({ row }) => (
      <span className="text-right text-muted-foreground block">{row.original.count}</span>
    ),
  },
];
