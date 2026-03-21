use std::path::PathBuf;
use std::process::Command;

use rusqlite::{Connection, OpenFlags};
use serde_json::{self, json};
use tauri::{AppHandle, State};

use crate::models::qmd::{
    QmdAvailability, QmdCollection, QmdCollectionDetail, QmdCommandResult, QmdContext,
    QmdDocument, QmdIndex, QmdStatus,
};
use crate::sidecar::QmdSidecar;

// ─── INDEX RESOLUTION ───────────────────────────────────────────────────────

fn get_qmd_cache_dir() -> PathBuf {
    let base = if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        PathBuf::from(xdg)
    } else {
        dirs::home_dir().unwrap_or_default().join(".cache")
    };
    base.join("qmd")
}

/// Resolve an index display name to its database file path.
/// "default" maps to "index.sqlite", all others use their name directly.
fn resolve_index_db_path(index_name: &str) -> PathBuf {
    let file_stem = if index_name == "default" {
        "index"
    } else {
        index_name
    };
    get_qmd_cache_dir().join(format!("{}.sqlite", file_stem))
}

fn open_db(index: &str) -> Result<Connection, String> {
    let path = resolve_index_db_path(index);
    if !path.exists() {
        return Err(format!("QMD index '{}' not found at {}", index, path.display()));
    }
    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())
}

// ─── INDEX MANAGEMENT COMMANDS ──────────────────────────────────────────────

#[tauri::command]
pub async fn qmd_list_indexes() -> Result<Vec<QmdIndex>, String> {
    tokio::task::spawn_blocking(|| {
        let cache_dir = get_qmd_cache_dir();
        if !cache_dir.exists() {
            return Ok(vec![]);
        }

        let mut indexes = Vec::new();
        let entries = std::fs::read_dir(&cache_dir).map_err(|e| e.to_string())?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("sqlite") {
                continue;
            }
            let file_stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            // Skip WAL/SHM companion stems and the models directory
            if file_stem.is_empty() || file_stem == "models" {
                continue;
            }

            let display_name = if file_stem == "index" {
                "default".to_string()
            } else {
                file_stem.clone()
            };

            let metadata = std::fs::metadata(&path).ok();
            let db_size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let last_modified = metadata.as_ref().and_then(|m| {
                m.modified().ok().map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
            });

            // Try to read collection and document counts
            let (collection_count, document_count) = match Connection::open_with_flags(
                &path,
                OpenFlags::SQLITE_OPEN_READ_ONLY,
            ) {
                Ok(conn) => {
                    let cc: u32 = conn
                        .query_row("SELECT COUNT(*) FROM store_collections", [], |r| r.get(0))
                        .unwrap_or(0);
                    let dc: u32 = conn
                        .query_row(
                            "SELECT COUNT(*) FROM documents WHERE active = 1",
                            [],
                            |r| r.get(0),
                        )
                        .unwrap_or(0);
                    (cc, dc)
                }
                Err(_) => (0, 0),
            };

            indexes.push(QmdIndex {
                name: display_name,
                file_stem,
                db_path: path.to_string_lossy().to_string(),
                db_size_bytes,
                collection_count,
                document_count,
                last_modified,
            });
        }

        // Sort: default first, then alphabetically
        indexes.sort_by(|a, b| {
            if a.name == "default" {
                std::cmp::Ordering::Less
            } else if b.name == "default" {
                std::cmp::Ordering::Greater
            } else {
                a.name.cmp(&b.name)
            }
        });

        Ok(indexes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_create_index(
    sidecar: State<'_, QmdSidecar>,
    name: String,
) -> Result<QmdCommandResult, String> {
    // Validate name
    let name_re = regex::Regex::new(r"^[a-z][a-z0-9-]*$").unwrap();
    if !name_re.is_match(&name) {
        return Err("Index name must start with a letter and contain only lowercase letters, digits, and hyphens".to_string());
    }
    if name.len() > 32 {
        return Err("Index name must be 32 characters or less".to_string());
    }
    if name == "index" || name == "models" {
        return Err(format!("'{}' is a reserved name", name));
    }

    let db_path = resolve_index_db_path(&name);
    if db_path.exists() {
        return Err(format!("Index '{}' already exists", name));
    }

    let sidecar = sidecar.inner().clone();
    let db_path_str = db_path.to_string_lossy().to_string();

    tokio::task::spawn_blocking(move || {
        sidecar.ensure_running()?;
        let result = sidecar.call_blocking("create_index", json!({ "db_path": db_path_str }))?;
        Ok(QmdCommandResult {
            success: true,
            output: serde_json::to_string(&result).unwrap_or_default(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_delete_index(name: String) -> Result<QmdCommandResult, String> {
    if name == "default" {
        return Err("Cannot delete the default index".to_string());
    }

    let db_path = resolve_index_db_path(&name);
    if !db_path.exists() {
        return Err(format!("Index '{}' does not exist", name));
    }

    tokio::task::spawn_blocking(move || {
        // Delete main file + WAL/SHM companions
        let _ = std::fs::remove_file(&db_path);
        let wal = db_path.with_extension("sqlite-wal");
        let shm = db_path.with_extension("sqlite-shm");
        let _ = std::fs::remove_file(&wal);
        let _ = std::fs::remove_file(&shm);

        Ok(QmdCommandResult {
            success: true,
            output: format!("Index '{}' deleted", name),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_rename_index(
    old_name: String,
    new_name: String,
) -> Result<QmdCommandResult, String> {
    if old_name == "default" {
        return Err("Cannot rename the default index".to_string());
    }

    let name_re = regex::Regex::new(r"^[a-z][a-z0-9-]*$").unwrap();
    if !name_re.is_match(&new_name) {
        return Err("Index name must start with a letter and contain only lowercase letters, digits, and hyphens".to_string());
    }
    if new_name.len() > 32 {
        return Err("Index name must be 32 characters or less".to_string());
    }
    if new_name == "index" || new_name == "models" {
        return Err(format!("'{}' is a reserved name", new_name));
    }

    let old_path = resolve_index_db_path(&old_name);
    let new_path = resolve_index_db_path(&new_name);

    if !old_path.exists() {
        return Err(format!("Index '{}' does not exist", old_name));
    }
    if new_path.exists() {
        return Err(format!("Index '{}' already exists", new_name));
    }

    tokio::task::spawn_blocking(move || {
        std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
        // Also rename WAL/SHM if they exist
        let old_wal = old_path.with_extension("sqlite-wal");
        let new_wal = new_path.with_extension("sqlite-wal");
        if old_wal.exists() {
            let _ = std::fs::rename(&old_wal, &new_wal);
        }
        let old_shm = old_path.with_extension("sqlite-shm");
        let new_shm = new_path.with_extension("sqlite-shm");
        if old_shm.exists() {
            let _ = std::fs::rename(&old_shm, &new_shm);
        }

        Ok(QmdCommandResult {
            success: true,
            output: format!("Index renamed from '{}' to '{}'", old_name, new_name),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── READ COMMANDS (direct SQLite, now index-scoped) ────────────────────────

#[tauri::command]
pub async fn qmd_check_availability() -> Result<QmdAvailability, String> {
    tokio::task::spawn_blocking(|| {
        let db_path = resolve_index_db_path("default");
        let db_exists = db_path.exists();
        let db_size_bytes = if db_exists {
            std::fs::metadata(&db_path).ok().map(|m| m.len())
        } else {
            None
        };

        let output = Command::new("qmd").arg("--version").output();
        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(QmdAvailability {
                    installed: true,
                    version: if version.is_empty() {
                        None
                    } else {
                        Some(version)
                    },
                    db_path: if db_exists {
                        Some(db_path.to_string_lossy().to_string())
                    } else {
                        None
                    },
                    db_size_bytes,
                })
            }
            _ => Ok(QmdAvailability {
                installed: false,
                version: None,
                db_path: if db_exists {
                    Some(db_path.to_string_lossy().to_string())
                } else {
                    None
                },
                db_size_bytes,
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_get_status(index: String) -> Result<QmdStatus, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&index)?;

        let db_path = resolve_index_db_path(&index);
        let db_size_bytes = std::fs::metadata(&db_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let total_documents: u32 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .unwrap_or(0);

        let active_documents: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE active = 1",
                [],
                |r| r.get(0),
            )
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
    })
    .await
    .map_err(|e| e.to_string())?
}

fn parse_ignore_patterns(raw: &str) -> Vec<String> {
    if let Ok(v) = serde_json::from_str::<Vec<String>>(raw) {
        v
    } else {
        raw.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }
}

fn parse_contexts(json_str: Option<&str>) -> Vec<QmdContext> {
    let Some(raw) = json_str else {
        return vec![];
    };
    if raw.is_empty() {
        return vec![];
    }

    match serde_json::from_str::<std::collections::HashMap<String, String>>(raw) {
        Ok(map) => map
            .into_iter()
            .map(|(path, context)| QmdContext { path, context })
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
pub async fn qmd_list_collections(index: String) -> Result<Vec<QmdCollection>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&index)?;

        let mut stmt = conn
            .prepare(
                "SELECT sc.name, sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default, \
             sc.update_command, sc.context, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count, \
             COUNT(DISTINCT d.id) as total_doc_count, \
             COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count, \
             MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified \
             FROM store_collections sc \
             LEFT JOIN documents d ON d.collection = sc.name \
             LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 \
             GROUP BY sc.name",
            )
            .map_err(|e| e.to_string())?;

        let collections = stmt
            .query_map([], |r| {
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
                Ok((
                    name,
                    path,
                    pattern,
                    ignore_raw,
                    include_by_default,
                    update_command,
                    context_json,
                    active_doc_count,
                    doc_count,
                    embedded_count,
                    last_modified,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in collections {
            let (
                name,
                path,
                pattern,
                ignore_raw,
                include_by_default,
                update_command,
                context_json,
                active_doc_count,
                doc_count,
                embedded_count,
                last_modified,
            ) = row.map_err(|e| e.to_string())?;
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_get_collection_detail(
    index: String,
    name: String,
) -> Result<QmdCollectionDetail, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&index)?;

        let (
            path,
            pattern,
            ignore_raw,
            include_by_default,
            update_command,
            context_json,
            active_doc_count,
            doc_count,
            embedded_count,
            last_modified,
        ) = conn
            .query_row(
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
            )
            .map_err(|e| format!("Collection not found: {}", e))?;

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

        let documents = qmd_get_collection_documents_inner(&conn, &name)?;

        Ok(QmdCollectionDetail {
            collection,
            documents,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn qmd_get_collection_documents_inner(
    conn: &Connection,
    collection: &str,
) -> Result<Vec<QmdDocument>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.path, d.title, SUBSTR(d.hash, 1, 6) as docid, d.collection, d.modified_at, \
         LENGTH(c.doc) as body_length \
         FROM documents d \
         JOIN content c ON c.hash = d.hash \
         WHERE d.collection = ? AND d.active = 1 \
         ORDER BY d.modified_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let docs = stmt
        .query_map([collection], |r| {
            Ok(QmdDocument {
                path: r.get(0)?,
                title: r.get::<_, String>(1).unwrap_or_default(),
                docid: r.get(2)?,
                collection: r.get(3)?,
                modified_at: r.get::<_, String>(4).unwrap_or_default(),
                body_length: r.get::<_, i64>(5).unwrap_or(0) as u32,
            })
        })
        .map_err(|e| e.to_string())?;

    docs.map(|d| d.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub async fn qmd_get_collection_documents(
    index: String,
    collection: String,
) -> Result<Vec<QmdDocument>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&index)?;
        qmd_get_collection_documents_inner(&conn, &collection)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── MUTATION COMMANDS (via sidecar, now index-scoped) ──────────────────────

fn wrap_sidecar_result(result: serde_json::Value) -> QmdCommandResult {
    QmdCommandResult {
        success: true,
        output: serde_json::to_string(&result).unwrap_or_default(),
    }
}

#[tauri::command]
pub async fn qmd_add_collection(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    name: String,
    path: String,
    pattern: Option<String>,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({
        "name": name,
        "path": path,
        "pattern": pattern,
    });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("add_collection", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_remove_collection(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    name: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({ "name": name });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("remove_collection", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_rename_collection(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    old_name: String,
    new_name: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({ "old_name": old_name, "new_name": new_name });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("rename_collection", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_add_context(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    collection: String,
    path: String,
    text: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({ "collection": collection, "path": path, "text": text });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("add_context", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_remove_context(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    collection: String,
    path: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({ "collection": collection, "path": path });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("remove_context", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_set_global_context(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    text: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({ "text": text });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("set_global_context", params)?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_reindex(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    app: AppHandle,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result =
            sidecar.call_with_progress_blocking("update", json!({}), &app, "qmd:update-progress")?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_embed(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    app: AppHandle,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result =
            sidecar.call_with_progress_blocking("embed", json!({}), &app, "qmd:embed-progress")?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_cleanup(
    sidecar: State<'_, QmdSidecar>,
    index: String,
) -> Result<QmdCommandResult, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("cleanup", json!({}))?;
        Ok(wrap_sidecar_result(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── FILE MANAGEMENT COMMANDS ───────────────────────────────────────────────

#[tauri::command]
pub async fn qmd_scan_filesystem(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    collection: String,
) -> Result<Vec<String>, String> {
    // Read collection path and pattern from SQLite
    let (coll_path, coll_pattern) = tokio::task::spawn_blocking({
        let collection = collection.clone();
        let index = index.clone();
        move || {
            let conn = open_db(&index)?;
            conn.query_row(
                "SELECT path, pattern FROM store_collections WHERE name = ?",
                [&collection],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .map_err(|e| format!("Collection not found: {}", e))
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({
        "collection": collection,
        "path": coll_path,
        "pattern": coll_pattern,
    });

    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        let result = sidecar.call_blocking("scan_filesystem", params)?;
        let paths = result
            .get("paths")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        Ok(paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_get_indexed_paths(
    index: String,
    collection: String,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&index)?;
        let mut stmt = conn
            .prepare("SELECT path FROM documents WHERE collection = ? AND active = 1")
            .map_err(|e| e.to_string())?;
        let paths = stmt
            .query_map([&collection], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        paths.map(|p| p.map_err(|e| e.to_string())).collect()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn qmd_toggle_files(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    collection: String,
    repo_root: String,
    adds: Vec<String>,
    removes: Vec<String>,
) -> Result<serde_json::Value, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({
        "collection": collection,
        "repo_root": repo_root,
        "adds": adds,
        "removes": removes,
    });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        sidecar.call_blocking("toggle_files", params)
    })
    .await
    .map_err(|e| e.to_string())?
}
