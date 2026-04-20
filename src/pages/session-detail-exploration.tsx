/**
 * Session Exploration route — graph-first.
 *
 * Source of truth: the graph IR (SessionGraphPayload) is the sole data
 * source for this route. The visualization components consume the
 * graph directly via graph-native view models.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { useEffect, useState } from "react";
import { get_session_graph } from "@/api/graph";
import { ExplorationView } from "@/components/exploration/exploration-view";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";
import { use_session_detail_context } from "./session-detail-context";

export function SessionDetailExploration() {
	const {
		header,
		entries,
		loading: ctx_loading,
		error: ctx_error,
	} = use_session_detail_context();
	const [graph, set_graph] = useState<SessionGraphPayload | null>(null);
	const [loading, set_loading] = useState(false);
	const [error, set_error] = useState<string | null>(null);

	const session_id = header?.id ?? null;

	useEffect(() => {
		if (!session_id || ctx_loading) return;

		let cancelled = false;
		set_loading(true);
		set_error(null);

		get_session_graph(session_id)
			.then((result) => {
				if (!cancelled) set_graph(result);
			})
			.catch((err) => {
				if (!cancelled)
					set_error(error_message(err, "Failed to load exploration data"));
			})
			.finally(() => {
				if (!cancelled) set_loading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [session_id, ctx_loading]);

	if (ctx_error) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-destructive text-sm">{ctx_error}</p>
			</div>
		);
	}

	if (ctx_loading || loading) {
		return (
			<div className="p-6 space-y-3">
				<Skeleton className="h-8 w-48" />
				<div className="flex gap-4 h-[calc(100vh-16rem)]">
					<Skeleton className="flex-1" />
					<Skeleton className="flex-1" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-destructive text-sm">{error}</p>
			</div>
		);
	}

	if (!graph) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">
					No exploration data available
				</p>
			</div>
		);
	}

	return <ExplorationView graph={graph} entries={entries} />;
}
