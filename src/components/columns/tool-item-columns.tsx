import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_number } from "@/lib/format";

export type ToolItem = { name: string; count: number };

export function create_tool_item_columns(max_count: number): ColumnDef<ToolItem>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="truncate font-mono text-xs block">{row.original.name}</span>
      ),
    },
    {
      id: "bar",
      header: "",
      cell: ({ row }) => {
        const pct = max_count > 0 ? (row.original.count / max_count) * 100 : 0;
        return (
          <div className="w-full h-3 rounded-sm bg-muted min-w-[80px]">
            <div
              className="h-full rounded-sm bg-primary opacity-70"
              style={{ width: `${pct}%` }}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "count",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Count" />,
      cell: ({ row }) => (
        <span className="text-right tabular-nums block">{format_number(row.original.count)}</span>
      ),
    },
  ];
}
