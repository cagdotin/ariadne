import type { SessionSummary } from "@contracts/sessions/summary";
import { useNavigate } from "@tanstack/react-router";
import { SessionsTable } from "@/components/sessions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface RecentSessionsCardProps {
  sessions: SessionSummary[];
}

export function RecentSessionsCard({ sessions }: RecentSessionsCardProps) {
  const navigate = useNavigate();
  const recent_sessions = sessions.slice(0, 5);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-3  mt-6 mb-4">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Recent sessions
        </span>
        <Separator className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/sessions" })}
        >
          View all
        </Button>
      </div>
      <SessionsTable sessions={recent_sessions} show_toolbar={false} />
    </div>
  );
}
