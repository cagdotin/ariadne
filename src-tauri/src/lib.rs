mod models;
mod parser;
mod commands;
mod cache;

use commands::analytics::{get_analytics_overview, get_project_sessions, get_session_detail, get_all_sessions, resync_sessions, get_tool_details, get_project_file_stats, get_time_breakdown};
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
            get_time_breakdown
        ])
        .setup(|app| {
            // Enable macOS two-finger swipe back/forward navigation
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        use objc2::msg_send;
                        use objc2::runtime::AnyObject;
                        unsafe {
                            let wk: *mut AnyObject = webview.inner().cast();
                            let _: () = msg_send![wk, setAllowsBackForwardNavigationGestures: true];
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
