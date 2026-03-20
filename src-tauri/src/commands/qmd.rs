use std::path::PathBuf;
use std::process::Command;

use rusqlite::{Connection, OpenFlags};
use serde_json;

use crate::models::qmd::{
    QmdAvailability, QmdCollection, QmdCollectionDetail, QmdCommandResult, QmdContext,
    QmdDocument, QmdStatus,
};

fn get_db_path() -> Option<PathBuf> {
    // Check XDG_CACHE_HOME first, then ~/.cache
    let base = if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        PathBuf::from(xdg)
    } else {
        dirs::home_dir()?.join(".cache")
    };
    let path = base.join("qmd").join("index.sqlite");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn open_db() -> Result<Connection, String> {
    let path = get_db_path().ok_or_else(|| "QMD index not found".to_string())?;
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn qmd_check_availability() -> Result<QmdAvailability, String> {
    tokio::task::spawn_blocking(|| {
        let db_path = get_db_path();
        let db_size_bytes = db_path.as_ref().and_then(|p| {
            std::fs::metadata(p).ok().map(|m| m.len())
        });

        let output = Command::new("qmd").arg("--version").output();
        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(QmdAvailability {
                    installed: true,
                    version: if version.is_empty() { None } else { Some(version) },
                    db_path: db_path.map(|p| p.to_string_lossy().to_string()),
                    db_size_bytes,
                })
            }
            _ => Ok(QmdAvailability {
                installed: false,
                version: None,
                db_path: db_path.map(|p| p.to_string_lossy().to_string()),
                db_size_bytes,
            }),
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_get_status() -> Result<QmdStatus, String> {
    tokio::task::spawn_blocking(|| {
        let conn = open_db()?;

        let db_path = get_db_path().unwrap();
        let db_size_bytes = std::fs::metadata(&db_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let total_documents: u32 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .unwrap_or(0);

        let active_documents: u32 = conn
            .query_row("SELECT COUNT(*) FROM documents WHERE active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        let needs_embedding: u32 = conn
            .query_row(
                "SELECT COUNT(DISTINCT d.hash) FROM documents d \
                 LEFT JOIN content_vectors cv ON d.hash = cv.hash AND cv.seq = 0 \
                 WHERE d.active = 1 AND cv.hash IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let embedded_chunks: u32 = conn
            .query_row("SELECT COUNT(*) FROM content_vectors", [], |r| r.get(0))
            .unwrap_or(0);

        let collection_count: u32 = conn
            .query_row("SELECT COUNT(*) FROM store_collections", [], |r| r.get(0))
            .unwrap_or(0);

        let global_context: Option<String> = conn
            .query_row(
                "SELECT value FROM store_config WHERE key = 'global_context'",
                [],
                |r| r.get(0),
            )
            .ok();

        // Compute days since last update from most recent document modification
        let days_since_update: Option<u32> = conn
            .query_row(
                "SELECT MAX(modified_at) FROM documents WHERE active = 1",
                [],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten()
            .and_then(|ts| {
                chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%dT%H:%M:%S%.fZ")
                    .or_else(|_| chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%dT%H:%M:%S"))
                    .ok()
                    .map(|dt| {
                        let now = chrono::Utc::now().naive_utc();
                        (now - dt).num_days().max(0) as u32
                    })
            });

        Ok(QmdStatus {
            total_documents,
            active_documents,
            embedded_chunks,
            needs_embedding,
            collection_count,
            db_size_bytes,
            global_context,
            days_since_update,
        })
    }).await.map_err(|e| e.to_string())?
}

fn parse_ignore_patterns(raw: &str) -> Vec<String> {
    // stored as JSON array or comma-separated
    if let Ok(v) = serde_json::from_str::<Vec<String>>(raw) {
        v
    } else {
        raw.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    }
}

/// Parse contexts from the JSON stored in store_collections.context column.
/// Context is a JSON object: { "/path": "description", ... }
fn parse_contexts(json_str: Option<&str>) -> Vec<QmdContext> {
    let Some(raw) = json_str else { return vec![] };
    if raw.is_empty() { return vec![]; }

    match serde_json::from_str::<std::collections::HashMap<String, String>>(raw) {
        Ok(map) => map
            .into_iter()
            .map(|(path, context)| QmdContext { path, context })
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
pub async fn qmd_list_collections() -> Result<Vec<QmdCollection>, String> {
    tokio::task::spawn_blocking(|| {
        let conn = open_db()?;

        let mut stmt = conn.prepare(
            "SELECT sc.name, sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default, \
             sc.update_command, sc.context, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count, \
             COUNT(DISTINCT d.id) as total_doc_count, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count, \
             MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified \
             FROM store_collections sc \
             LEFT JOIN documents d ON d.collection = sc.name \
             LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 \
             GROUP BY sc.name"
        ).map_err(|e| e.to_string())?;

        let collections = stmt.query_map([], |r| {
            let name: String = r.get(0)?;
            let path: String = r.get(1)?;
            let pattern: String = r.get(2)?;
            let ignore_raw: String = r.get::<_, String>(3).unwrap_or_default();
            let include_by_default: bool = r.get::<_, i32>(4).unwrap_or(1) != 0;
            let update_command: Option<String> = r.get(5)?;
            let context_json: Option<String> = r.get(6)?;
            let active_doc_count: u32 = r.get::<_, i64>(7).unwrap_or(0) as u32;
            let doc_count: u32 = r.get::<_, i64>(8).unwrap_or(0) as u32;
            let embedded_count: u32 = r.get::<_, i64>(9).unwrap_or(0) as u32;
            let last_modified: Option<String> = r.get(10)?;
            Ok((name, path, pattern, ignore_raw, include_by_default, update_command,
                context_json, active_doc_count, doc_count, embedded_count, last_modified))
        }).map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in collections {
            let (name, path, pattern, ignore_raw, include_by_default, update_command,
                 context_json, active_doc_count, doc_count, embedded_count, last_modified) =
                row.map_err(|e| e.to_string())?;
            let ignore_patterns = parse_ignore_patterns(&ignore_raw);
            let contexts = parse_contexts(context_json.as_deref());
            result.push(QmdCollection {
                name,
                path,
                pattern,
                ignore_patterns,
                include_by_default,
                update_command,
                doc_count,
                active_doc_count,
                embedded_count,
                last_modified,
                contexts,
            });
        }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_get_collection_detail(name: String) -> Result<QmdCollectionDetail, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db()?;

        // Get collection row
        let (path, pattern, ignore_raw, include_by_default, update_command, context_json,
             active_doc_count, doc_count, embedded_count, last_modified) = conn.query_row(
            "SELECT sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default, sc.update_command, sc.context, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count, \
             COUNT(DISTINCT d.id) as total_doc_count, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count, \
             MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified \
             FROM store_collections sc \
             LEFT JOIN documents d ON d.collection = sc.name \
             LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 \
             WHERE sc.name = ? \
             GROUP BY sc.name",
            [&name],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2).unwrap_or_default(),
                    r.get::<_, i32>(3).unwrap_or(1) != 0,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, i64>(6).unwrap_or(0) as u32,
                    r.get::<_, i64>(7).unwrap_or(0) as u32,
                    r.get::<_, i64>(8).unwrap_or(0) as u32,
                    r.get::<_, Option<String>>(9)?,
                ))
            },
        ).map_err(|e| format!("Collection not found: {}", e))?;

        let ignore_patterns = parse_ignore_patterns(&ignore_raw);
        let contexts = parse_contexts(context_json.as_deref());

        let collection = QmdCollection {
            name: name.clone(),
            path,
            pattern,
            ignore_patterns,
            include_by_default,
            update_command,
            doc_count,
            active_doc_count,
            embedded_count,
            last_modified,
            contexts,
        };

        // Get documents
        let documents = qmd_get_collection_documents_inner(&conn, &name)?;

        Ok(QmdCollectionDetail { collection, documents })
    }).await.map_err(|e| e.to_string())?
}

fn qmd_get_collection_documents_inner(conn: &Connection, collection: &str) -> Result<Vec<QmdDocument>, String> {
    let mut stmt = conn.prepare(
        "SELECT d.path, d.title, SUBSTR(d.hash, 1, 6) as docid, d.collection, d.modified_at, \
         LENGTH(c.doc) as body_length \
         FROM documents d \
         JOIN content c ON c.hash = d.hash \
         WHERE d.collection = ? AND d.active = 1 \
         ORDER BY d.modified_at DESC"
    ).map_err(|e| e.to_string())?;

    let docs = stmt.query_map([collection], |r| {
        Ok(QmdDocument {
            path: r.get(0)?,
            title: r.get::<_, String>(1).unwrap_or_default(),
            docid: r.get(2)?,
            collection: r.get(3)?,
            modified_at: r.get::<_, String>(4).unwrap_or_default(),
            body_length: r.get::<_, i64>(5).unwrap_or(0) as u32,
        })
    }).map_err(|e| e.to_string())?;

    docs.map(|d| d.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub async fn qmd_get_collection_documents(collection: String) -> Result<Vec<QmdDocument>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db()?;
        qmd_get_collection_documents_inner(&conn, &collection)
    }).await.map_err(|e| e.to_string())?
}

fn run_qmd(args: &[&str]) -> Result<QmdCommandResult, String> {
    let output = Command::new("qmd")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run qmd: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.is_empty() { stdout } else { format!("{}\n{}", stdout, stderr) };

    Ok(QmdCommandResult {
        success: output.status.success(),
        output: combined.trim().to_string(),
    })
}

#[tauri::command]
pub async fn qmd_add_collection(name: String, path: String, pattern: Option<String>) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["collection", "add", &path, "--name", &name];
        let pattern_owned;
        if let Some(ref p) = pattern {
            pattern_owned = p.clone();
            args.extend_from_slice(&["--mask", &pattern_owned]);
        }
        run_qmd(&args)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_remove_collection(name: String) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        run_qmd(&["collection", "remove", &name])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_rename_collection(old_name: String, new_name: String) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        run_qmd(&["collection", "rename", &old_name, &new_name])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_add_context(collection: String, path: String, text: String) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let uri = format!("qmd://{}/{}", collection, path.trim_start_matches('/'));
        run_qmd(&["context", "add", &uri, &text])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_remove_context(collection: String, path: String) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let uri = format!("qmd://{}/{}", collection, path.trim_start_matches('/'));
        run_qmd(&["context", "rm", &uri])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_set_global_context(text: String) -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        run_qmd(&["context", "add", "/", &text])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_reindex() -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(|| {
        run_qmd(&["update"])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_embed() -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(|| {
        run_qmd(&["embed"])
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_cleanup() -> Result<QmdCommandResult, String> {
    tokio::task::spawn_blocking(|| {
        run_qmd(&["cleanup"])
    }).await.map_err(|e| e.to_string())?
}
