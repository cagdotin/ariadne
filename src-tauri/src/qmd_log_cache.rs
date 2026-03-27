use std::sync::Arc;
use std::collections::{HashMap, HashSet};
use tokio::sync::Mutex;

use crate::models::qmd_logs::{QmdLogEntry, QmdLogStats};
use crate::parser::discovery::discover_session_files;
use crate::parser::qmd_logs::parse_qmd_logs_from_session;

#[derive(Debug)]
pub struct QmdLogCache {
    data: Arc<Mutex<Option<Vec<QmdLogEntry>>>>,
}

impl QmdLogCache {
    pub fn new() -> Self {
        Self {
            data: Arc::new(Mutex::new(None)),
        }
    }

    /// Lazily initialize the cache on first request.
    /// Uses a single Mutex to avoid TOCTOU races — only one task can
    /// observe `None` and trigger a rebuild.
    async fn get_or_init(&self) -> Result<Vec<QmdLogEntry>, String> {
        let mut guard = self.data.lock().await;
        if let Some(entries) = &*guard {
            return Ok(entries.clone());
        }

        // Build from session files while holding the lock
        let entries = Self::build_entries().await?;
        *guard = Some(entries.clone());
        Ok(entries)
    }

    /// Scan session files and build the full entry list.
    async fn build_entries() -> Result<Vec<QmdLogEntry>, String> {
        tokio::task::spawn_blocking(|| {
            let session_files = discover_session_files()?;
            let mut all_entries: Vec<QmdLogEntry> = Vec::new();

            for session_file in session_files {
                match parse_qmd_logs_from_session(&session_file.path) {
                    Ok(entries) => all_entries.extend(entries),
                    Err(e) => {
                        eprintln!(
                            "Failed to parse QMD logs from {}: {}",
                            session_file.path.display(),
                            e
                        );
                    }
                }
            }

            // Sort by timestamp descending (newest first)
            all_entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

            Ok::<Vec<QmdLogEntry>, String>(all_entries)
        })
        .await
        .map_err(|e| format!("QMD log cache build task failed: {}", e))?
    }

    /// Invalidate the cache. Next request will rebuild it lazily.
    pub async fn invalidate(&self) {
        let mut guard = self.data.lock().await;
        *guard = None;
    }

    /// Get all QMD log entries, optionally filtered by project path.
    pub async fn get_qmd_logs(&self, project_path: Option<&str>) -> Result<Vec<QmdLogEntry>, String> {
        let all = self.get_or_init().await?;

        match project_path {
            Some(pp) => Ok(all.into_iter().filter(|e| e.project_path == pp).collect()),
            None => Ok(all),
        }
    }

    /// Get lightweight stats, optionally filtered by project path.
    pub async fn get_qmd_log_stats(&self, project_path: Option<&str>) -> Result<QmdLogStats, String> {
        let all = self.get_or_init().await?;

        let filtered: Vec<&QmdLogEntry> = match project_path {
            Some(pp) => all.iter().filter(|e| e.project_path == pp).collect(),
            None => all.iter().collect(),
        };

        let total_calls = filtered.len() as u32;
        let error_calls = filtered.iter().filter(|e| e.is_error).count() as u32;

        let mut projects: HashSet<&str> = HashSet::new();
        let mut sessions: HashSet<&str> = HashSet::new();
        let mut by_subcommand: HashMap<String, u32> = HashMap::new();

        for entry in &filtered {
            projects.insert(&entry.project_path);
            sessions.insert(&entry.session_id);
            *by_subcommand.entry(entry.subcommand.clone()).or_insert(0) += 1;
        }

        Ok(QmdLogStats {
            total_calls,
            error_calls,
            unique_projects: projects.len() as u32,
            unique_sessions: sessions.len() as u32,
            by_subcommand,
        })
    }
}
