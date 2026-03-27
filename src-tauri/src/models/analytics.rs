use serde::Serialize;
use super::session::SessionSummary;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct WeekdayStat {
    pub day: String,
    pub sessions: u32,
    pub cost: f64,
    pub share: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TimeOfDayStat {
    pub label: String,
    pub hour_start: u32,
    pub hour_end: u32,
    pub sessions: u32,
    pub cost: f64,
    pub share: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TimeBreakdown {
    pub range_days: u32,
    pub total_sessions: u32,
    pub total_cost: f64,
    pub avg_cost_per_session: f64,
    pub total_tokens: u64,
    pub by_weekday: Vec<WeekdayStat>,
    pub by_time_of_day: Vec<TimeOfDayStat>,
    pub daily_sessions: Vec<DayCount>,
    pub daily_cost: Vec<DayCost>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AnalyticsOverview {
    pub total_sessions: u32,
    pub total_projects: u32,
    pub total_cost: f64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_file_size_bytes: u64,
    pub total_tool_calls: u32,
    pub total_tool_errors: u32,
    pub avg_session_duration_seconds: f64,
    pub avg_turns_per_session: f64,
    pub total_compactions: u32,
    pub sessions_by_date: Vec<DayCount>,      // for activity heatmap
    pub cost_by_date: Vec<DayCost>,           // for cost trend
    pub projects: Vec<ProjectSummary>,
    pub models: Vec<ModelAggregate>,
    pub tools: Vec<ToolAggregate>,
    pub top_bash_commands: Vec<NameCount>,   // top 20 most used bash programs
    pub top_read_files: Vec<NameCount>,      // top 20 most read files  
    pub top_edit_files: Vec<NameCount>,      // top 20 most edited files
    pub top_write_files: Vec<NameCount>,     // top 20 most written files
    pub recent_sessions: Vec<SessionSummary>, // last 20
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProjectSummary {
    pub name: String,
    pub path: String,
    pub session_count: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub last_active: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DayCount {
    pub date: String,   // YYYY-MM-DD
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DayCost {
    pub date: String,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ModelAggregate {
    pub model_id: String,
    pub provider: String,
    pub message_count: u32,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ToolAggregate {
    pub name: String,
    pub total_calls: u32,
    pub total_errors: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct NameCount {
    pub name: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ToolDetailResponse {
    pub tool_name: String,
    pub total_calls: u32,
    pub total_errors: u32,
    pub items: Vec<NameCount>,
    pub by_project: Vec<ProjectToolSummary>,
    pub by_date: Vec<DayCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DirectoryStat {
    pub path: String,
    pub read_count: u32,
    pub edit_count: u32,
    pub write_count: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct FileInsightRecord {
    pub path: String,
    pub read_count: u32,
    pub edit_count: u32,
    pub write_count: u32,
    pub total_count: u32,
    pub distinct_session_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct FileSizeResult {
    pub path: String,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProjectFileStats {
    pub project_path: String,
    pub total_sessions: u32,
    pub tool_distribution: Vec<NameCount>,
    pub read_files: Vec<NameCount>,
    pub edit_files: Vec<NameCount>,
    pub write_files: Vec<NameCount>,
    pub bash_commands: Vec<NameCount>,
    pub directory_stats: Vec<DirectoryStat>,
    pub activity_by_date: Vec<DayCount>,
    pub file_insights: Vec<FileInsightRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProjectToolSummary {
    pub project_path: String,
    pub project_name: String,
    pub total_calls: u32,
    pub items: Vec<NameCount>,
}