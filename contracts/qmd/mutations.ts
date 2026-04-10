import { z } from "zod";

export const qmd_command_result_schema = z.object({
	success: z.boolean(),
	output: z.string(),
});
export type QmdCommandResult = z.infer<typeof qmd_command_result_schema>;

export const qmd_toggle_files_result_schema = z.object({
	indexed: z.number(),
	deactivated: z.number(),
});
export type QmdToggleFilesResult = z.infer<
	typeof qmd_toggle_files_result_schema
>;
