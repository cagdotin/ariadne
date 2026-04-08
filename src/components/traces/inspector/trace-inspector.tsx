import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TraceSpan } from "../types";
import type {
  MessageEntry,
  AssistantMessageData,
  ToolCallContent,
  TextContent,
  ThinkingContent,
} from "@/components/session-viewer/types";

interface TraceInspectorProps {
  span: TraceSpan | null;
}

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

function extract_content_preview(span: TraceSpan): React.ReactNode {
  if (span.entry.type !== "message") {
    return extract_non_message_preview(span);
  }

  const msg_entry = span.entry as MessageEntry;
  const message = msg_entry.message;

  if (message.role === "user") {
    const content = typeof message.content === "string"
      ? message.content
      : (message.content as { type: string; text?: string }[])
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n") ?? "";
    return <TextPreview text={content} />;
  }

  if (message.role === "assistant") {
    const assistant = message as AssistantMessageData;
    if (span.content_index !== undefined && assistant.content) {
      const block = assistant.content[span.content_index];
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
          <div className="space-y-1">
            <Badge variant="secondary" className="text-[10px] font-mono">{tc.name}</Badge>
            <JsonPreview data={tc.arguments} />
          </div>
        );
      }
    }
    return null;
  }

  if (message.role === "toolResult") {
    const content = (message as { content?: { type: string; text?: string }[] }).content;
    const text = content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") ?? "";
    return <TextPreview text={text} max_lines={20} />;
  }

  if (message.role === "bashExecution") {
    const bash = message as { command?: string; output?: string; exitCode?: number };
    return (
      <div className="space-y-1.5">
        <pre className="font-mono text-[10px] bg-muted/50 p-2 rounded-md overflow-x-auto">
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

function extract_non_message_preview(span: TraceSpan): React.ReactNode {
  const entry = span.entry;

  if (entry.type === "model_change") {
    const e = entry as { provider?: string; modelId?: string };
    return (
      <div className="space-y-0.5">
        <FieldRow label="Provider" value={e.provider ?? "\u2014"} />
        <FieldRow label="Model" value={e.modelId ?? "\u2014"} />
      </div>
    );
  }

  if (entry.type === "compaction") {
    const e = entry as { summary?: string; tokensBefore?: number };
    return (
      <div className="space-y-1.5">
        {e.tokensBefore && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            {e.tokensBefore.toLocaleString()} tokens before
          </Badge>
        )}
        {e.summary && <TextPreview text={e.summary} max_lines={10} />}
      </div>
    );
  }

  return null;
}

function TextPreview({ text, max_lines = 8 }: { text: string; max_lines?: number }) {
  const lines = text.split("\n");
  const truncated = lines.length > max_lines;
  const display = truncated ? lines.slice(0, max_lines).join("\n") + "\n\u2026" : text;

  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-md max-h-48 overflow-y-auto leading-relaxed">
      {display}
    </pre>
  );
}

function JsonPreview({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-md max-h-48 overflow-y-auto leading-relaxed">
      {text}
    </pre>
  );
}

export function TraceInspector({ span }: TraceInspectorProps) {
  const [show_raw, set_show_raw] = useState(false);

  // Reset raw JSON panel when a different span is selected
  useEffect(() => {
    set_show_raw(false);
  }, [span?.id]);

  if (!span) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground px-6 text-center">
        <span className="text-xs">Select a span to inspect</span>
      </div>
    );
  }

  const duration_ms = span.end_ms - span.start_ms;
  const content_preview = extract_content_preview(span);

  // Token usage from assistant messages
  let usage_node: React.ReactNode = null;
  if (span.entry.type === "message") {
    const msg = (span.entry as MessageEntry).message;
    if (msg.role === "assistant") {
      const assistant = msg as AssistantMessageData;
      if (assistant.usage) {
        const u = assistant.usage;
        usage_node = (
          <>
            <Separator />
            <SectionLabel>Usage</SectionLabel>
            <div className="space-y-0.5">
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
      <SectionLabel>Inspector</SectionLabel>
      <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px] font-mono">{span.lane}</Badge>
        <Badge
          variant="secondary"
          className="text-[10px]"
          style={{ backgroundColor: span.color, color: "oklch(0.98 0 0)" }}
        >
          {span.label}
        </Badge>
        {span.is_error && (
          <Badge variant="destructive" className="text-[10px]">
            <AlertCircle className="size-2.5" />
            error
          </Badge>
        )}
      </div>

      <Separator />

      <div className="space-y-0.5 py-2">
        <FieldRow label="Time" value={format_timestamp(span.entry.timestamp)} />
        <FieldRow label="Offset" value={format_offset(span.start_ms)} />
        <FieldRow label="Duration" value={`${Math.round(duration_ms)}ms`} />
        <FieldRow label="Entry ID" value={span.entry_id.slice(0, 8)} />
      </div>

      {content_preview && (
        <>
          <Separator />
          <SectionLabel>Content</SectionLabel>
          <div className="px-3 pb-2">{content_preview}</div>
        </>
      )}

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
          <pre className="text-[9px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-md max-h-80 overflow-y-auto leading-relaxed">
            {JSON.stringify(span.entry, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
