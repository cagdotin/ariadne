import { z } from "zod";

export const source_confidence_schema = z.enum(["high", "medium", "low"]);
export type SourceConfidence = z.infer<typeof source_confidence_schema>;

export const snapshot_status_schema = z.enum([
	"fresh",
	"stale",
	"partial",
	"error",
]);
export type SnapshotStatus = z.infer<typeof snapshot_status_schema>;

export const provider_limit_window_schema = z.object({
	id: z.string(),
	label: z.string(),
	used_percent: z.number().nullable(),
	remaining_percent: z.number().nullable(),
	window_minutes: z.number().nullable(),
	resets_at: z.string().nullable(),
});
export type ProviderLimitWindow = z.infer<typeof provider_limit_window_schema>;

export const provider_credits_schema = z.object({
	has_credits: z.boolean(),
	unlimited: z.boolean(),
	balance: z.string().nullable(),
});
export type ProviderCredits = z.infer<typeof provider_credits_schema>;

export const provider_limit_snapshot_schema = z.object({
	provider_id: z.string(),
	provider_label: z.string(),
	account_label: z.string().nullable(),
	plan_type: z.string().nullable(),
	source: z.string(),
	source_confidence: source_confidence_schema,
	status: snapshot_status_schema,
	fetched_at: z.string(),
	stale_after_seconds: z.number(),
	windows: z.array(provider_limit_window_schema),
	credits: provider_credits_schema.nullable(),
	error_message: z.string().nullable(),
});
export type ProviderLimitSnapshot = z.infer<
	typeof provider_limit_snapshot_schema
>;

export const provider_limits_response_schema = z.object({
	providers: z.array(provider_limit_snapshot_schema),
});
export type ProviderLimitsResponse = z.infer<
	typeof provider_limits_response_schema
>;
