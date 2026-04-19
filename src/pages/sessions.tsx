import type { SessionSummary } from "@contracts/sessions/summary";
import { useEffect, useState } from "react";
import { get_all_sessions } from "@/api/analytics";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { use_project_scope } from "@/components/project-scope-provider";
import { SessionsTable } from "@/components/sessions";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function Sessions() {
	const { scope } = use_project_scope();
	const { range_days } = use_analytics_time_range();
	const project_path = scope?.project_path;

	const [sessions, set_sessions] = useState<SessionSummary[]>([]);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const fetch_sessions = async () => {
			try {
				set_loading(true);
				set_error(null);
				const data = await get_all_sessions(project_path, range_days);
				if (cancelled) return;
				set_sessions(data);
			} catch (err) {
				if (cancelled) return;
				set_error(error_message(err, "Failed to load sessions"));
			} finally {
				if (!cancelled) set_loading(false);
			}
		};
		fetch_sessions();
		return () => {
			cancelled = true;
		};
	}, [project_path, range_days]);

	if (error) {
		return (
			<div className="min-w-0 w-full">
				<p className="text-destructive text-sm">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 min-w-0 w-full">
			{loading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 8 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
						<Skeleton key={i} className="h-7 w-full" />
					))}
				</div>
			) : (
				<SessionsTable sessions={sessions} />
			)}
		</div>
	);
}
