import { z } from "zod";
import { day_count_schema, name_count_schema } from "../shared/primitives";

export const project_tool_summary_schema = z.object({
	project_path: z.string(),
	project_name: z.string(),
	total_calls: z.number(),
	items: z.array(name_count_schema),
});
export type ProjectToolSummary = z.infer<typeof project_tool_summary_schema>;

export const tool_detail_response_schema = z.object({
	tool_name: z.string(),
	total_calls: z.number(),
	total_errors: z.number(),
	items: z.array(name_count_schema),
	by_project: z.array(project_tool_summary_schema),
	by_date: z.array(day_count_schema),
});
export type ToolDetailResponse = z.infer<typeof tool_detail_response_schema>;
