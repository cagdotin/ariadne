mod models;
mod parser;
mod commands;

use commands::analytics::{get_analytics_overview, get_project_sessions, get_session_detail};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_analytics_overview,
            get_project_sessions,
            get_session_detail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
