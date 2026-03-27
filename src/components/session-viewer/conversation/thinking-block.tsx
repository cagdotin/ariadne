import { useState } from "react";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThinkingBlockProps {
  text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
  const [expanded, set_expanded] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <div className="my-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => set_expanded(!expanded)}
        className="text-[11px] text-muted-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Brain className="size-3 opacity-50" />
        <span className="italic">Thinking…</span>
      </Button>
      {expanded && (
        <pre className="pl-5 text-xs font-mono text-muted-foreground italic whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
          {trimmed}
        </pre>
      )}
    </div>
  );
}
