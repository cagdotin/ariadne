import { FilePlus } from "lucide-react";
import { ExpandableOutput } from "../primitives/expandable-output";
import { get_language_from_path, shorten_path } from "../utils";
import type { ToolHandler } from "./tool-types";

export const write_tool: ToolHandler = {
	get_summary(tool) {
		const path = shorten_path(
			String(tool.arguments.path ?? tool.arguments.file_path ?? ""),
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
	},

	get_body(tool, output) {
		const file_path = String(
			tool.arguments.path ?? tool.arguments.file_path ?? "",
		);
		const content =
			typeof tool.arguments.content === "string" ? tool.arguments.content : "";
		const language = file_path ? get_language_from_path(file_path) : undefined;
		if (!content && !output) return null;
		return (
			<>
				{content && (
					<ExpandableOutput text={content} max_lines={10} language={language} />
				)}
				{output && (
					<div className="mt-1 text-xs text-muted-foreground font-mono">
						{output}
					</div>
				)}
			</>
		);
	},
};
