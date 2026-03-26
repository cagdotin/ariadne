import { useState } from "react";
import type { ResolvedToolCall } from "./types";
import { ExpandableOutput } from "./expandable-output";
import { extract_text, shorten_path, get_language_from_path } from "./utils";
import {
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Terminal,
  FileText,
  FilePlus,
  Pencil,
  Search,
  FolderSearch,
  List,
  Wrench,
  AlertTriangle,
} from "lucide-react";

interface ToolCallRendererProps {
  tool: ResolvedToolCall;
}

export function ToolCallRenderer({ tool }: ToolCallRendererProps) {
  const [expanded, set_expanded] = useState(false);
  const is_error = tool.result?.isError ?? false;
  const { icon, summary } = get_tool_summary(tool);
  const body = get_tool_body(tool);
  const has_body = body !== null;

  return (
    <div className="my-0.5">
      <button
        onClick={has_body ? () => set_expanded(!expanded) : undefined}
        className={`flex items-center gap-1.5 text-[11px] py-0.5 transition-colors w-full text-left ${
          has_body ? "cursor-pointer" : "cursor-default"
        } ${
          is_error
            ? "text-destructive/70 hover:text-destructive"
            : "text-muted-foreground hover:text-foreground"
        }`}
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
      </button>
      {expanded && has_body && (
        <div className="pl-[18px] pt-1 pb-1">{body}</div>
      )}
    </div>
  );
}

// ── Summary generation ────────────────────────────────────────

function get_tool_summary(tool: ResolvedToolCall): {
  icon: React.ReactNode;
  summary: React.ReactNode;
} {
  const name = tool.name.toLowerCase();

  switch (name) {
    case "read": {
      const path = shorten_path(
        String(tool.arguments.path ?? tool.arguments.file_path ?? "")
      );
      const offset = tool.arguments.offset as number | undefined;
      const limit = tool.arguments.limit as number | undefined;
      let range = "";
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? start + limit - 1 : undefined;
        range = `:${start}${end ? `-${end}` : ""}`;
      }
      return {
        icon: <FileText className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">read</span>{" "}
            <span className="text-chart-1">
              {path}
              {range}
            </span>
          </>
        ),
      };
    }

    case "bash": {
      const cmd = String(tool.arguments.command ?? "")
        .replace(/[\n\t]+/g, " ")
        .trim();
      const short = cmd.length > 80 ? cmd.slice(0, 80) + "…" : cmd;
      return {
        icon: <Terminal className="size-3" />,
        summary: (
          <>
            <span className="text-muted-foreground/50 select-none">$ </span>
            {short}
          </>
        ),
      };
    }

    case "write": {
      const path = shorten_path(
        String(tool.arguments.path ?? tool.arguments.file_path ?? "")
      );
      const content =
        typeof tool.arguments.content === "string" ? tool.arguments.content : "";
      const lines = content ? content.split("\n").length : 0;
      return {
        icon: <FilePlus className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">write</span>{" "}
            <span className="text-chart-1">{path}</span>
            {lines > 0 && (
              <span className="text-muted-foreground/50 ml-1">
                ({lines} lines)
              </span>
            )}
          </>
        ),
      };
    }

    case "edit": {
      const path = shorten_path(
        String(tool.arguments.path ?? tool.arguments.file_path ?? "")
      );
      return {
        icon: <Pencil className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">edit</span>{" "}
            <span className="text-chart-1">{path}</span>
          </>
        ),
      };
    }

    case "grep": {
      const pattern = String(tool.arguments.pattern ?? "");
      const path = shorten_path(String(tool.arguments.path ?? "."));
      return {
        icon: <Search className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">grep</span>{" "}
            <span className="text-warning">/{pattern}/</span>{" "}
            <span className="text-muted-foreground/50">in</span>{" "}
            <span className="text-chart-1">{path}</span>
          </>
        ),
      };
    }

    case "find": {
      const pattern = String(tool.arguments.pattern ?? "");
      const path = shorten_path(String(tool.arguments.path ?? "."));
      return {
        icon: <FolderSearch className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">find</span>{" "}
            <span className="text-warning">{pattern}</span>{" "}
            <span className="text-muted-foreground/50">in</span>{" "}
            <span className="text-chart-1">{path}</span>
          </>
        ),
      };
    }

    case "ls": {
      const path = shorten_path(String(tool.arguments.path ?? "."));
      return {
        icon: <List className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">ls</span>{" "}
            <span className="text-chart-1">{path}</span>
          </>
        ),
      };
    }

    default: {
      return {
        icon: <Wrench className="size-3" />,
        summary: (
          <>
            <span className="font-semibold">{tool.name}</span>{" "}
            <span className="inline-flex items-center gap-0.5 text-warning">
              <AlertTriangle className="size-2.5" />
              custom
            </span>
          </>
        ),
      };
    }
  }
}

// ── Body rendering ────────────────────────────────────────────

function get_tool_body(tool: ResolvedToolCall): React.ReactNode | null {
  const name = tool.name.toLowerCase();
  const output = tool.result ? extract_text(tool.result.content).trim() : "";

  switch (name) {
    case "read": {
      const file_path = String(
        tool.arguments.path ?? tool.arguments.file_path ?? ""
      );
      const language = file_path
        ? get_language_from_path(file_path)
        : undefined;
      const images =
        tool.result?.content.filter((c) => c.type === "image") ?? [];
      if (!output && images.length === 0) return null;
      return (
        <>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map((img, i) =>
                "data" in img && "mimeType" in img ? (
                  <img
                    key={i}
                    src={`data:${(img as { mimeType: string; data: string }).mimeType};base64,${(img as { data: string }).data}`}
                    alt="file content"
                    className="max-w-full max-h-80 rounded border border-border"
                  />
                ) : null
              )}
            </div>
          )}
          {output && (
            <ExpandableOutput
              text={output}
              max_lines={10}
              language={language}
            />
          )}
        </>
      );
    }

    case "bash": {
      const command = String(tool.arguments.command ?? "");
      const is_long = command.length > 80;
      if (!output && !is_long) return null;
      return (
        <>
          {is_long && (
            <pre className="rounded-[var(--radius)] bg-input p-2 px-3 text-xs font-mono text-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              <span className="text-muted-foreground select-none">$ </span>
              {command}
            </pre>
          )}
          {output && <ExpandableOutput text={output} max_lines={5} />}
        </>
      );
    }

    case "write": {
      const file_path = String(
        tool.arguments.path ?? tool.arguments.file_path ?? ""
      );
      const content =
        typeof tool.arguments.content === "string" ? tool.arguments.content : "";
      const language = file_path
        ? get_language_from_path(file_path)
        : undefined;
      const result_text = output;
      if (!content && !result_text) return null;
      return (
        <>
          {content && (
            <ExpandableOutput
              text={content}
              max_lines={10}
              language={language}
            />
          )}
          {result_text && (
            <div className="mt-1 text-xs text-muted-foreground font-mono">
              {result_text}
            </div>
          )}
        </>
      );
    }

    case "edit": {
      const diff = tool.result?.details?.diff as string | undefined;
      if (!diff && !output) return null;
      if (diff) {
        return (
          <div className="rounded-[var(--radius)] bg-input p-2 px-3 text-xs font-mono leading-relaxed overflow-x-auto">
            {diff.split("\n").map((line, i) => {
              let cls = "text-muted-foreground";
              if (line.startsWith("+")) cls = "text-success bg-success/10";
              else if (line.startsWith("-"))
                cls = "text-destructive bg-destructive/10";
              return (
                <div key={i} className={cls}>
                  {line || "\u00a0"}
                </div>
              );
            })}
          </div>
        );
      }
      return <ExpandableOutput text={output} max_lines={10} />;
    }

    case "grep":
    case "find":
    case "ls": {
      if (!output) return null;
      return <ExpandableOutput text={output} max_lines={8} />;
    }

    default: {
      const args_json = JSON.stringify(tool.arguments, null, 2);
      return (
        <>
          <ExpandableOutput text={args_json} max_lines={6} language="json" />
          {output && (
            <>
              <div className="text-[10px] text-muted-foreground mt-2 mb-1 font-medium uppercase tracking-wider">
                Result
              </div>
              <ExpandableOutput text={output} max_lines={8} />
            </>
          )}
        </>
      );
    }
  }
}
