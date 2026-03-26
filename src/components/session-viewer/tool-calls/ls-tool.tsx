import type { ToolHandler } from "./tool-types";
import { ExpandableOutput } from "../primitives/expandable-output";
import { shorten_path } from "../utils";
import { List } from "lucide-react";

export const ls_tool: ToolHandler = {
  get_summary(tool) {
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
  },

  get_body(_tool, output) {
    if (!output) return null;
    return <ExpandableOutput text={output} max_lines={8} />;
  },
};
