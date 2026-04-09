import type {
  MessageEntry,
  AssistantMessageData,
  ToolResultMessage,
  ResolvedToolCall,
} from "../types";
import { MarkdownContent } from "../primitives/markdown-content";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallRenderer } from "../tool-calls/tool-call-renderer";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp } from "../utils";
import { AlertCircle, XCircle } from "lucide-react";

interface AssistantMessageProps {
  entry: MessageEntry;
  tool_result_map: Map<string, ToolResultMessage>;
}

export function AssistantMessage({ entry, tool_result_map }: AssistantMessageProps) {
  const msg = entry.message as AssistantMessageData;

  const text_blocks = msg.content.filter((b) => b.type === "text" && "text" in b && (b.text as string).trim());
  const thinking_blocks = msg.content.filter(
    (b) => b.type === "thinking" && "thinking" in b && (b.thinking as string).trim()
  );
  const tool_calls = msg.content.filter((b) => b.type === "toolCall");

  const resolved_tools: ResolvedToolCall[] = tool_calls.map((tc) => ({
    id: "id" in tc ? (tc.id as string) : "",
    name: "name" in tc ? (tc.name as string) : "",
    arguments: "arguments" in tc ? (tc.arguments as Record<string, unknown>) : {},
    result: "id" in tc ? (tool_result_map.get(tc.id as string) ?? null) : null,
  }));

  const is_aborted = msg.stopReason === "aborted";
  const is_error = msg.stopReason === "error";
  const has_text = text_blocks.length > 0;

  return (
    <div className="relative space-y-2 min-w-0 overflow-hidden">
      {/* Minimal turn divider — timestamp + inspector */}
      <div className="flex items-center gap-2 py-0.5">
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
          {format_timestamp(entry.timestamp)}
        </span>
        <div className="shrink-0">
          <RawEntryInspector entry={entry} />
        </div>
      </div>

      {/* Thinking blocks */}
      {thinking_blocks.map((block, i) => (
        <ThinkingBlock key={i} text={"thinking" in block ? (block.thinking as string) : ""} />
      ))}

      {/* Text blocks — the actual assistant prose */}
      {has_text && (
        <div className="px-3">
          {text_blocks.map((block, i) => (
            <MarkdownContent key={i} content={"text" in block ? (block.text as string) : ""} />
          ))}
        </div>
      )}

      {/* Tool calls */}
      {resolved_tools.length > 0 && (
        <div className={has_text ? "mt-1" : ""}>
          {resolved_tools.map((tool) => (
            <ToolCallRenderer key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* Error / abort states */}
      {is_aborted && (
        <div className="flex items-center gap-1.5 text-xs text-warning mt-1">
          <XCircle className="size-3.5" />
          Aborted
        </div>
      )}
      {is_error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
          <AlertCircle className="size-3.5" />
          Error: {msg.errorMessage ?? "Unknown error"}
        </div>
      )}
    </div>
  );
}
