import { memo } from "react";
import { cn } from "@/lib/utils";
import { SCALE } from "./timeline-ruler";
import { format_duration } from "./trace-transform";
import type { SpanNode } from "./types";

interface SpanBarProps {
	node: SpanNode;
	total_duration_ms: number;
	is_collapsed_parent: boolean;
	is_selected: boolean;
	view_start_ms?: number;
	view_end_ms?: number;
	on_inspect: () => void;
}

/** Reserve this much % on the right for the duration label + inspect button */
const LABEL_RESERVE_PCT = 12;

export const SpanBar = memo(function SpanBar({
	node,
	total_duration_ms,
	is_collapsed_parent,
	is_selected,
	view_start_ms,
	view_end_ms,
	on_inspect,
}: SpanBarProps) {
	const raw_start = is_collapsed_parent ? node.subtree_start_ms : node.start_ms;
	const raw_end = is_collapsed_parent ? node.subtree_end_ms : node.end_ms;
	const duration = raw_end - raw_start;

	const v_start = view_start_ms ?? 0;
	const v_end = view_end_ms ?? total_duration_ms;
	const range = v_end - v_start;

	const bar_start = Math.max(raw_start, v_start);
	const bar_end = Math.min(raw_end, v_end);
	const bar_visible = bar_start < v_end && bar_end > v_start;

	if (!bar_visible) {
		return <div className="relative h-full" />;
	}

	const left_pct =
		range > 0 ? ((bar_start - v_start) / range) * 100 * SCALE : 0;
	const raw_width_pct =
		range > 0
			? Math.max(((bar_end - bar_start) / range) * 100 * SCALE, 0.3)
			: 0.3;

	// Cap bar width so there's always room for the label on the right
	const max_width = Math.max(100 - LABEL_RESERVE_PCT - left_pct, 0.3);
	const width_pct = Math.min(raw_width_pct, max_width);
	const bar_right_pct = left_pct + width_pct;

	const duration_text = format_duration(duration);

	return (
		<div className="relative h-full flex items-center pl-2 pr-2">
			{/* Bar */}
			<div
				className={cn(
					"absolute h-[10px] min-w-[3px]",
					node.is_error && "ring-1 ring-destructive",
				)}
				style={{
					left: `${left_pct}%`,
					width: `${width_pct}%`,
					backgroundColor: node.color,
					opacity: is_selected ? 1 : 0.8,
				}}
			/>

			{/* Duration label + inspect button — always to the right of the bar */}
			<span
				className="absolute flex items-center gap-1.5 whitespace-nowrap"
				style={{ left: `calc(${bar_right_pct}% + 6px)` }}
			>
				<span
					className={cn(
						"text-[10px] tabular-nums",
						is_selected ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{duration_text}
				</span>
				<button
					type="button"
					className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[9px] text-muted-foreground hover:text-foreground cursor-pointer"
					onClick={(e) => {
						e.stopPropagation();
						on_inspect();
					}}
				>
					inspect
				</button>
			</span>
		</div>
	);
});
