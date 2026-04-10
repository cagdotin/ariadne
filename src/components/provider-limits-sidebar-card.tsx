import type {
	ProviderLimitSnapshot,
	ProviderLimitWindow,
} from "@contracts/provider-limits";
import { AlertCircle, Clock, Gauge, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { use_provider_limits } from "@/components/provider-limits-provider";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

function format_reset_time(resets_at: string | null): string | null {
	if (!resets_at) return null;
	const reset = new Date(resets_at);
	const now = new Date();
	const diff_ms = reset.getTime() - now.getTime();

	if (diff_ms <= 0) return "resetting…";

	const mins = Math.floor(diff_ms / 60_000);
	if (mins < 60) return `${mins}m`;
	const hrs = Math.floor(mins / 60);
	const remaining_mins = mins % 60;
	if (hrs < 24)
		return remaining_mins > 0 ? `${hrs}h ${remaining_mins}m` : `${hrs}h`;
	const days = Math.floor(hrs / 24);
	const remaining_hrs = hrs % 24;
	return remaining_hrs > 0 ? `${days}d ${remaining_hrs}h` : `${days}d`;
}

function usage_color(used_percent: number): string {
	if (used_percent >= 90) return "var(--chart-5)"; // red-ish
	if (used_percent >= 70) return "var(--chart-4)"; // amber
	return "var(--chart-1)"; // default accent
}

function WindowBar({ window: w }: { window: ProviderLimitWindow }) {
	const used = w.used_percent ?? 0;
	const reset_label = format_reset_time(w.resets_at);

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-[10px]">
				<span className="text-muted-foreground truncate">{w.label}</span>
				<span className="text-foreground tabular-nums font-medium">
					{used.toFixed(0)}%
				</span>
			</div>
			<Progress
				value={used}
				trackClassName="h-1.5"
				indicatorStyle={{ backgroundColor: usage_color(used) }}
			/>
			{reset_label && (
				<div className="flex items-center gap-1 text-[9px] text-muted-foreground">
					<Clock className="size-2.5" />
					<span>resets in {reset_label}</span>
				</div>
			)}
		</div>
	);
}

function ProviderCard({ snapshot }: { snapshot: ProviderLimitSnapshot }) {
	const is_error = snapshot.status === "error";

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-xs font-medium text-foreground truncate">
						{snapshot.provider_label}
					</span>
					{snapshot.plan_type && (
						<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
							{snapshot.plan_type}
						</span>
					)}
				</div>
				{snapshot.status === "stale" && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<AlertCircle className="size-3 text-yellow-500" />
							</TooltipTrigger>
							<TooltipContent>Data may be stale</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>

			{is_error ? (
				<p className="text-[10px] text-destructive leading-tight">
					{snapshot.error_message ?? "Failed to fetch limits"}
				</p>
			) : (
				<div className="space-y-2">
					{snapshot.windows.map((w) => (
						<WindowBar key={w.id} window={w} />
					))}
				</div>
			)}
		</div>
	);
}

/** Collapsed sidebar: compact icon + tooltip with summary. */
function CollapsedIndicator({
	snapshots,
}: {
	snapshots: ProviderLimitSnapshot[];
}) {
	const primary_used = useMemo(() => {
		for (const s of snapshots) {
			if (s.status === "error") continue;
			const primary = s.windows.find((w) => w.id === "primary");
			if (primary?.used_percent != null) return primary.used_percent;
		}
		return null;
	}, [snapshots]);

	const has_error = snapshots.some((s) => s.status === "error");

	const summary = useMemo(() => {
		if (has_error) return "Provider limits unavailable";
		if (primary_used != null)
			return `Primary: ${primary_used.toFixed(0)}% used`;
		return "No limit data";
	}, [has_error, primary_used]);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={<div />}
					className="flex items-center justify-center w-full py-2"
				>
					<Gauge
						className={`size-4 ${has_error ? "text-destructive" : "text-muted-foreground"}`}
					/>
				</TooltipTrigger>
				<TooltipContent side="right">{summary}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function ProviderLimitsSidebarCard() {
	const { snapshots, loading, refreshing, refresh } = use_provider_limits();

	if (loading && snapshots.length === 0) {
		return null; // Don't render skeleton in sidebar — too noisy
	}

	if (snapshots.length === 0) {
		return null; // No providers discovered
	}

	return (
		<>
			{/* Expanded sidebar view */}
			<div className="group-data-[collapsible=icon]:hidden px-3 py-3 space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
						Provider Limits
					</span>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							refresh();
						}}
						disabled={refreshing}
						className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
						title="Refresh limits"
					>
						<RefreshCw
							className={`size-3 ${refreshing ? "animate-spin" : ""}`}
						/>
					</button>
				</div>
				{snapshots.map((s) => (
					<ProviderCard key={s.provider_id} snapshot={s} />
				))}
			</div>

			{/* Collapsed sidebar view */}
			<div className="hidden group-data-[collapsible=icon]:block">
				<CollapsedIndicator snapshots={snapshots} />
			</div>
		</>
	);
}
