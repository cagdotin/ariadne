/**
 * Exploration controls strip — top bar with summary chips and focus mode toggle.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import {
	AlertTriangle,
	BookOpen,
	Eye,
	FileEdit,
	MessageSquare,
	Search,
	Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import {
	compute_graph_summary,
	type FocusMode,
} from "@/lib/exploration-graph-view-model";
import { cn } from "@/lib/utils";

interface ExplorationControlsProps {
	graph: SessionGraphPayload;
	focus_mode: FocusMode;
	on_focus_mode_change: (mode: FocusMode) => void;
	show_ambient: boolean;
	on_toggle_ambient: () => void;
}

const focus_mode_labels: Record<FocusMode, string> = {
	path: "Path",
	influence: "Influence",
	neighborhood: "Neighborhood",
};

export function ExplorationControls({
	graph,
	focus_mode,
	on_focus_mode_change,
	show_ambient,
	on_toggle_ambient,
}: ExplorationControlsProps) {
	const summary = useMemo(() => compute_graph_summary(graph), [graph]);

	return (
		<div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/30 flex-none flex-wrap">
			{/* Focus mode toggle */}
			<div className="flex items-center gap-0.5 border border-border rounded-md overflow-hidden">
				{(["path", "influence"] as const).map((mode) => (
					<button
						key={mode}
						type="button"
						className={cn(
							"px-2 py-0.5 text-[10px] font-medium transition-colors",
							focus_mode === mode
								? "bg-primary text-primary-foreground"
								: "hover:bg-accent text-muted-foreground",
						)}
						onClick={() => on_focus_mode_change(mode)}
					>
						{focus_mode_labels[mode]}
					</button>
				))}
			</div>

			{/* Divider */}
			<div className="h-3.5 w-px bg-border" />

			{/* Summary chips */}
			<div className="flex items-center gap-1.5 flex-wrap">
				<SummaryChip
					icon={MessageSquare}
					label={`${summary.turns} turns`}
					color="text-blue-500"
				/>
				<SummaryChip
					icon={Search}
					label={`${summary.searches} searches`}
					color="text-amber-500"
				/>
				<SummaryChip
					icon={BookOpen}
					label={`${summary.docs_read} docs`}
					color="text-cyan-500"
				/>
				<SummaryChip
					icon={Eye}
					label={`${summary.files_read} read`}
					color="text-green-500"
				/>
				<SummaryChip
					icon={FileEdit}
					label={`${summary.files_edited} edited`}
					color="text-orange-500"
				/>
				<SummaryChip
					icon={Sparkles}
					label={`${summary.framing_sources} framing`}
					color="text-amber-600"
				/>
				{summary.unavailable_framing > 0 && (
					<SummaryChip
						icon={AlertTriangle}
						label={`${summary.unavailable_framing} unavailable`}
						color="text-muted-foreground"
						muted
					/>
				)}
			</div>

			{/* Divider */}
			<div className="h-3.5 w-px bg-border" />

			{/* Visibility toggles */}
			<button
				type="button"
				className={cn(
					"text-[10px] px-1.5 py-0.5 rounded-sm transition-colors",
					show_ambient
						? "bg-blue-500/10 text-blue-600"
						: "text-muted-foreground hover:bg-accent",
				)}
				onClick={on_toggle_ambient}
			>
				{show_ambient ? "ambient on" : "ambient off"}
			</button>

			{!graph.has_repo_context && (
				<span className="text-[10px] text-muted-foreground italic ml-auto">
					repo context unavailable
				</span>
			)}
		</div>
	);
}

// ── Summary chip ────────────────────────────────────────────────────────────

function SummaryChip({
	icon: Icon,
	label,
	color,
	muted,
}: {
	icon: typeof Search;
	label: string;
	color: string;
	muted?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-1 text-[10px] tabular-nums",
				muted ? "text-muted-foreground italic" : "text-foreground",
			)}
		>
			<Icon className={cn("size-3", color)} />
			<span>{label}</span>
		</div>
	);
}
