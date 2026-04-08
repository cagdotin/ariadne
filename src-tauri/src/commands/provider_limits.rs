use tauri::State;
use crate::models::provider_limits::ProviderLimitsResponse;
use crate::provider_limits::cache::ProviderLimitsCache;

/// Return cached provider limits, fetching on first call.
#[tauri::command]
pub async fn get_provider_limits(
    cache: State<'_, ProviderLimitsCache>,
) -> Result<ProviderLimitsResponse, String> {
    Ok(cache.get().await)
}

/// Force-refresh all provider limits and return fresh data.
#[tauri::command]
pub async fn refresh_provider_limits(
    cache: State<'_, ProviderLimitsCache>,
) -> Result<ProviderLimitsResponse, String> {
    Ok(cache.refresh().await)
}
