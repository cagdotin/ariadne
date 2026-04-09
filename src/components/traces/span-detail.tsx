import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { SpanNode } from "./types";
import type {
  MessageEntry,
  AssistantMessageData,
  ToolCallContent,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  ContentBlock,
} from "@/components/session-viewer/types";

interface SpanDetailProps {
  node: SpanNode;
  session_start_iso: string;
  on_close: () => void;
}

// ─── Shared primitives (same as v1 inspector) ──────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pt-3 pb-1">
      {children}
    </h3>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-0.5 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-mono text-foreground break-all">{value}</span>
    </div>
  );
}

function TextPreview({ text, max_lines = 8 }: { text: string; max_lines?: number }) {
  const lines = text.split("\n");
  const truncated = lines.length > max_lines;
  const display = truncated ? lines.slice(0, max_lines).join("\n") + "\n\u2026" : text;

  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-none max-h-48 overflow-y-auto leading-relaxed">
      {display}
    </pre>
  );
}

function JsonPreview({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-none max-h-48 overflow-y-auto leading-relaxed">
      {text}
    </pre>
  );
}

// ─── Timestamp / offset formatting ─────────────────────────────────────────

function format_timestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function format_offset(ms: number): string {
  if (ms < 1000) return `+${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `+${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.floor(seconds % 60);
  return `+${minutes}:${String(rem).padStart(2, "0")}`;
}

// ─── Content extraction ─────────────────────────────────────────────────────

function extract_content_preview(node: SpanNode): React.ReactNode {
  if (node.entry.type !== "message") {
    return extract_non_message_preview(node);
  }

  const msg_entry = node.entry as MessageEntry;
  const message = msg_entry.message;

  if (message.role === "user") {
    const content = typeof message.content === "string"
      ? message.content
      : (message.content as ContentBlock[])
          ?.filter((b) => b.type === "text")
          .map((b) => (b as TextContent).text)
          .join("\n") ?? "";
    return <TextPreview text={content} />;
  }

  if (message.role === "assistant") {
    const assistant = message as AssistantMessageData;
    if (node.content_index !== undefined && assistant.content) {
      const block = assistant.content[node.content_index];
      if (!block) return null;

      if (block.type === "text") {
        return <TextPreview text={(block as TextContent).text} />;
      }
      if (block.type === "thinking") {
        return <TextPreview text={(block as ThinkingContent).thinking} />;
      }
      if (block.type === "toolCall") {
        const tc = block as ToolCallContent;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="secondary" className="text-[10px] font-mono">{tc.name}</Badge>
            <JsonPreview data={tc.arguments} />
          </div>
        );
      }
    }

    // Assistant-level node — show first text block if any
    if (assistant.content && Array.isArray(assistant.content)) {
      const text_block = assistant.content.find((b: ContentBlock) => b.type === "text") as TextContent | undefined;
      if (text_block) return <TextPreview text={text_block.text} />;
    }

    return null;
  }

  if (message.role === "toolResult") {
    const content = (message as ToolResultMessage).content;
    const text = content
      ?.filter((b: ContentBlock) => b.type === "text")
      .map((b) => (b as TextContent).text)
      .join("\n") ?? "";
    return <TextPreview text={text} max_lines={20} />;
  }

  if (message.role === "bashExecution") {
    const bash = message as { command?: string; output?: string; exitCode?: number };
    return (
      <div className="flex flex-col gap-1.5">
        <pre className="font-mono text-[10px] bg-muted/50 p-2 rounded-none overflow-x-auto">
          $ {bash.command}
        </pre>
        {bash.output && <TextPreview text={bash.output} max_lines={15} />}
        {bash.exitCode !== undefined && bash.exitCode !== 0 && (
          <Badge variant="destructive" className="text-[10px]">
            <AlertCircle className="size-2.5" />
            exit code: {bash.exitCode}
          </Badge>
        )}
      </div>
    );
  }

  return null;
}

function extract_non_message_preview(node: SpanNode): React.ReactNode {
  const entry = node.entry;

  if (entry.type === "model_change") {
    const e = entry as { provider?: string; modelId?: string };
    return (
      <div className="flex flex-col gap-0.5">
        <FieldRow label="Provider" value={e.provider ?? "\u2014"} />
        <FieldRow label="Model" value={e.modelId ?? "\u2014"} />
      </div>
    );
  }

  if (entry.type === "compaction") {
    const e = entry as { summary?: string; tokensBefore?: number };
    return (
      <div className="flex flex-col gap-1.5">
        {e.tokensBefore && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            {e.tokensBefore.toLocaleString()} tokens before
          </Badge>
        )}
        {e.summary && <TextPreview text={e.summary} max_lines={10} />}
      </div>
    );
  }

  if (entry.type === "thinking_level_change") {
    const e = entry as { thinkingLevel?: string };
    return <FieldRow label="Level" value={e.thinkingLevel ?? "\u2014"} />;
  }

  return null;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function SpanDetail({ node, on_close }: SpanDetailProps) {
  const [show_raw, set_show_raw] = useState(false);

  // Reset raw JSON panel when a different node is selected
  useEffect(() => {
    set_show_raw(false);
  }, [node.id]);

  const content_preview = extract_content_preview(node);

  // Token usage from assistant messages
  let usage_node: React.ReactNode = null;
  if (node.entry.type === "message") {
    const msg = (node.entry as MessageEntry).message;
    if (msg.role === "assistant") {
      const assistant = msg as AssistantMessageData;
      if (assistant.usage) {
        const u = assistant.usage;
        usage_node = (
          <>
            <Separator />
            <SectionLabel>Usage</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {u.input !== undefined && <FieldRow label="Input" value={u.input.toLocaleString()} />}
              {u.output !== undefined && <FieldRow label="Output" value={u.output.toLocaleString()} />}
              {u.cacheRead !== undefined && <FieldRow label="Cache read" value={u.cacheRead.toLocaleString()} />}
              {u.cost?.total !== undefined && <FieldRow label="Cost" value={`$${u.cost.total.toFixed(4)}`} />}
            </div>
          </>
        );
      }
    }
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="flex items-center px-3 pt-3 pb-1">
        <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Inspector
        </h3>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="size-5 p-0" onClick={on_close}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px] font-mono">{node.kind}</Badge>
        <Badge
          variant="secondary"
          className="text-[10px]"
          style={{ backgroundColor: node.color, color: "oklch(0.98 0 0)" }}
        >
          {node.label}
        </Badge>
        {node.is_error && (
          <Badge variant="destructive" className="text-[10px]">
            <AlertCircle className="size-2.5" />
            error
          </Badge>
        )}
      </div>

      <Separator />

      <div className="space-y-0.5 py-2">
        <FieldRow label="Time" value={format_timestamp(node.entry.timestamp)} />
        <FieldRow label="Offset" value={format_offset(node.start_ms)} />
        <FieldRow label="Duration" value={`${Math.round(node.duration_ms)}ms`} />
        <FieldRow label="Entry ID" value={node.entry.id.slice(0, 8)} />
        {node.children.length > 0 && (
          <FieldRow label="Children" value={node.children.length} />
        )}
      </div>

      {content_preview && (
        <>
          <Separator />
          <SectionLabel>Content</SectionLabel>
          <div className="px-3 pb-2">{content_preview}</div>
        </>
      )}

      {/* Tool result section for merged tool call spans */}
      {node.result_entry && (() => {
        const result_msg = (node.result_entry as MessageEntry).message as {
          role: string;
          isError?: boolean;
          content?: ContentBlock[];
        };
        const result_text = result_msg.content
          ?.filter((b) => b.type === "text")
          .map((b) => (b as TextContent).text)
          .join("\n") ?? "";
        return (
          <>
            <Separator />
            <SectionLabel>Result</SectionLabel>
            {result_msg.isError && (
              <div className="px-3 pb-1">
                <Badge variant="destructive" className="text-[10px]">
                  <AlertCircle className="size-2.5" />
                  error
                </Badge>
              </div>
            )}
            {result_text && (
              <div className="px-3 pb-2">
                <TextPreview text={result_text} max_lines={20} />
              </div>
            )}
          </>
        );
      })()}

      {usage_node}

      <Separator />

      {/* Raw JSON toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1 h-7 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold rounded-none"
        onClick={() => set_show_raw((v) => !v)}
      >
        {show_raw ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Raw JSON
      </Button>
      {show_raw && (
        <div className="px-3 pb-3">
          <pre className="text-[9px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-none max-h-80 overflow-y-auto leading-relaxed">
            {JSON.stringify(node.entry, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
