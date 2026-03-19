use std::collections::HashMap;
use chrono::DateTime;

use crate::models::analytics::{AnalyticsOverview, ProjectSummary, DayCount, DayCost, ModelAggregate, ToolAggregate};
use crate::models::session::SessionSummary;
use crate::parser::discovery::discover_session_files;
use crate::parser::session::parse_session_file;

#[tauri::command]
pub async fn get_analytics_overview() -> Result<AnalyticsOverview, String> {
    let session_files = discover_session_files()?;
    let mut all_sessions = Vec::new();

    // Parse all session files
    for session_file in session_files {
        match parse_session_file(&session_file.path, session_file.dir_name) {
            Ok(session) => all_sessions.push(session),
            Err(e) => {
                eprintln!("Failed to parse session file {}: {}", session_file.path.display(), e);
                // Continue processing other files
            }
        }
    }

    // Aggregate data
    let total_sessions = all_sessions.len() as u32;
    let total_cost: f64 = all_sessions.iter().map(|s| s.total_cost).sum();
    let total_tokens: u64 = all_sessions.iter().map(|s| s.total_tokens).sum();

    // Group by project
    let mut project_map: HashMap<String, ProjectSummary> = HashMap::new();
    for session in &all_sessions {
        let entry = project_map.entry(session.project_name.clone()).or_insert(ProjectSummary {
            name: session.project_name.clone(),
            path: session.project_path.clone(),
            session_count: 0,
            total_cost: 0.0,
            total_tokens: 0,
            last_active: session.started_at.clone(),
        });

        entry.session_count += 1;
        entry.total_cost += session.total_cost;
        entry.total_tokens += session.total_tokens;
        
        // Update last active if this session is newer
        if session.started_at > entry.last_active {
            entry.last_active = session.started_at.clone();
        }
    }

    let projects: Vec<ProjectSummary> = project_map
        .into_values()
        .collect::<Vec<_>>()
        .into_iter()
        .collect();
    
    let total_projects = projects.len() as u32;

    // Group sessions by date
    let mut sessions_by_date_map: HashMap<String, u32> = HashMap::new();
    let mut cost_by_date_map: HashMap<String, f64> = HashMap::new();
    
    for session in &all_sessions {
        if let Ok(parsed_time) = DateTime::parse_from_rfc3339(&session.started_at) {
            let date = parsed_time.format("%Y-%m-%d").to_string();
            *sessions_by_date_map.entry(date.clone()).or_insert(0) += 1;
            *cost_by_date_map.entry(date).or_insert(0.0) += session.total_cost;
        }
    }

    let mut sessions_by_date: Vec<DayCount> = sessions_by_date_map
        .into_iter()
        .map(|(date, count)| DayCount { date, count })
        .collect();
    sessions_by_date.sort_by(|a, b| a.date.cmp(&b.date));

    let mut cost_by_date: Vec<DayCost> = cost_by_date_map
        .into_iter()
        .map(|(date, cost)| DayCost { date, cost })
        .collect();
    cost_by_date.sort_by(|a, b| a.date.cmp(&b.date));

    // Aggregate models
    let mut model_map: HashMap<(String, String), (u32, f64)> = HashMap::new();
    for session in &all_sessions {
        for model_usage in &session.models_used {
            let key = (model_usage.model_id.clone(), model_usage.provider.clone());
            let entry = model_map.entry(key).or_insert((0, 0.0));
            entry.0 += model_usage.message_count;
            entry.1 += session.total_cost / session.models_used.len() as f64; // Approximate cost per model
        }
    }

    let models: Vec<ModelAggregate> = model_map
        .into_iter()
        .map(|((model_id, provider), (message_count, total_cost))| ModelAggregate {
            model_id,
            provider,
            message_count,
            total_cost,
        })
        .collect();

    // Aggregate tools
    let mut tool_map: HashMap<String, (u32, u32)> = HashMap::new();
    for session in &all_sessions {
        for (tool_name, tool_summary) in &session.tool_calls {
            let entry = tool_map.entry(tool_name.clone()).or_insert((0, 0));
            entry.0 += tool_summary.calls;
            entry.1 += tool_summary.errors;
        }
    }

    let tools: Vec<ToolAggregate> = tool_map
        .into_iter()
        .map(|(name, (total_calls, total_errors))| ToolAggregate {
            name,
            total_calls,
            total_errors,
        })
        .collect();

    // Get recent sessions (last 20)
    let mut recent_sessions = all_sessions;
    recent_sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    recent_sessions.truncate(20);

    Ok(AnalyticsOverview {
        total_sessions,
        total_projects,
        total_cost,
        total_tokens,
        sessions_by_date,
        cost_by_date,
        projects,
        models,
        tools,
        recent_sessions,
    })
}

#[tauri::command]
pub async fn get_project_sessions(project_name: String) -> Result<Vec<SessionSummary>, String> {
    let session_files = discover_session_files()?;
    let mut project_sessions = Vec::new();

    // Parse all session files and filter by project
    for session_file in session_files {
        match parse_session_file(&session_file.path, session_file.dir_name) {
            Ok(session) => {
                if session.project_name == project_name {
                    project_sessions.push(session);
                }
            },
            Err(e) => {
                eprintln!("Failed to parse session file {}: {}", session_file.path.display(), e);
                // Continue processing other files
            }
        }
    }

    // Sort by started_at descending
    project_sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(project_sessions)
}

#[tauri::command]
pub async fn get_session_detail(session_id: String) -> Result<SessionSummary, String> {
    let session_files = discover_session_files()?;

    // Find and parse the specific session
    for session_file in session_files {
        match parse_session_file(&session_file.path, session_file.dir_name) {
            Ok(session) => {
                if session.id == session_id {
                    return Ok(session);
                }
            },
            Err(e) => {
                eprintln!("Failed to parse session file {}: {}", session_file.path.display(), e);
                // Continue processing other files
            }
        }
    }

    Err(format!("Session with id {} not found", session_id))
}