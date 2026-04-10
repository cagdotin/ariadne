import {
	type QmdLogEntry,
	type QmdLogStats,
	qmd_log_entry_schema,
	qmd_log_stats_schema,
} from "@contracts/qmd-logs/entries";
import { z } from "zod";
import { commands } from "@/platform/ipc";

export async function get_qmd_logs(
	project_path?: string,
): Promise<QmdLogEntry[]> {
	const raw = await commands.qmd_logs.get_qmd_logs({
		projectPath: project_path ?? null,
	});
	return z.array(qmd_log_entry_schema).parse(raw);
}

export async function get_qmd_log_stats(
	project_path?: string,
): Promise<QmdLogStats> {
	const raw = await commands.qmd_logs.get_qmd_log_stats({
		projectPath: project_path ?? null,
	});
	return qmd_log_stats_schema.parse(raw);
}
