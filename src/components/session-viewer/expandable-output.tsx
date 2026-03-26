import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ExpandableOutputProps {
  text: string;
  max_lines?: number;
  language?: string;
  className?: string;
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
      <div className={`mt-2 ${className ?? ""}`}>
        <div
          className={is_truncated ? "cursor-pointer" : ""}
          onClick={is_truncated ? () => set_expanded(!expanded) : undefined}
        >
          <SyntaxHighlighter
            style={oneDark}
            language={language}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius)",
              fontSize: "0.75rem",
              lineHeight: "1.4",
              background: "var(--input)",
            }}
            codeTagProps={{
              style: {
                fontFamily: "var(--font-mono)",
                textShadow: "none",
              },
            }}
          >
            {display_text}
          </SyntaxHighlighter>
          {is_truncated && !expanded && (
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-3" />
              <span>{remaining} more lines</span>
            </button>
          )}
          {is_truncated && expanded && (
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 hover:text-foreground transition-colors"
            >
              <ChevronDown className="size-3" />
              <span>collapse</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Plain text output
  return (
    <div className={`mt-2 ${className ?? ""}`}>
      <div
        className={is_truncated ? "cursor-pointer" : ""}
        onClick={is_truncated ? () => set_expanded(!expanded) : undefined}
      >
        <pre className="rounded-[var(--radius)] bg-input p-2 px-3 text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
          {display_text}
        </pre>
        {is_truncated && !expanded && (
          <button className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 hover:text-foreground transition-colors">
            <ChevronRight className="size-3" />
            <span>{remaining} more lines</span>
          </button>
        )}
        {is_truncated && expanded && (
          <button className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 hover:text-foreground transition-colors">
            <ChevronDown className="size-3" />
            <span>collapse</span>
          </button>
        )}
      </div>
    </div>
  );
}
