import { format_duration } from "./trace-transform";

interface TimelineRulerProps {
	total_duration_ms: number;
	/** Visible window for zoom — if set, only show ticks within this range */
	view_start_ms?: number;
	view_end_ms?: number;
}

/** Number of tick marks to aim for */
const TARGET_TICKS = 6;
const SCALE = 0.95;

function compute_ticks(view_start: number, view_end: number): number[] {
	const range = view_end - view_start;
	if (range <= 0) return [view_start];

	const raw_interval = range / TARGET_TICKS;

	// Snap to a "nice" interval
	const magnitude = 10 ** Math.floor(Math.log10(raw_interval));
	const nice_candidates = [1, 2, 5, 10];
	let interval = magnitude;
	for (const c of nice_candidates) {
		if (c * magnitude >= raw_interval) {
			interval = c * magnitude;
			break;
		}
	}

	// Start from the first nice multiple >= view_start
	const first = Math.ceil(view_start / interval) * interval;

	const ticks: number[] = [];
	for (let t = first; t <= view_end; t += interval) {
		ticks.push(t);
	}

	// Always include the end as the final tick if there's space
	const last = ticks[ticks.length - 1];
	if (!last || view_end - last > interval * 0.3) {
		ticks.push(view_end);
	}

	return ticks;
}

export function TimelineRuler({
	total_duration_ms,
	view_start_ms,
	view_end_ms,
}: TimelineRulerProps) {
	const v_start = view_start_ms ?? 0;
	const v_end = view_end_ms ?? total_duration_ms;
	const range = v_end - v_start;

	const ticks = compute_ticks(v_start, v_end);

	return (
		<div className="relative h-6 bg-muted/30">
			{ticks.map((tick_ms) => {
				const left_pct =
					range > 0 ? ((tick_ms - v_start) / range) * 100 * SCALE : 0;
				// For the first tick (at or near 0%), align left edge instead of centering
				const is_first = tick_ms === ticks[0] && left_pct < 3;
				return (
					<div
						key={tick_ms}
						className="absolute top-0 h-full flex flex-col justify-end"
						style={{ left: `${left_pct}%` }}
					>
						<span
							className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap pb-0.5 px-1"
							style={{
								transform: is_first ? "translateX(0)" : "translateX(-50%)",
							}}
						>
							{format_duration(tick_ms)}
						</span>
						<div className="w-px h-1.5 bg-border mx-auto" />
					</div>
				);
			})}
		</div>
	);
}

export { SCALE };
