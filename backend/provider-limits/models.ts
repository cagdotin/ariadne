// ---- Provider limits domain types (faithful port of Rust models) -------------

export type SourceConfidence = "high" | "medium" | "low";
export type SnapshotStatus = "fresh" | "stale" | "error";

export interface ProviderLimitWindow {
  id: string;
  label: string;
  used_percent: number | null;
  remaining_percent: number | null;
  window_minutes: number | null;
  resets_at: string | null;
}

export interface ProviderCredits {
  has_credits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface ProviderLimitSnapshot {
  provider_id: string;
  provider_label: string;
  account_label: string | null;
  plan_type: string | null;
  source: string;
  source_confidence: SourceConfidence;
  status: SnapshotStatus;
  fetched_at: string;
  stale_after_seconds: number;
  windows: ProviderLimitWindow[];
  credits: ProviderCredits | null;
  error_message: string | null;
}

export type ProviderLimitsResponse = ProviderLimitSnapshot[];
