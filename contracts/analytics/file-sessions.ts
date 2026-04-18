import { z } from "zod";

export const file_ops_in_session_schema = z.object({
	path: z.string(),
	read_count: z.number(),
	edit_count: z.number(),
	write_count: z.number(),
	total_count: z.number(),
});
export type FileOpsInSession = z.infer<typeof file_ops_in_session_schema>;

export const file_session_detail_schema = z.object({
	session_id: z.string(),
	started_at: z.string(),
	prompt_preview: z.string(),
	total_cost: z.number(),
	duration_seconds: z.number().nullable(),
	model_id: z.string().nullable(),
	file_ops: z.array(file_ops_in_session_schema),
	total_file_ops: z.number(),
});
export type FileSessionDetail = z.infer<typeof file_session_detail_schema>;

export const file_sessions_response_schema = z.object({
	project_path: z.string(),
	queried_paths: z.array(z.string()),
	sessions: z.array(file_session_detail_schema),
});
export type FileSessionsResponse = z.infer<typeof file_sessions_response_schema>;
