use serde::Serialize;
use std::collections::HashMap;

/// A single detected QMD CLI invocation from a session file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct QmdLogEntry {
    /// Stable unique ID: `{session_id}:{tool_call_id}`
    pub id: String,
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub timestamp: String,
    pub tool_call_id: String,
    pub raw_command: String,
    /// Best-effort parsed subcommand (query, search, get, multi-get, status, collection, context, update, embed, cleanup, ls, paths, unknown)
    pub subcommand: String,
    /// Parsed primary argument if detectable (e.g. query text, path)
    pub primary_argument: Option<String>,
    /// Parsed index name if detectable
    pub index_name: Option<String>,
    /// Parsed collection filters if detectable
    pub collections: Vec<String>,
    pub is_error: bool,
    /// Whether the tool result was found for this call
    pub has_output: bool,
    /// Full matched tool-result text
    pub output_text: String,
    /// Short preview for table display (truncated)
    pub output_preview: String,
    /// Display hint: raw_text, search_json, files_json, unknown
    pub output_kind: String,
}

/// Lightweight stats payload for badges and summary cards.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct QmdLogStats {
    pub total_calls: u32,
    pub error_calls: u32,
    pub unique_projects: u32,
    pub unique_sessions: u32,
    pub by_subcommand: HashMap<String, u32>,
}
