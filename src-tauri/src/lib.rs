mod models;
mod parser;
mod commands;
mod cache;
mod sidecar;
mod qmd_log_cache;
mod provider_limits;

use commands::analytics::{get_analytics_overview, list_projects, get_session_detail, get_all_sessions, resync_sessions, get_tool_details, get_project_file_stats, get_file_sizes, get_time_breakdown, get_session_entries};
use commands::qmd::{qmd_check_availability, qmd_get_status, qmd_list_collections, qmd_get_collection_detail, qmd_get_collection_documents, qmd_add_collection, qmd_remove_collection, qmd_rename_collection, qmd_add_context, qmd_remove_context, qmd_set_global_context, qmd_reindex, qmd_embed, qmd_cleanup, qmd_scan_filesystem, qmd_get_indexed_paths, qmd_toggle_files, qmd_list_indexes, qmd_create_index, qmd_delete_index, qmd_rename_index, qmd_search};
use commands::qmd_logs::{get_qmd_logs, get_qmd_log_stats};
use commands::provider_limits::{get_provider_limits, refresh_provider_limits};
use cache::SessionCache;
use sidecar::QmdSidecar;
use qmd_log_cache::QmdLogCache;
use provider_limits::cache::ProviderLimitsCache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionCache::new())
        .manage(QmdSidecar::new())
        .manage(QmdLogCache::new())
        .manage(ProviderLimitsCache::new())
        .invoke_handler(tauri::generate_handler![
            get_analytics_overview,
            list_projects,

            get_session_detail,
            get_all_sessions,
            resync_sessions,
            get_tool_details,
            get_project_file_stats,
            get_file_sizes,
            get_time_breakdown,
            get_session_entries,
            qmd_check_availability,
            qmd_get_status,
            qmd_list_collections,
            qmd_get_collection_detail,
            qmd_get_collection_documents,
            qmd_add_collection,
            qmd_remove_collection,
            qmd_rename_collection,
            qmd_add_context,
            qmd_remove_context,
            qmd_set_global_context,
            qmd_reindex,
            qmd_embed,
            qmd_cleanup,
            qmd_scan_filesystem,
            qmd_get_indexed_paths,
            qmd_toggle_files,
            qmd_list_indexes,
            qmd_create_index,
            qmd_delete_index,
            qmd_rename_index,
            qmd_search,
            get_qmd_logs,
            get_qmd_log_stats,
            get_provider_limits,
            refresh_provider_limits
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
