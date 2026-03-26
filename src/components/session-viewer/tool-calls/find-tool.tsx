import type { ToolHandler } from "./tool-types";
import { ExpandableOutput } from "../primitives/expandable-output";
import { shorten_path } from "../utils";
import { FolderSearch } from "lucide-react";

export const find_tool: ToolHandler = {
  get_summary(tool) {
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
  },

  get_body(_tool, output) {
    if (!output) return null;
    return <ExpandableOutput text={output} max_lines={8} />;
  },
};
