import { useState } from "react";
import type { ResolvedToolCall } from "../types";
import { extract_text } from "../utils";
import { get_tool_handler } from "./tool-registry";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallRendererProps {
  tool: ResolvedToolCall;
}

export function ToolCallRenderer({ tool }: ToolCallRendererProps) {
  const [expanded, set_expanded] = useState(false);
  const is_error = tool.result?.isError ?? false;
  const handler = get_tool_handler(tool.name);
  const { icon, summary } = handler.get_summary(tool);
  const output = tool.result ? extract_text(tool.result.content).trim() : "";
  const body = handler.get_body(tool, output);
  const has_body = body !== null;

  return (
    <div className="my-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={has_body ? () => set_expanded(!expanded) : undefined}
        className={cn(
          "w-full justify-start text-[11px] font-normal",
          has_body ? "cursor-pointer" : "cursor-default",
          is_error
            ? "text-destructive/70 hover:text-destructive"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {has_body ? (
          expanded ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="shrink-0 opacity-50">{icon}</span>
        <span className="font-mono truncate">{summary}</span>
        {is_error && (
          <AlertCircle className="size-3 shrink-0 text-destructive ml-1" />
        )}
      </Button>
      {expanded && has_body && (
        <div className="pl-[18px] pt-1 pb-1">{body}</div>
      )}
    </div>
  );
}
