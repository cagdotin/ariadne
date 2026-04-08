import { useNavigate } from "@tanstack/react-router";
import type { SessionSummary } from "@contracts/sessions/summary";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface SessionIdCellProps {
  session: SessionSummary;
}

export function SessionIdCell({ session }: SessionIdCellProps) {
  const navigate = useNavigate();
  const short_id = session.id.slice(0, 8);
  const title = session.title;
  const preview = session.first_user_message;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex flex-col items-start gap-0.5 text-left w-full min-w-0 h-auto py-1 group"
      onClick={() => navigate({ to: "/sessions/$id", params: { id: session.id } })}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        <Tooltip>
          <TooltipTrigger
            className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
          >
            {short_id}
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="font-mono text-xs">{session.id}</span>
          </TooltipContent>
        </Tooltip>
        {title && (
          <span className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {title}
          </span>
        )}
      </div>
      {preview && (
        <span className="text-xs text-muted-foreground truncate w-full leading-snug">
          {preview}
        </span>
      )}
    </Button>
  );
}
