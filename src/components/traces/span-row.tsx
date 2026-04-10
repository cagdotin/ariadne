import { memo } from "react";
import { cn } from "@/lib/utils";
import { SpanBar } from "./span-bar";
import { SpanTreeCell } from "./span-tree-cell";
import type { VisibleRow } from "./types";

interface SpanRowProps {
	row: VisibleRow;
	total_duration_ms: number;
	is_selected: boolean;
	on_select: (id: string) => void;
	on_toggle: (id: string) => void;
	view_start_ms?: number;
	view_end_ms?: number;
}

const ROW_HEIGHT = 28;

export const SpanRow = memo(function SpanRow({
	row,
	total_duration_ms,
	is_selected,
	on_select,
	on_toggle,
	view_start_ms,
	view_end_ms,
}: SpanRowProps) {
	const is_collapsed_parent = row.has_children && !row.is_expanded;

	return (
		// biome-ignore lint/a11y/useSemanticElements: div with role="button" for row layout
		<div
			className={cn(
				"group/row flex cursor-pointer border-b border-border/40 hover:bg-muted/50 transition-colors",
				is_selected && "bg-muted",
			)}
			style={{ height: `${ROW_HEIGHT}px` }}
			role="button"
			tabIndex={0}
			onClick={() => {
				if (row.has_children) {
					on_toggle(row.node.id);
				} else {
					on_select(row.node.id);
				}
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					if (row.has_children) on_toggle(row.node.id);
					else on_select(row.node.id);
				}
			}}
		>
			{/* Tree cell */}
			<div
				className="flex-none overflow-hidden border-r border-border"
				style={{ width: "var(--tree-width)" }}
			>
				<SpanTreeCell
					row={row}
					is_selected={is_selected}
					on_toggle={on_toggle}
				/>
			</div>

			{/* Timeline cell */}
			<div className="flex-1 min-w-0 relative">
				<SpanBar
					node={row.node}
					total_duration_ms={total_duration_ms}
					is_collapsed_parent={is_collapsed_parent}
					is_selected={is_selected}
					view_start_ms={view_start_ms}
					view_end_ms={view_end_ms}
					on_inspect={() => on_select(row.node.id)}
				/>
			</div>
		</div>
	);
});

export { ROW_HEIGHT };
