import { Pencil } from "lucide-react";
import { ExpandableOutput } from "../primitives/expandable-output";
import { shorten_path } from "../utils";
import type { ToolHandler } from "./tool-types";

export const edit_tool: ToolHandler = {
	get_summary(tool) {
		const path = shorten_path(
			String(tool.arguments.path ?? tool.arguments.file_path ?? ""),
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
	},

	get_body(tool, output) {
		const diff = tool.result?.details?.diff as string | undefined;
		if (!diff && !output) return null;
		if (diff) {
			return (
				<div className="rounded-none bg-input p-2 px-3 text-xs font-mono leading-relaxed overflow-x-auto">
					{diff.split("\n").map((line, i) => {
						let cls = "text-muted-foreground";
						if (line.startsWith("+")) cls = "text-success bg-success/10";
						else if (line.startsWith("-"))
							cls = "text-destructive bg-destructive/10";
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
							<div key={i} className={cls}>
								{line || "\u00a0"}
							</div>
						);
					})}
				</div>
			);
		}
		return <ExpandableOutput text={output} max_lines={10} />;
	},
};
