import { FileText } from "lucide-react";
import { ExpandableOutput } from "../primitives/expandable-output";
import { get_language_from_path, shorten_path } from "../utils";
import type { ToolHandler } from "./tool-types";

export const read_tool: ToolHandler = {
	get_summary(tool) {
		const path = shorten_path(
			String(tool.arguments.path ?? tool.arguments.file_path ?? ""),
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
	},

	get_body(tool, output) {
		const file_path = String(
			tool.arguments.path ?? tool.arguments.file_path ?? "",
		);
		const language = file_path ? get_language_from_path(file_path) : undefined;
		const images = tool.result?.content.filter((c) => c.type === "image") ?? [];
		if (!output && images.length === 0) return null;
		return (
			<>
				{images.length > 0 && (
					<div className="flex flex-wrap gap-2 mb-2">
						{images.map((img, i) =>
							"data" in img && "mimeType" in img ? (
								<img
									// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
									key={i}
									src={`data:${(img as { mimeType: string; data: string }).mimeType};base64,${(img as { data: string }).data}`}
									alt="file content"
									className="max-w-full max-h-80 rounded border border-border"
								/>
							) : null,
						)}
					</div>
				)}
				{output && (
					<ExpandableOutput text={output} max_lines={10} language={language} />
				)}
			</>
		);
	},
};
