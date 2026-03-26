import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type Table as TanstackTable,
  type VisibilityState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Render a custom toolbar. When provided, overrides filter_column/filter_placeholder. */
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode;
  /** Custom global filter function — used when toolbar manages globalFilter state. */
  global_filter_fn?: FilterFn<TData>;
  filter_column?: string;
  filter_placeholder?: string;
  on_row_click?: (row: TData) => void;
  /** Controlled column visibility from the parent. */
  column_visibility?: VisibilityState;
  /** Callback when column visibility changes. */
  on_column_visibility_change?: (visibility: VisibilityState) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  global_filter_fn,
  filter_column,
  filter_placeholder = "Filter...",
  on_row_click,
  column_visibility,
  on_column_visibility_change,
}: DataTableProps<TData, TValue>) {
  const [sorting, set_sorting] = useState<SortingState>([]);
  const [column_filters, set_column_filters] = useState<ColumnFiltersState>([]);
  const [internal_visibility, set_internal_visibility] = useState<VisibilityState>({});

  const visibility = column_visibility ?? internal_visibility;
  const set_visibility = on_column_visibility_change ?? set_internal_visibility;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: set_sorting,
    onColumnFiltersChange: set_column_filters,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(visibility) : updater;
      set_visibility(next);
    },
    globalFilterFn: global_filter_fn,
    state: {
      sorting,
      columnFilters: column_filters,
      columnVisibility: visibility,
    },
  });

  return (
    <div className="w-full min-w-0 space-y-2">
      {toolbar ? (
        toolbar(table)
      ) : (
        filter_column && (
          <Input
            placeholder={filter_placeholder}
            value={(table.getColumn(filter_column)?.getFilterValue() as string) ?? ""}
            onChange={(e) => table.getColumn(filter_column)?.setFilterValue(e.target.value)}
            className="max-w-sm"
          />
        )
      )}
      <div className="w-full min-w-0 overflow-x-auto">
        <Table className="w-full table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((header_group) => (
              <TableRow key={header_group.id}>
                {header_group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={header.column.columnDef.size ? { width: `${header.column.columnDef.size}px` } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={on_row_click ? "cursor-pointer" : undefined}
                  onClick={on_row_click ? () => on_row_click(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
