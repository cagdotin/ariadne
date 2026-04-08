import { z } from "zod";

export const SourceConfidenceSchema = z.enum(["high", "medium", "low"]);
export type SourceConfidence = z.infer<typeof SourceConfidenceSchema>;

export const SnapshotStatusSchema = z.enum(["fresh", "stale", "partial", "error"]);
export type SnapshotStatus = z.infer<typeof SnapshotStatusSchema>;

export const ProviderLimitWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  used_percent: z.number().nullable(),
  remaining_percent: z.number().nullable(),
  window_minutes: z.number().nullable(),
  resets_at: z.string().nullable(),
});
export type ProviderLimitWindow = z.infer<typeof ProviderLimitWindowSchema>;

export const ProviderCreditsSchema = z.object({
  has_credits: z.boolean(),
  unlimited: z.boolean(),
  balance: z.string().nullable(),
});
export type ProviderCredits = z.infer<typeof ProviderCreditsSchema>;

export const ProviderLimitSnapshotSchema = z.object({
  provider_id: z.string(),
  provider_label: z.string(),
  account_label: z.string().nullable(),
  plan_type: z.string().nullable(),
  source: z.string(),
  source_confidence: SourceConfidenceSchema,
  status: SnapshotStatusSchema,
  fetched_at: z.string(),
  stale_after_seconds: z.number(),
  windows: z.array(ProviderLimitWindowSchema),
  credits: ProviderCreditsSchema.nullable(),
  error_message: z.string().nullable(),
});
export type ProviderLimitSnapshot = z.infer<typeof ProviderLimitSnapshotSchema>;

export const ProviderLimitsResponseSchema = z.object({
  providers: z.array(ProviderLimitSnapshotSchema),
});
export type ProviderLimitsResponse = z.infer<typeof ProviderLimitsResponseSchema>;
