import { z } from "zod";
import { qmd_expanded_query_schema } from "./search";

// ─── Update progress ────────────────────────────────────────────────────────
// Emitted by the QMD sidecar during reindex operations.
// Wire format uses camelCase — these match what the sidecar actually sends.

export const qmd_update_progress_schema = z.object({
	collection: z.string(),
	file: z.string(),
	current: z.number(),
	total: z.number(),
});
export type QmdUpdateProgress = z.infer<typeof qmd_update_progress_schema>;

// ─── Embed progress ─────────────────────────────────────────────────────────
// Emitted by the QMD sidecar during embed operations.
// Wire format uses camelCase — these match what the sidecar actually sends.
// NOTE: The renderer hook (use-qmd-operation.ts) maps these camelCase fields
// to snake_case for internal consumption. The contract preserves wire format.

export const qmd_embed_progress_schema = z.object({
	chunksEmbedded: z.number(),
	totalChunks: z.number(),
	bytesProcessed: z.number(),
	totalBytes: z.number(),
});
export type QmdEmbedProgress = z.infer<typeof qmd_embed_progress_schema>;

// ─── Search progress ────────────────────────────────────────────────────────
// Emitted by the QMD sidecar during search operations.

export const qmd_search_progress_schema = z.object({
	stage: z.enum(["expanding", "expanded", "searching", "complete"]),
	queries: z.array(qmd_expanded_query_schema).optional(),
	elapsed_ms: z.number().optional(),
});
export type QmdSearchProgress = z.infer<typeof qmd_search_progress_schema>;
