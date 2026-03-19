use serde::Serialize;
use super::session::SessionSummary;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AnalyticsOverview {
    pub total_sessions: u32,
    pub total_projects: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub sessions_by_date: Vec<DayCount>,      // for activity heatmap
    pub cost_by_date: Vec<DayCost>,           // for cost trend
    pub projects: Vec<ProjectSummary>,
    pub models: Vec<ModelAggregate>,
    pub tools: Vec<ToolAggregate>,
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