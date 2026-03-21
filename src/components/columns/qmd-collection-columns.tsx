import { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import type { QmdCollection } from "@/schemas/qmd";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_number, format_date_relative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function create_qmd_collection_columns(index: string): ColumnDef<QmdCollection>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      size: 140,
      cell: ({ row }) => (
        <Link
          to="/qmd/$index/$collection"
          params={{ index, collection: row.original.name }}
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
}

// Keep backward-compatible export (uses "default" index)
export const qmd_collection_columns = create_qmd_collection_columns("default");
