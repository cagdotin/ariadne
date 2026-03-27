use tauri::State;

use crate::models::analytics::{AnalyticsOverview, ToolDetailResponse, ProjectFileStats, TimeBreakdown, ProjectSummary, FileSizeResult};
use crate::models::session::{SessionSummary, SessionEntriesResponse};
use crate::cache::SessionCache;
use crate::qmd_log_cache::QmdLogCache;

#[tauri::command]
pub async fn get_analytics_overview(cache: State<'_, SessionCache>, project_path: Option<String>, range_days: Option<u32>) -> Result<AnalyticsOverview, String> {
    cache.get_analytics_overview(project_path.as_deref(), range_days.unwrap_or(0)).await
}

#[tauri::command]
pub async fn list_projects(cache: State<'_, SessionCache>) -> Result<Vec<ProjectSummary>, String> {
    cache.list_projects().await
}

#[tauri::command]
pub async fn get_session_detail(cache: State<'_, SessionCache>, session_id: String) -> Result<SessionSummary, String> {
    cache.get_session_detail(&session_id).await
}

#[tauri::command]
pub async fn get_all_sessions(
    cache: State<'_, SessionCache>,
    project_path: Option<String>,
    range_days: Option<u32>,
) -> Result<Vec<SessionSummary>, String> {
    cache.get_all_sessions(project_path.as_deref(), range_days.unwrap_or(0)).await
}

#[tauri::command]
pub async fn resync_sessions(
    cache: State<'_, SessionCache>,
    qmd_log_cache: State<'_, QmdLogCache>,
) -> Result<AnalyticsOverview, String> {
    // Force resync the session cache
    cache.resync().await?;
    // Invalidate QMD log cache so it rebuilds lazily on next request
    qmd_log_cache.invalidate().await;
    // Return fresh analytics overview (all time, all projects)
    cache.get_analytics_overview(None, 0).await
}

#[tauri::command]
pub async fn get_project_file_stats(
    cache: State<'_, SessionCache>,
    project_path: String,
    range_days: Option<u32>,
) -> Result<ProjectFileStats, String> {
    cache.get_project_file_stats(&project_path, range_days.unwrap_or(0)).await
}

#[tauri::command]
pub async fn get_time_breakdown(cache: State<'_, SessionCache>, range_days: u32, project_path: Option<String>) -> Result<TimeBreakdown, String> {
    cache.get_time_breakdown(range_days, project_path.as_deref()).await
}

#[tauri::command]
pub async fn get_tool_details(
    cache: State<'_, SessionCache>,
    tool_name: String,
    project_path: Option<String>,
    range_days: Option<u32>,
) -> Result<ToolDetailResponse, String> {
    cache.get_tool_details(&tool_name, project_path.as_deref(), range_days.unwrap_or(0)).await
}

#[tauri::command]
pub async fn get_file_sizes(
    paths: Vec<String>,
) -> Result<Vec<FileSizeResult>, String> {
    Ok(SessionCache::get_file_sizes(paths))
}

#[tauri::command]
pub async fn get_session_entries(
    cache: State<'_, SessionCache>,
    session_id: String,
) -> Result<SessionEntriesResponse, String> {
    cache.get_session_entries(&session_id).await
}
