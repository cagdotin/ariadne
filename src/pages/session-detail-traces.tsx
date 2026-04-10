import { TracesView } from "@/components/traces/traces-view";
import { Skeleton } from "@/components/ui/skeleton";
import { use_session_detail_context } from "./session-detail-context";

export function SessionDetailTraces() {
	const { header, entries, loading, error } = use_session_detail_context();

	if (error) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-destructive text-sm">{error}</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="p-6 space-y-3">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	return <TracesView header={header} entries={entries} />;
}
