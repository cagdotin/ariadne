import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableOutputProps {
  text: string;
  max_lines?: number;
  language?: string;
  className?: string;
}

function ToggleButton({ expanded, remaining }: { expanded: boolean; remaining: number }) {
  return (
    <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground mt-1">
      {expanded ? (
        <><ChevronDown className="size-3" /> collapse</>
      ) : (
        <><ChevronRight className="size-3" /> {remaining} more lines</>
      )}
    </Button>
  );
}

export function ExpandableOutput({
  text,
  max_lines = 8,
  language,
  className,
}: ExpandableOutputProps) {
  const [expanded, set_expanded] = useState(false);
  const cleaned = text.replace(/\t/g, "   ");
  const lines = cleaned.split("\n");
  const is_truncated = lines.length > max_lines;

  const display_text = expanded ? cleaned : lines.slice(0, max_lines).join("\n");
  const remaining = lines.length - max_lines;

  if (language) {
    return (
      <div className={cn("mt-2", className)}>
        <div
          className={cn(is_truncated && "cursor-pointer")}
          onClick={is_truncated ? () => set_expanded(!expanded) : undefined}
        >
          <pre className="rounded-none bg-input p-2 px-3 text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
            <code>{display_text}</code>
          </pre>
          {is_truncated && <ToggleButton expanded={expanded} remaining={remaining} />}
        </div>
      </div>
    );
  }

  // Plain text output
  return (
    <div className={cn("mt-2", className)}>
      <div
        className={cn(is_truncated && "cursor-pointer")}
        onClick={is_truncated ? () => set_expanded(!expanded) : undefined}
      >
        <pre className="rounded-none bg-input p-2 px-3 text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
          {display_text}
        </pre>
        {is_truncated && <ToggleButton expanded={expanded} remaining={remaining} />}
      </div>
    </div>
  );
}
