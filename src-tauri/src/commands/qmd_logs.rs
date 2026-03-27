use tauri::State;

use crate::models::qmd_logs::{QmdLogEntry, QmdLogStats};
use crate::qmd_log_cache::QmdLogCache;

#[tauri::command]
pub async fn get_qmd_logs(
    cache: State<'_, QmdLogCache>,
    project_path: Option<String>,
) -> Result<Vec<QmdLogEntry>, String> {
    cache.get_qmd_logs(project_path.as_deref()).await
}

#[tauri::command]
pub async fn get_qmd_log_stats(
    cache: State<'_, QmdLogCache>,
    project_path: Option<String>,
) -> Result<QmdLogStats, String> {
    cache.get_qmd_log_stats(project_path.as_deref()).await
}
