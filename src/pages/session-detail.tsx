import type { SessionSummary } from "@contracts/sessions/summary";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get_session_detail, get_session_entries } from "@/api/analytics";
import type { SessionEntriesResponse } from "@/components/session-viewer";
import { SessionViewer } from "@/components/session-viewer";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";

export function SessionDetail() {
	const { id } = useParams({ strict: false }) as { id: string };
	const [data, set_data] = useState<SessionEntriesResponse | null>(null);
	const [session_summary, set_session_summary] =
		useState<SessionSummary | null>(null);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;
		set_loading(true);
		set_error(null);

		Promise.all([
			get_session_entries(id),
			get_session_detail(id).catch(() => null),
		])
			.then(([entries_data, summary_data]) => {
				set_data(entries_data);
				set_session_summary(summary_data);
			})
			.catch((err) => set_error(error_message(err, "Failed to load session")))
			.finally(() => set_loading(false));
	}, [id]);

	if (error) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-destructive text-sm">{error}</p>
			</div>
		);
	}

	if (loading || !data) {
		return (
			<div className="p-6 space-y-3">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}

	return (
		<SessionViewer
			header={
				data.header as
					| import("@/components/session-viewer/types").SessionHeader
					| null
			}
			entries={
				data.entries as import("@/components/session-viewer/types").SessionEntry[]
			}
			initial_leaf_id={data.leaf_id}
			session_summary={session_summary}
		/>
	);
}
