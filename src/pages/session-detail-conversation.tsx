import { SessionViewer } from "@/components/session-viewer";
import { use_session_detail_context } from "./session-detail-context";
import { Skeleton } from "@/components/ui/skeleton";

export function SessionDetailConversation() {
  const { header, entries, leaf_id, session_summary, loading, error } =
    use_session_detail_context();

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
      header={header}
      entries={entries}
      initial_leaf_id={leaf_id}
      session_summary={session_summary}
    />
  );
}
