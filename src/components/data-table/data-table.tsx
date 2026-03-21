import {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
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
  filter_column?: string;
  filter_placeholder?: string;
  on_row_click?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filter_column,
  filter_placeholder = "Filter...",
  on_row_click,
}: DataTableProps<TData, TValue>) {
  const [sorting, set_sorting] = useState<SortingState>([]);
  const [column_filters, set_column_filters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: set_sorting,
    onColumnFiltersChange: set_column_filters,
    state: { sorting, columnFilters: column_filters },
  });

  return (
    <div className="w-full min-w-0 space-y-2">
      {filter_column && (
        <Input
          placeholder={filter_placeholder}
          value={(table.getColumn(filter_column)?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn(filter_column)?.setFilterValue(e.target.value)}
          className="max-w-sm"
        />
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
