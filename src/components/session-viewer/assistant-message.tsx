import type {
  MessageEntry,
  AssistantMessageData,
  ToolResultMessage,
  ResolvedToolCall,
} from "./types";
import { MarkdownContent } from "./markdown-content";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallRenderer } from "./tool-call-renderer";
import { RawEntryInspector } from "./raw-entry-inspector";
import { format_timestamp } from "./utils";
import { Bot, AlertCircle, XCircle } from "lucide-react";

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

  return (
    <div className="relative space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center justify-center size-5 rounded-full bg-muted">
          <Bot className="size-3 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">Assistant</span>
        {msg.model && (
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {msg.provider ? `${msg.provider}/` : ""}
            {msg.model}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {format_timestamp(entry.timestamp)}
        </span>
        <div className="ml-auto">
          <RawEntryInspector entry={entry} />
        </div>
      </div>

      {/* Thinking blocks */}
      {thinking_blocks.map((block, i) => (
        <ThinkingBlock key={i} text={"thinking" in block ? (block.thinking as string) : ""} />
      ))}

      {/* Text blocks */}
      {text_blocks.map((block, i) => (
        <MarkdownContent key={i} content={"text" in block ? (block.text as string) : ""} />
      ))}

      {/* Tool calls */}
      {resolved_tools.length > 0 && (
        <div className="space-y-2 mt-2">
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
