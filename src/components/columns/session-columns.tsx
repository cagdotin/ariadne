import { ColumnDef } from "@tanstack/react-table";
import { SessionSummary } from "@/schemas/session";
import { DataTableColumnHeader } from "@/components/data-table";
import { format_duration, format_cost, format_tokens } from "@/lib/format";

export const session_columns: ColumnDef<SessionSummary>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => {
      const title = row.original.title;
      const id = row.original.id;
      const display = title || id.slice(0, 50) + "...";
      return <span className="truncate max-w-xs block">{display}</span>;
    },
  },
  {
    accessorKey: "duration_seconds",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      const val = row.original.duration_seconds;
      return <span>{val === null ? "-" : format_duration(val)}</span>;
    },
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
    id: "tools",
    header: "Tools",
    accessorFn: (row) => {
      const tool_calls = row.tool_calls;
      const sorted = Object.values(tool_calls).sort((a, b) => b.calls - a.calls);
      return sorted
        .slice(0, 3)
        .map((t) => t.name)
        .join(", ");
    },
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: "model",
    header: "Model",
    accessorFn: (row) => {
      const models = row.models_used;
      if (!models.length) return "";
      const primary = models.reduce((a, b) => (b.message_count > a.message_count ? b : a));
      return primary.model_id;
    },
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground truncate max-w-[160px] block">
        {getValue() as string}
      </span>
    ),
  },
];

export const project_column: ColumnDef<SessionSummary> = {
  accessorKey: "project_name",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
  cell: ({ row }) => <span>{row.original.project_name}</span>,
};

export const session_columns_with_project: ColumnDef<SessionSummary>[] = [
  session_columns[0],
  project_column,
  ...session_columns.slice(1),
];
