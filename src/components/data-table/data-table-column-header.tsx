import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataTableColumnHeaderProps<TData, TValue> {
	column: Column<TData, TValue>;
	title: string;
}

export function DataTableColumnHeader<TData, TValue>({
	column,
	title,
}: DataTableColumnHeaderProps<TData, TValue>) {
	if (!column.getCanSort()) {
		return <span>{title}</span>;
	}

	const sorted = column.getIsSorted();

	return (
		<Button
			variant="ghost"
			size="sm"
			className="-ml-2 h-7 px-2 text-xs"
			onClick={() => column.toggleSorting(sorted === "asc")}
		>
			{title}
			{sorted === "asc" ? (
				<ArrowUp data-icon="inline-end" />
			) : sorted === "desc" ? (
				<ArrowDown data-icon="inline-end" />
			) : (
				<ArrowUpDown data-icon="inline-end" />
			)}
		</Button>
	);
}
