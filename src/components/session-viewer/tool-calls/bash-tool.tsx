import type { ToolHandler } from "./tool-types";
import { ExpandableOutput } from "../primitives/expandable-output";
import { Terminal } from "lucide-react";

export const bash_tool: ToolHandler = {
  get_summary(tool) {
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
  },

  get_body(tool, output) {
    const command = String(tool.arguments.command ?? "");
    const is_long = command.length > 80;
    if (!output && !is_long) return null;
    return (
      <>
        {is_long && (
          <pre className="rounded-none bg-input p-2 px-3 text-xs font-mono text-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
            <span className="text-muted-foreground select-none">$ </span>
            {command}
          </pre>
        )}
        {output && <ExpandableOutput text={output} max_lines={5} />}
      </>
    );
  },
};
