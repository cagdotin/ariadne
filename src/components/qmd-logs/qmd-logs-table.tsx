import { useMemo } from "react";
import type { VisibilityState } from "@tanstack/react-table";
import type { QmdLogEntry } from "@/schemas/qmd-logs";
import { DataTable } from "@/components/data-table";
import { create_qmd_log_columns } from "./qmd-log-columns";

interface QmdLogsTableProps {
  data: QmdLogEntry[];
  on_view_output: (entry: QmdLogEntry) => void;
  column_visibility: VisibilityState;
}

export function QmdLogsTable({ data, on_view_output, column_visibility }: QmdLogsTableProps) {
  const columns = useMemo(() => create_qmd_log_columns(on_view_output), [on_view_output]);

  return (
    <DataTable
      columns={columns}
      data={data}
      on_row_click={on_view_output}
      column_visibility={column_visibility}
    />
  );
}
