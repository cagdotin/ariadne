import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("prose-session", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ className: code_class, children, ...props }) {
            const match = /language-(\w+)/.exec(code_class || "");
            const is_inline = !match && !String(children).includes("\n");

            if (is_inline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match?.[1] ?? "text"}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: "0.75rem",
                  borderRadius: "var(--radius)",
                  fontSize: "0.8rem",
                  background: "var(--input)",
                }}
                codeTagProps={{
                  style: { fontFamily: "var(--font-mono)" },
                }}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-chart-1 underline decoration-chart-1/30 hover:decoration-chart-1/70"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border px-2 py-1 text-left font-semibold bg-muted/50 text-xs">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-2 py-1 text-xs">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
