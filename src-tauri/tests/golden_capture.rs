//! Golden output capture test.
//!
//! Runs the current Rust backend against fixture data and writes
//! normalised JSON files to `fixtures/migration/golden/`. Running
//! twice must produce byte-identical output (determinism check).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use ariadne_lib::cache::SessionCache;
use ariadne_lib::commands::qmd::{
    qmd_check_availability, qmd_get_collection_detail, qmd_get_status, qmd_list_collections,
    qmd_list_indexes,
};
use ariadne_lib::provider_limits::codex::fallback_session_logs;
use ariadne_lib::qmd_log_cache::QmdLogCache;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn fixtures_root() -> PathBuf {
    project_root().join("fixtures").join("migration")
}

fn golden_root() -> PathBuf {
    fixtures_root().join("golden")
}

/// Recursively sort all object keys and sort arrays that represent
/// unordered collections (identified by field name).
fn normalize(val: &mut Value) {
    match val {
        Value::Object(map) => {
            // Recurse into children first
            for v in map.values_mut() {
                normalize(v);
            }
            // Rebuild map as sorted BTreeMap (serde_json Map is insertion-ordered)
            let sorted: BTreeMap<String, Value> = map.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            *map = serde_json::Map::from_iter(sorted.into_iter());
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                normalize(v);
            }
        }
        _ => {}
    }
}

/// Sort an array of objects by a given string key.
fn sort_array_by_key(val: &mut Value, key: &str) {
    if let Value::Array(arr) = val {
        arr.sort_by(|a, b| {
            let ka = a.get(key).and_then(|v| v.as_str()).unwrap_or("");
            let kb = b.get(key).and_then(|v| v.as_str()).unwrap_or("");
            ka.cmp(kb)
        });
    }
}


/// Redact db_path fields with a placeholder.
fn redact_db_path(val: &mut Value, fixture_root: &str) {
    match val {
        Value::Object(map) => {
            if let Some(db_path) = map.get_mut("db_path") {
                if let Some(s) = db_path.as_str() {
                    let replaced = s.replace(fixture_root, "<FIXTURE_ROOT>");
                    *db_path = Value::String(replaced);
                }
            }
            for v in map.values_mut() {
                redact_db_path(v, fixture_root);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_db_path(v, fixture_root);
            }
        }
        _ => {}
    }
}

/// Replace db_size_bytes with "__unstable__".
fn redact_db_size_bytes(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if map.contains_key("db_size_bytes") {
                map.insert("db_size_bytes".to_string(), Value::String("__unstable__".to_string()));
            }
            for v in map.values_mut() {
                redact_db_size_bytes(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_db_size_bytes(v);
            }
        }
        _ => {}
    }
}

/// Replace file_size_bytes with "__unstable__".
fn redact_file_size_bytes(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if map.contains_key("file_size_bytes") {
                map.insert("file_size_bytes".to_string(), Value::String("__unstable__".to_string()));
            }
            for v in map.values_mut() {
                redact_file_size_bytes(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_file_size_bytes(v);
            }
        }
        _ => {}
    }
}

/// Replace days_since_update with "__unstable__" (depends on current date).
fn redact_days_since_update(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if map.contains_key("days_since_update") {
                map.insert("days_since_update".to_string(), Value::String("__unstable__".to_string()));
            }
            for v in map.values_mut() {
                redact_days_since_update(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_days_since_update(v);
            }
        }
        _ => {}
    }
}

/// Replace last_modified with "__unstable__" on QMD indexes (filesystem mtime).
fn redact_last_modified_on_indexes(val: &mut Value) {
    if let Value::Array(arr) = val {
        for item in arr.iter_mut() {
            if let Value::Object(map) = item {
                if map.contains_key("last_modified") && map.contains_key("file_stem") {
                    map.insert("last_modified".to_string(), Value::String("__unstable__".to_string()));
                }
            }
        }
    }
}

/// Redact fetched_at timestamp (depends on current time).
fn redact_fetched_at(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if map.contains_key("fetched_at") {
                map.insert("fetched_at".to_string(), Value::String("__unstable__".to_string()));
            }
            for v in map.values_mut() {
                redact_fetched_at(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_fetched_at(v);
            }
        }
        _ => {}
    }
}

/// Sort models_used arrays by model_id.
fn sort_models_used(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if let Some(models) = map.get_mut("models_used") {
                sort_array_by_key(models, "model_id");
            }
            if let Some(models) = map.get_mut("models") {
                sort_array_by_key(models, "model_id");
            }
            for v in map.values_mut() {
                sort_models_used(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                sort_models_used(v);
            }
        }
        _ => {}
    }
}

/// Sort tools arrays by name.
fn sort_tools(val: &mut Value) {
    match val {
        Value::Object(map) => {
            if let Some(tools) = map.get_mut("tools") {
                sort_array_by_key(tools, "name");
            }
            if let Some(tools) = map.get_mut("tool_distribution") {
                sort_array_by_key(tools, "name");
            }
            for v in map.values_mut() {
                sort_tools(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                sort_tools(v);
            }
        }
        _ => {}
    }
}

/// Sort projects array by path.
fn sort_projects(val: &mut Value) {
    if let Value::Object(map) = val {
        if let Some(projects) = map.get_mut("projects") {
            sort_array_by_key(projects, "path");
        }
    }
}

/// Sort NameCount arrays (top_bash_commands, etc.) by name for determinism
/// (they are already sorted by count desc, but ties need a stable tiebreaker).
fn sort_name_count_arrays(val: &mut Value) {
    let fields = [
        "top_bash_commands", "top_read_files", "top_edit_files", "top_write_files",
        "bash_commands", "read_files", "edit_files", "write_files",
        "items", "directory_stats", "file_insights",
    ];
    if let Value::Object(map) = val {
        for field in &fields {
            if let Some(arr) = map.get_mut(*field) {
                // Sort by count desc, then name asc for stability
                if let Value::Array(items) = arr {
                    items.sort_by(|a, b| {
                        let ca = a.get("count").or(a.get("total_count")).or(a.get("total")).and_then(|v| v.as_u64()).unwrap_or(0);
                        let cb = b.get("count").or(b.get("total_count")).or(b.get("total")).and_then(|v| v.as_u64()).unwrap_or(0);
                        cb.cmp(&ca).then_with(|| {
                            let na = a.get("name").or(a.get("path")).and_then(|v| v.as_str()).unwrap_or("");
                            let nb = b.get("name").or(b.get("path")).and_then(|v| v.as_str()).unwrap_or("");
                            na.cmp(nb)
                        })
                    });
                }
            }
        }
        // Recurse
        for v in map.values_mut() {
            sort_name_count_arrays(v);
        }
    }
    if let Value::Array(arr) = val {
        for v in arr.iter_mut() {
            sort_name_count_arrays(v);
        }
    }
}

/// Sort by_project arrays by project_path.
fn sort_by_project(val: &mut Value) {
    if let Value::Object(map) = val {
        if let Some(bp) = map.get_mut("by_project") {
            sort_array_by_key(bp, "project_path");
        }
        for v in map.values_mut() {
            sort_by_project(v);
        }
    }
}

/// Sort by_subcommand (HashMap<String, u32>) is already handled by normalize().

/// Apply all normalizations for analytics data.
fn normalize_analytics(val: &mut Value) {
    redact_file_size_bytes(val);
    sort_models_used(val);
    sort_tools(val);
    sort_projects(val);
    sort_name_count_arrays(val);
    sort_by_project(val);
    normalize(val);
}

/// Apply all normalizations for QMD data.
fn normalize_qmd(val: &mut Value, fixture_root: &str) {
    redact_db_path(val, fixture_root);
    redact_db_size_bytes(val);
    redact_days_since_update(val);
    normalize(val);
}

/// Apply all normalizations for QMD index listings.
fn normalize_qmd_indexes(val: &mut Value, fixture_root: &str) {
    redact_db_path(val, fixture_root);
    redact_db_size_bytes(val);
    redact_last_modified_on_indexes(val);
    normalize(val);
}

/// Apply normalizations for provider limits.
fn normalize_provider_limits(val: &mut Value) {
    redact_fetched_at(val);
    normalize(val);
}

/// Apply normalizations for QMD log data.
fn normalize_qmd_logs(val: &mut Value) {
    normalize(val);
}

/// Write a golden file as pretty-printed JSON.
fn write_golden(relative_path: &str, val: &Value) {
    let path = golden_root().join(relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create golden dir");
    }
    let json = serde_json::to_string_pretty(val).expect("serialize golden");
    std::fs::write(&path, json.as_bytes()).expect("write golden file");
}


// ─── Manifest ────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct ManifestEntry {
    file: String,
    command: String,
    fixture_root: String,
    parameters: Value,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async fn do_capture_goldens() {
    // Pin timezone
    std::env::set_var("TZ", "UTC");

    let fixtures = fixtures_root();
    let qmd_cache_root = fixtures.join("qmd").join("cache-root");
    let qmd_cache_root_str = qmd_cache_root.to_string_lossy().to_string();

    let mut manifest: Vec<ManifestEntry> = Vec::new();

    // ── Analytics: Minimal ──────────────────────────────────────────────
    {
        let sessions_root = fixtures.join("sessions").join("minimal");
        std::env::set_var("ARIADNE_PI_SESSIONS_ROOT", sessions_root.to_str().unwrap());

        let cache = SessionCache::new();

        // get_analytics_overview (no filter)
        let overview = cache.get_analytics_overview(None, 0).await.unwrap();
        let mut val = serde_json::to_value(&overview).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/minimal-overview.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/minimal-overview.json".into(),
            command: "get_analytics_overview".into(),
            fixture_root: "sessions/minimal".into(),
            parameters: serde_json::json!({"project_path": null, "range_days": 0}),
        });

        // get_all_sessions
        let sessions = cache.get_all_sessions(None, 0).await.unwrap();
        let mut val = serde_json::to_value(&sessions).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/minimal-sessions.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/minimal-sessions.json".into(),
            command: "get_all_sessions".into(),
            fixture_root: "sessions/minimal".into(),
            parameters: serde_json::json!({"project_path": null, "range_days": 0}),
        });

        // get_session_detail
        let detail = cache.get_session_detail("aaaaaaaa-0001-0001-0001-000000000001").await.unwrap();
        let mut val = serde_json::to_value(&detail).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/minimal-session-detail.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/minimal-session-detail.json".into(),
            command: "get_session_detail".into(),
            fixture_root: "sessions/minimal".into(),
            parameters: serde_json::json!({"session_id": "aaaaaaaa-0001-0001-0001-000000000001"}),
        });
    }

    // ── Analytics: Multi-Project ────────────────────────────────────────
    {
        let sessions_root = fixtures.join("sessions").join("multi-project");
        std::env::set_var("ARIADNE_PI_SESSIONS_ROOT", sessions_root.to_str().unwrap());

        let cache = SessionCache::new();

        // overview — all projects, all time
        let overview = cache.get_analytics_overview(None, 0).await.unwrap();
        let mut val = serde_json::to_value(&overview).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-overview-all.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-overview-all.json".into(),
            command: "get_analytics_overview".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"project_path": null, "range_days": 0}),
        });

        // overview — filtered by project
        let overview = cache.get_analytics_overview(Some("/home/test/project-alpha"), 0).await.unwrap();
        let mut val = serde_json::to_value(&overview).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-overview-filtered.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-overview-filtered.json".into(),
            command: "get_analytics_overview".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"project_path": "/home/test/project-alpha", "range_days": 0}),
        });

        // overview — ranged (use a large range to include all fixture data which is far in the future)
        let overview = cache.get_analytics_overview(None, 36500).await.unwrap();
        let mut val = serde_json::to_value(&overview).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-overview-ranged.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-overview-ranged.json".into(),
            command: "get_analytics_overview".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"project_path": null, "range_days": 36500}),
        });

        // all sessions
        let sessions = cache.get_all_sessions(None, 0).await.unwrap();
        let mut val = serde_json::to_value(&sessions).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-sessions.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-sessions.json".into(),
            command: "get_all_sessions".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"project_path": null, "range_days": 0}),
        });

        // project file stats
        let file_stats = cache.get_project_file_stats("/home/test/project-alpha", 0).await.unwrap();
        let mut val = serde_json::to_value(&file_stats).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-file-stats.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-file-stats.json".into(),
            command: "get_project_file_stats".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"project_path": "/home/test/project-alpha", "range_days": 0}),
        });

        // time breakdown
        let time_breakdown = cache.get_time_breakdown(30, None).await.unwrap();
        let mut val = serde_json::to_value(&time_breakdown).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-time-breakdown.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-time-breakdown.json".into(),
            command: "get_time_breakdown".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"range_days": 30, "project_path": null}),
        });

        // tool details
        let tool_details = cache.get_tool_details("read", None, 0).await.unwrap();
        let mut val = serde_json::to_value(&tool_details).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-tool-details.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-tool-details.json".into(),
            command: "get_tool_details".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"tool_name": "read", "project_path": null, "range_days": 0}),
        });

        // file sizes — use paths from the fixture itself (they won't exist but we capture the behavior)
        let file_sizes = SessionCache::get_file_sizes(vec![
            "/home/test/project-alpha/src/utils.ts".to_string(),
            "/home/test/project-alpha/src/auth.ts".to_string(),
        ]);
        let mut val = serde_json::to_value(&file_sizes).unwrap();
        normalize_analytics(&mut val);
        write_golden("analytics/multi-project-file-sizes.json", &val);
        manifest.push(ManifestEntry {
            file: "analytics/multi-project-file-sizes.json".into(),
            command: "get_file_sizes".into(),
            fixture_root: "sessions/multi-project".into(),
            parameters: serde_json::json!({"paths": ["/home/test/project-alpha/src/utils.ts", "/home/test/project-alpha/src/auth.ts"]}),
        });
    }

    // ── Replay: Minimal ─────────────────────────────────────────────────
    {
        let sessions_root = fixtures.join("sessions").join("minimal");
        std::env::set_var("ARIADNE_PI_SESSIONS_ROOT", sessions_root.to_str().unwrap());

        let cache = SessionCache::new();

        let entries = cache.get_session_entries("aaaaaaaa-0001-0001-0001-000000000001").await.unwrap();
        let mut val = serde_json::to_value(&entries).unwrap();
        // Entries are ordered — do not sort. Just normalize object keys.
        normalize(&mut val);
        write_golden("replay/minimal-entries.json", &val);
        manifest.push(ManifestEntry {
            file: "replay/minimal-entries.json".into(),
            command: "get_session_entries".into(),
            fixture_root: "sessions/minimal".into(),
            parameters: serde_json::json!({"session_id": "aaaaaaaa-0001-0001-0001-000000000001"}),
        });
    }

    // ── Replay: Branching ───────────────────────────────────────────────
    {
        let sessions_root = fixtures.join("sessions").join("branching-replay");
        std::env::set_var("ARIADNE_PI_SESSIONS_ROOT", sessions_root.to_str().unwrap());

        let cache = SessionCache::new();

        let entries = cache.get_session_entries("aaaaaaaa-0003-0001-0001-000000000001").await.unwrap();
        let mut val = serde_json::to_value(&entries).unwrap();
        normalize(&mut val);
        write_golden("replay/branching-entries.json", &val);
        manifest.push(ManifestEntry {
            file: "replay/branching-entries.json".into(),
            command: "get_session_entries".into(),
            fixture_root: "sessions/branching-replay".into(),
            parameters: serde_json::json!({"session_id": "aaaaaaaa-0003-0001-0001-000000000001"}),
        });
    }

    // ── QMD Reads ───────────────────────────────────────────────────────
    {
        std::env::set_var("ARIADNE_QMD_CACHE_ROOT", qmd_cache_root.to_str().unwrap());

        // list indexes
        let indexes = qmd_list_indexes().await.unwrap();
        let mut val = serde_json::to_value(&indexes).unwrap();
        normalize_qmd_indexes(&mut val, &qmd_cache_root_str);
        write_golden("qmd/list-indexes.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/list-indexes.json".into(),
            command: "qmd_list_indexes".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({}),
        });

        // default status
        let status = qmd_get_status("default".into()).await.unwrap();
        let mut val = serde_json::to_value(&status).unwrap();
        normalize_qmd(&mut val, &qmd_cache_root_str);
        write_golden("qmd/default-status.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/default-status.json".into(),
            command: "qmd_get_status".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({"index": "default"}),
        });

        // default collections
        let collections = qmd_list_collections("default".into()).await.unwrap();
        let mut val = serde_json::to_value(&collections).unwrap();
        normalize_qmd(&mut val, &qmd_cache_root_str);
        write_golden("qmd/default-collections.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/default-collections.json".into(),
            command: "qmd_list_collections".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({"index": "default"}),
        });

        // default collection detail (docs)
        let detail = qmd_get_collection_detail("default".into(), "docs".into()).await.unwrap();
        let mut val = serde_json::to_value(&detail).unwrap();
        normalize_qmd(&mut val, &qmd_cache_root_str);
        write_golden("qmd/default-collection-detail.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/default-collection-detail.json".into(),
            command: "qmd_get_collection_detail".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({"index": "default", "name": "docs"}),
        });

        // work status
        let status = qmd_get_status("work".into()).await.unwrap();
        let mut val = serde_json::to_value(&status).unwrap();
        normalize_qmd(&mut val, &qmd_cache_root_str);
        write_golden("qmd/work-status.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/work-status.json".into(),
            command: "qmd_get_status".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({"index": "work"}),
        });

        // availability
        let avail = qmd_check_availability().await.unwrap();
        let mut val = serde_json::to_value(&avail).unwrap();
        normalize_qmd(&mut val, &qmd_cache_root_str);
        write_golden("qmd/availability.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd/availability.json".into(),
            command: "qmd_check_availability".into(),
            fixture_root: "qmd/cache-root".into(),
            parameters: serde_json::json!({}),
        });
    }

    // ── QMD Logs ────────────────────────────────────────────────────────
    {
        let sessions_root = fixtures.join("sessions").join("qmd-cli");
        std::env::set_var("ARIADNE_PI_SESSIONS_ROOT", sessions_root.to_str().unwrap());

        let log_cache = QmdLogCache::new();

        // all logs
        let logs = log_cache.get_qmd_logs(None).await.unwrap();
        let mut val = serde_json::to_value(&logs).unwrap();
        normalize_qmd_logs(&mut val);
        write_golden("qmd-logs/all-logs.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd-logs/all-logs.json".into(),
            command: "get_qmd_logs".into(),
            fixture_root: "sessions/qmd-cli".into(),
            parameters: serde_json::json!({"project_path": null}),
        });

        // all log stats
        let stats = log_cache.get_qmd_log_stats(None).await.unwrap();
        let mut val = serde_json::to_value(&stats).unwrap();
        normalize_qmd_logs(&mut val);
        write_golden("qmd-logs/all-log-stats.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd-logs/all-log-stats.json".into(),
            command: "get_qmd_log_stats".into(),
            fixture_root: "sessions/qmd-cli".into(),
            parameters: serde_json::json!({"project_path": null}),
        });

        // filtered logs by project
        let filtered = log_cache.get_qmd_logs(Some("/home/test/project-alpha")).await.unwrap();
        let mut val = serde_json::to_value(&filtered).unwrap();
        normalize_qmd_logs(&mut val);
        write_golden("qmd-logs/filtered-logs.json", &val);
        manifest.push(ManifestEntry {
            file: "qmd-logs/filtered-logs.json".into(),
            command: "get_qmd_logs".into(),
            fixture_root: "sessions/qmd-cli".into(),
            parameters: serde_json::json!({"project_path": "/home/test/project-alpha"}),
        });
    }

    // ── Provider Limits ─────────────────────────────────────────────────
    {
        let codex_home = fixtures.join("provider-limits").join("codex-session-log");
        std::env::set_var("ARIADNE_CODEX_HOME", codex_home.to_str().unwrap());

        let snapshot = fallback_session_logs().await.unwrap();
        let mut val = serde_json::to_value(&snapshot).unwrap();
        normalize_provider_limits(&mut val);
        write_golden("provider-limits/session-log-fallback.json", &val);
        manifest.push(ManifestEntry {
            file: "provider-limits/session-log-fallback.json".into(),
            command: "fallback_session_logs".into(),
            fixture_root: "provider-limits/codex-session-log".into(),
            parameters: serde_json::json!({}),
        });
    }

    // ── Write manifest ──────────────────────────────────────────────────
    {
        let manifest_val = serde_json::to_value(&manifest).unwrap();
        write_golden("manifest.json", &manifest_val);
    }

    eprintln!("Golden capture complete: {} files written", manifest.len() + 1);
}

#[tokio::test]
async fn capture_goldens() {
    do_capture_goldens().await;
}

/// Run capture twice and verify identical output (determinism check).
#[tokio::test]
async fn goldens_are_deterministic() {
    // First run
    do_capture_goldens().await;

    // Read all golden files
    let first_run = read_all_goldens();

    // Second run
    do_capture_goldens().await;

    // Read again
    let second_run = read_all_goldens();

    assert_eq!(first_run.len(), second_run.len(), "Different number of golden files between runs");

    for (path, first_content) in &first_run {
        let second_content = second_run.get(path).unwrap_or_else(|| {
            panic!("File {} missing in second run", path);
        });
        assert_eq!(
            first_content, second_content,
            "Golden file {} differs between runs",
            path
        );
    }
}

fn read_all_goldens() -> BTreeMap<String, String> {
    let golden = golden_root();
    let mut files = BTreeMap::new();
    collect_files_recursive(&golden, &golden, &mut files);
    files
}

fn collect_files_recursive(base: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
    if !dir.exists() {
        return;
    }
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            collect_files_recursive(base, &path, out);
        } else if path.extension().map(|e| e == "json").unwrap_or(false) {
            let rel = path.strip_prefix(base).unwrap().to_string_lossy().to_string();
            let content = std::fs::read_to_string(&path).unwrap();
            out.insert(rel, content);
        }
    }
}
