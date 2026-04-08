use serde::{Deserialize, Serialize};

/// Normalized provider limit snapshot returned to the frontend.
/// One per provider (e.g. "codex", "claude").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderLimitSnapshot {
    pub provider_id: String,
    pub provider_label: String,
    pub account_label: Option<String>,
    pub plan_type: Option<String>,
    pub source: String,
    pub source_confidence: SourceConfidence,
    pub status: SnapshotStatus,
    pub fetched_at: String,
    pub stale_after_seconds: u64,
    pub windows: Vec<ProviderLimitWindow>,
    pub credits: Option<ProviderCredits>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotStatus {
    Fresh,
    Stale,
    Partial,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderLimitWindow {
    pub id: String,
    pub label: String,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub window_minutes: Option<u32>,
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCredits {
    pub has_credits: bool,
    pub unlimited: bool,
    pub balance: Option<String>,
}

/// Top-level response wrapping all provider snapshots.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderLimitsResponse {
    pub providers: Vec<ProviderLimitSnapshot>,
}
