import { ColumnDef } from "@tanstack/react-table";
import { SessionSummary } from "@/schemas/session";
import { DataTableColumnHeader } from "@/components/data-table";
import { SessionIdCell } from "./session-id-cell";
import { format_duration, format_cost, format_tokens } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const session_columns: ColumnDef<SessionSummary>[] = [
  {
    id: "session",
    accessorKey: "id",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />,
    size: undefined,
    meta: { className: "w-auto" },
    cell: ({ row }) => <SessionIdCell session={row.original} />,
    enableGlobalFilter: true,
  },
  {
    accessorKey: "duration_seconds",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    size: 90,
    cell: ({ row }) => {
      const val = row.original.duration_seconds;
      return <span className="text-sm tabular-nums">{val === null ? "—" : format_duration(val)}</span>;
    },
  },
  {
    accessorKey: "total_cost",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
    size: 80,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{format_cost(row.original.total_cost)}</span>
    ),
  },
  {
    accessorKey: "total_tokens",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" />,
    size: 90,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{format_tokens(row.original.total_tokens)}</span>
    ),
  },
  {
    id: "tools",
    header: "Tools",
    size: 150,
    accessorFn: (row) => {
      return Object.values(row.tool_calls)
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 4)
        .map((t) => t.name);
    },
    cell: ({ getValue }) => {
      const tools = getValue() as string[];
      return (
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] font-normal">
              {t}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    id: "model",
    header: "Model",
    size: 150,
    accessorFn: (row) => {
      const models = row.models_used;
      if (!models.length) return "";
      const primary = models.reduce((a, b) => (b.message_count > a.message_count ? b : a));
      return primary.model_id;
    },
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground truncate block">
        {getValue() as string}
      </span>
    ),
  },
];

export const project_column: ColumnDef<SessionSummary> = {
  accessorKey: "project_name",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
  size: 140,
  cell: ({ row }) => (
    <span className="truncate block text-sm">{row.original.project_name}</span>
  ),
};

export const session_columns_with_project: ColumnDef<SessionSummary>[] = [
  session_columns[0],
  project_column,
  ...session_columns.slice(1),
];
