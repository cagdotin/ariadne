import { ColumnDef } from "@tanstack/react-table";
import type { QmdDocument } from "@/schemas/qmd";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_date_relative } from "@/lib/format";

export const qmd_document_columns: ColumnDef<QmdDocument>[] = [
  {
    accessorKey: "path",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Path" />,
    cell: ({ row }) => (
      <span className="text-sm text-foreground truncate block">{row.original.path}</span>
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    size: 180,
    cell: ({ row }) => (
      <span className="text-sm text-foreground truncate block">{row.original.title || "—"}</span>
    ),
  },
  {
    accessorKey: "docid",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Docid" />,
    size: 120,
    cell: ({ row }) => (
      <span className="text-xs font-mono text-muted-foreground truncate block">{row.original.docid}</span>
    ),
  },
  {
    accessorKey: "modified_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Modified" />,
    size: 100,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{format_date_relative(row.original.modified_at)}</span>
    ),
  },
];
