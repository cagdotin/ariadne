use tauri::State;

use crate::models::analytics::{AnalyticsOverview, ToolDetailResponse, ProjectFileStats, TimeBreakdown};
use crate::models::session::SessionSummary;
use crate::cache::SessionCache;

#[tauri::command]
pub async fn get_analytics_overview(cache: State<'_, SessionCache>) -> Result<AnalyticsOverview, String> {
    cache.get_analytics_overview().await
}

#[tauri::command]
pub async fn get_project_sessions(cache: State<'_, SessionCache>, project_name: String) -> Result<Vec<SessionSummary>, String> {
    cache.get_project_sessions(&project_name).await
}

#[tauri::command]
pub async fn get_session_detail(cache: State<'_, SessionCache>, session_id: String) -> Result<SessionSummary, String> {
    cache.get_session_detail(&session_id).await
}

#[tauri::command]
pub async fn get_all_sessions(
    cache: State<'_, SessionCache>,
    project_name: Option<String>,
) -> Result<Vec<SessionSummary>, String> {
    cache.get_all_sessions(project_name.as_deref()).await
}

#[tauri::command]
pub async fn resync_sessions(cache: State<'_, SessionCache>) -> Result<AnalyticsOverview, String> {
    // Force resync the cache
    cache.resync().await?;
    // Return fresh analytics overview
    cache.get_analytics_overview().await
}

#[tauri::command]
pub async fn get_project_file_stats(
    cache: State<'_, SessionCache>,
    project_name: String,
) -> Result<ProjectFileStats, String> {
    cache.get_project_file_stats(&project_name).await
}

#[tauri::command]
pub async fn get_time_breakdown(cache: State<'_, SessionCache>, range_days: u32) -> Result<TimeBreakdown, String> {
    cache.get_time_breakdown(range_days).await
}

#[tauri::command]
pub async fn get_tool_details(
    cache: State<'_, SessionCache>,
    tool_name: String,
    project_name: Option<String>,
) -> Result<ToolDetailResponse, String> {
    cache.get_tool_details(&tool_name, project_name.as_deref()).await
}