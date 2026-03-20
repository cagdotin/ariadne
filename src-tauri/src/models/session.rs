use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionSummary {
    pub id: String,                    // UUID from session header
    pub project_path: String,          // decoded cwd from session header
    pub project_name: String,          // last path segment of cwd
    pub session_dir: String,           // encoded directory name
    pub file_name: String,             // .jsonl filename
    pub file_size_bytes: u64,
    pub started_at: String,            // ISO timestamp from session header
    pub ended_at: Option<String>,      // timestamp of last event
    pub duration_seconds: Option<f64>,
    pub title: Option<String>,         // from session_info event if present

    // Costs
    pub total_cost: f64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,

    // Tokens
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,

    // Activity
    pub user_message_count: u32,
    pub assistant_message_count: u32,
    pub tool_result_count: u32,
    pub turn_count: u32,              // assistant messages with stop
    pub compaction_count: u32,

    // Tool breakdown
    pub tool_calls: HashMap<String, ToolCallSummary>,

    // Tool call details
    pub bash_commands: HashMap<String, u32>,  // program name → call count
    pub read_files: HashMap<String, u32>,     // file path → read count
    pub edit_files: HashMap<String, u32>,     // file path → edit count
    pub write_files: HashMap<String, u32>,    // file path → write count

    // Models used
    pub models_used: Vec<ModelUsage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ToolCallSummary {
    pub name: String,
    pub calls: u32,
    pub errors: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ModelUsage {
    pub model_id: String,
    pub provider: String,
    pub message_count: u32,
}