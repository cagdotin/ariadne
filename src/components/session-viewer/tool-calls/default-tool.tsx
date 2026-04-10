import { AlertTriangle, Wrench } from "lucide-react";
import { ExpandableOutput } from "../primitives/expandable-output";
import type { ToolHandler } from "./tool-types";

export const default_tool: ToolHandler = {
	get_summary(tool) {
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
	},

	get_body(tool, output) {
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
	},
};
