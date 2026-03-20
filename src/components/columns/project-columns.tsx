import { ColumnDef } from "@tanstack/react-table";
import { ProjectSummary } from "@/schemas/analytics";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_number, format_cost, format_tokens, format_date_relative } from "@/lib/format";

export const project_columns: ColumnDef<ProjectSummary>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{row.original.name}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.path}</div>
      </div>
    ),
  },
  {
    accessorKey: "session_count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sessions" />,
    cell: ({ row }) => <span>{format_number(row.original.session_count)}</span>,
  },
  {
    accessorKey: "total_cost",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
    cell: ({ row }) => <span>{format_cost(row.original.total_cost)}</span>,
  },
  {
    accessorKey: "total_tokens",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" />,
    cell: ({ row }) => <span>{format_tokens(row.original.total_tokens)}</span>,
  },
  {
    accessorKey: "last_active",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last Active" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{format_date_relative(row.original.last_active)}</span>
    ),
  },
];
