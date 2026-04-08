use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};

use crate::models::provider_limits::{ProviderLimitSnapshot, ProviderLimitsResponse, SnapshotStatus};
use crate::provider_limits::codex;

/// Stale threshold: snapshots older than this are marked stale (15 minutes).
const STALE_THRESHOLD_SECONDS: i64 = 900;

#[derive(Debug)]
pub struct ProviderLimitsCache {
    data: Arc<RwLock<Option<Vec<ProviderLimitSnapshot>>>>,
    last_fetched: Arc<RwLock<Option<DateTime<Utc>>>>,
    refreshing: Arc<RwLock<bool>>,
}

impl ProviderLimitsCache {
    pub fn new() -> Self {
        Self {
            data: Arc::new(RwLock::new(None)),
            last_fetched: Arc::new(RwLock::new(None)),
            refreshing: Arc::new(RwLock::new(false)),
        }
    }

    /// Get cached provider limits. Returns cached data if available,
    /// triggering a background refresh if data is stale or missing.
    pub async fn get(&self) -> ProviderLimitsResponse {
        let data_guard = self.data.read().await;

        if let Some(ref snapshots) = *data_guard {
            // Check staleness and update status accordingly
            let now = Utc::now();
            let providers: Vec<ProviderLimitSnapshot> = snapshots
                .iter()
                .map(|s| maybe_mark_stale(s, &now))
                .collect();

            return ProviderLimitsResponse { providers };
        }

        drop(data_guard);

        // No cached data — do a synchronous fetch.
        self.refresh().await
    }

    /// Force a fresh fetch from all provider adapters, update the cache,
    /// and return the new data.
    pub async fn refresh(&self) -> ProviderLimitsResponse {
        // Guard against concurrent refreshes.
        {
            let mut refreshing = self.refreshing.write().await;
            if *refreshing {
                // Another refresh is in progress. Return current cached data or empty.
                drop(refreshing);
                let data_guard = self.data.read().await;
                let providers = data_guard.clone().unwrap_or_default();
                return ProviderLimitsResponse { providers };
            }
            *refreshing = true;
        }

        let result = self.do_refresh().await;

        // Clear refreshing flag
        {
            let mut refreshing = self.refreshing.write().await;
            *refreshing = false;
        }

        result
    }

    async fn do_refresh(&self) -> ProviderLimitsResponse {
        let mut providers: Vec<ProviderLimitSnapshot> = Vec::new();

        // Phase 1: Codex
        let codex_snapshot = codex::fetch_codex_limits().await;
        providers.push(codex_snapshot);

        // Phase 2: Claude (future)
        // let claude_snapshot = claude::fetch_claude_limits().await;
        // providers.push(claude_snapshot);

        // Update cache
        {
            let mut data_guard = self.data.write().await;
            *data_guard = Some(providers.clone());
        }
        {
            let mut time_guard = self.last_fetched.write().await;
            *time_guard = Some(Utc::now());
        }

        ProviderLimitsResponse { providers }
    }
}

/// If the snapshot's fetched_at is older than the stale threshold,
/// update its status to Stale (unless it's already an error).
fn maybe_mark_stale(snapshot: &ProviderLimitSnapshot, now: &DateTime<Utc>) -> ProviderLimitSnapshot {
    let mut s = snapshot.clone();

    // Don't overwrite error status
    if matches!(s.status, SnapshotStatus::Error) {
        return s;
    }

    if let Ok(fetched) = DateTime::parse_from_rfc3339(&s.fetched_at) {
        let age = now
            .signed_duration_since(fetched.with_timezone(&Utc))
            .num_seconds();
        if age > STALE_THRESHOLD_SECONDS {
            s.status = SnapshotStatus::Stale;
        }
    }

    s
}
