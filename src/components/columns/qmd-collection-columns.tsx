import { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import type { QmdCollection } from "@/schemas/qmd";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_number, format_date_relative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const qmd_collection_columns: ColumnDef<QmdCollection>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    size: 140,
    cell: ({ row }) => (
      <Link
        to="/qmd/$name"
        params={{ name: row.original.name }}
        className="font-medium text-foreground hover:underline truncate block"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "path",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Path" />,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate block">{row.original.path}</span>
    ),
  },
  {
    accessorKey: "pattern",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pattern" />,
    size: 100,
    cell: ({ row }) => (
      <span className="text-sm font-mono text-muted-foreground truncate block">{row.original.pattern}</span>
    ),
  },
  {
    accessorKey: "active_doc_count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Docs" />,
    size: 70,
    cell: ({ row }) => <span>{format_number(row.original.active_doc_count)}</span>,
  },
  {
    accessorKey: "embedded_count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Embedded" />,
    size: 90,
    cell: ({ row }) => <span>{format_number(row.original.embedded_count)}</span>,
  },
  {
    accessorKey: "last_modified",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
    size: 100,
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate block">
        {row.original.last_modified ? format_date_relative(row.original.last_modified) : "—"}
      </span>
    ),
  },
  {
    accessorKey: "include_by_default",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Default" />,
    size: 80,
    cell: ({ row }) =>
      row.original.include_by_default ? (
        <Badge variant="secondary">Default</Badge>
      ) : null,
  },
];
