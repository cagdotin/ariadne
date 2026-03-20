mod models;
mod parser;
mod commands;
mod cache;

use commands::analytics::{get_analytics_overview, get_project_sessions, get_session_detail, get_all_sessions, resync_sessions, get_tool_details, get_project_file_stats, get_time_breakdown};
use commands::qmd::{qmd_check_availability, qmd_get_status, qmd_list_collections, qmd_get_collection_detail, qmd_get_collection_documents, qmd_add_collection, qmd_remove_collection, qmd_rename_collection, qmd_add_context, qmd_remove_context, qmd_set_global_context, qmd_reindex, qmd_embed, qmd_cleanup};
use cache::SessionCache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SessionCache::new())
        .invoke_handler(tauri::generate_handler![
            get_analytics_overview,
            get_project_sessions,
            get_session_detail,
            get_all_sessions,
            resync_sessions,
            get_tool_details,
            get_project_file_stats,
            get_time_breakdown,
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
            qmd_cleanup
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
