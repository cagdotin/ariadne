import type {
	ProviderLimitSnapshot,
	ProviderLimitWindow,
} from "@contracts/provider-limits";
import { AlertCircle, Clock, Gauge, Info, RefreshCw } from "lucide-react";
import { use_provider_limits_enabled } from "@/components/app-settings-provider";
import { use_provider_limits } from "@/components/provider-limits-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
	if (mins < 60) return `${mins} min`;
	const hrs = Math.floor(mins / 60);
	const remaining_mins = mins % 60;
	if (hrs < 24)
		return remaining_mins > 0 ? `${hrs}h ${remaining_mins}m` : `${hrs}h`;
	const days = Math.floor(hrs / 24);
	const remaining_hrs = hrs % 24;
	return remaining_hrs > 0 ? `${days}d ${remaining_hrs}h` : `${days}d`;
}

function format_fetched_ago(fetched_at: string): string {
	const fetched = new Date(fetched_at);
	const now = new Date();
	const diff_mins = Math.floor((now.getTime() - fetched.getTime()) / 60_000);

	if (diff_mins < 1) return "just now";
	if (diff_mins < 60) return `${diff_mins}m ago`;
	const hrs = Math.floor(diff_mins / 60);
	return `${hrs}h ago`;
}

function usage_color(used_percent: number): string {
	if (used_percent >= 90) return "var(--chart-5)";
	if (used_percent >= 70) return "var(--chart-4)";
	return "var(--chart-1)";
}

function source_label(source: string): string {
	switch (source) {
		case "codex-app-server":
			return "Codex App Server (RPC)";
		case "codex-session-log":
			return "Codex Session Logs (fallback)";
		default:
			return source;
	}
}

function confidence_label(confidence: string): string {
	switch (confidence) {
		case "high":
			return "High confidence — live RPC";
		case "medium":
			return "Medium confidence — parsed from logs";
		case "low":
			return "Low confidence — data may be incomplete";
		default:
			return confidence;
	}
}

function DetailWindowRow({ window: w }: { window: ProviderLimitWindow }) {
	const used = w.used_percent ?? 0;
	const remaining = w.remaining_percent ?? 100 - used;
	const reset = format_reset_time(w.resets_at);
	const window_label = w.window_minutes
		? w.window_minutes >= 1440
			? `${Math.round(w.window_minutes / 1440)}d rolling window`
			: `${Math.round(w.window_minutes / 60)}h rolling window`
		: null;

	return (
		<div className="space-y-2 py-2">
			<div className="flex items-center justify-between">
				<div>
					<span className="text-sm font-medium">{w.label}</span>
					{window_label && (
						<span className="text-xs text-muted-foreground ml-2">
							({window_label})
						</span>
					)}
				</div>
				<div className="flex items-center gap-3 tabular-nums text-sm">
					<span className="font-medium" style={{ color: usage_color(used) }}>
						{used.toFixed(1)}% used
					</span>
					<span className="text-muted-foreground">
						{remaining.toFixed(1)}% remaining
					</span>
				</div>
			</div>
			<Progress
				value={used}
				trackClassName="h-2.5"
				indicatorStyle={{ backgroundColor: usage_color(used) }}
			/>
			{reset && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Clock className="size-3" />
					<span>Resets in {reset}</span>
				</div>
			)}
		</div>
	);
}

function ProviderDetail({ snapshot }: { snapshot: ProviderLimitSnapshot }) {
	const is_error = snapshot.status === "error";
	const is_stale = snapshot.status === "stale";

	return (
		<div className="space-y-4">
			{/* Provider header */}
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<span className="font-medium">{snapshot.provider_label}</span>
						{snapshot.plan_type && (
							<Badge variant="secondary" className="uppercase text-[10px]">
								{snapshot.plan_type}
							</Badge>
						)}
						{is_stale && (
							<Badge
								variant="outline"
								className="text-[10px] text-yellow-500 border-yellow-500/30"
							>
								stale
							</Badge>
						)}
						{is_error && (
							<Badge variant="destructive" className="text-[10px]">
								error
							</Badge>
						)}
					</div>
					{snapshot.account_label && (
						<p className="text-xs text-muted-foreground">
							{snapshot.account_label}
						</p>
					)}
				</div>
				<div className="text-right space-y-0.5">
					<p className="text-[10px] text-muted-foreground">
						{format_fetched_ago(snapshot.fetched_at)}
					</p>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger
								render={<span />}
								className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end cursor-help"
							>
								<Info className="size-2.5" />
								{source_label(snapshot.source).split("(")[0].trim()}
							</TooltipTrigger>
							<TooltipContent>
								<p>{source_label(snapshot.source)}</p>
								<p className="text-muted-foreground">
									{confidence_label(snapshot.source_confidence)}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Error state */}
			{is_error && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>
						{snapshot.error_message ?? "Failed to fetch limits"}
					</AlertDescription>
				</Alert>
			)}

			{/* Windows */}
			{!is_error && snapshot.windows.length > 0 && (
				<div className="divide-y divide-border">
					{snapshot.windows.map((w) => (
						<DetailWindowRow key={w.id} window={w} />
					))}
				</div>
			)}

			{/* Credits */}
			{snapshot.credits && (
				<div className="text-xs text-muted-foreground border-t border-border pt-2">
					{snapshot.credits.unlimited ? (
						<span>Unlimited credits</span>
					) : snapshot.credits.has_credits ? (
						<span>
							Credits balance: {snapshot.credits.balance ?? "available"}
						</span>
					) : (
						<span>No credits remaining</span>
					)}
				</div>
			)}

			{/* Explainer */}
			{!is_error && (
				<p className="text-[10px] text-muted-foreground leading-relaxed">
					Percentages reflect rolling-window usage. Actual message counts vary
					with context size and task complexity.
				</p>
			)}
		</div>
	);
}

export function ProviderLimitsDetail() {
	const is_provider_limits_enabled = use_provider_limits_enabled();
	const { snapshots, loading, refreshing, refresh } = use_provider_limits();

	if (!is_provider_limits_enabled) {
		return null;
	}

	if (loading && snapshots.length === 0) {
		return <Skeleton className="h-[200px] w-full" />;
	}

	if (snapshots.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<CardTitle className="text-base flex items-center gap-2">
					<Gauge className="size-4" />
					Subscription Limits
				</CardTitle>
				<Button
					variant="ghost"
					size="sm"
					onClick={refresh}
					disabled={refreshing}
					className="h-7 px-2"
				>
					<RefreshCw
						className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
					/>
					<span className="ml-1.5 text-xs">Refresh</span>
				</Button>
			</CardHeader>
			<CardContent className="space-y-6">
				{snapshots.map((s) => (
					<ProviderDetail key={s.provider_id} snapshot={s} />
				))}
			</CardContent>
		</Card>
	);
}
