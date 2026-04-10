import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { resync_sessions } from "@/api/analytics";
import { AnalyticsTimeRangeSelector } from "@/components/analytics-time-range-selector";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function AppHeaderActions({
	show_time_range_selector,
}: {
	show_time_range_selector: boolean;
}) {
	const [is_syncing, set_is_syncing] = useState(false);

	const handle_sync = async () => {
		try {
			set_is_syncing(true);
			await resync_sessions();
			// Full reload is load-bearing: it re-runs the ProjectScopeProvider startup
			// effect which re-fetches the project list and clears stale stored scope.
			window.location.reload();
		} catch (error) {
			console.error("Failed to sync sessions:", error);
			alert("Failed to sync sessions");
		} finally {
			set_is_syncing(false);
		}
	};

	return (
		<div className="ml-auto flex items-center gap-1">
			{show_time_range_selector && <AnalyticsTimeRangeSelector />}
			<Button
				variant="ghost"
				size="sm"
				onClick={handle_sync}
				disabled={is_syncing}
			>
				<RefreshCw className={`size-3 ${is_syncing ? "animate-spin" : ""}`} />
				<span className="ml-1 text-xs">Sync</span>
			</Button>
			<ModeToggle />
		</div>
	);
}
