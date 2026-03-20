use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

use crate::models::session::SessionSummary;
use crate::models::analytics::{AnalyticsOverview, ProjectSummary, DayCount, DayCost, ModelAggregate, ToolAggregate, NameCount, ToolDetailResponse, ProjectToolSummary, ProjectFileStats, DirectoryStat, TimeBreakdown, WeekdayStat, TimeOfDayStat};
use crate::parser::discovery::discover_session_files;
use crate::parser::session::parse_session_file;

#[derive(Debug)]
pub struct SessionCache {
    data: Arc<RwLock<Option<Vec<SessionSummary>>>>,
    last_updated: Arc<RwLock<Option<DateTime<Utc>>>>,
}

impl SessionCache {
    pub fn new() -> Self {
        Self {
            data: Arc::new(RwLock::new(None)),
            last_updated: Arc::new(RwLock::new(None)),
        }
    }

    /// Get all sessions from cache, initializing if needed
    pub async fn get_or_init(&self) -> Result<Vec<SessionSummary>, String> {
        // Check if cache is populated
        let data_guard = self.data.read().await;
        if let Some(sessions) = &*data_guard {
            return Ok(sessions.clone());
        }
        drop(data_guard);

        // Cache is empty, initialize it
        self.resync().await
    }

    /// Force resync - clear cache and re-parse all sessions
    pub async fn resync(&self) -> Result<Vec<SessionSummary>, String> {
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

        // Update cache
        let mut data_guard = self.data.write().await;
        *data_guard = Some(all_sessions.clone());
        drop(data_guard);

        // Update timestamp
        let mut time_guard = self.last_updated.write().await;
        *time_guard = Some(Utc::now());
        drop(time_guard);

        Ok(all_sessions)
    }

    /// Get analytics overview from cached data
    pub async fn get_analytics_overview(&self) -> Result<AnalyticsOverview, String> {
        let all_sessions = self.get_or_init().await?;

        // Aggregate data (same logic as before)
        let total_sessions = all_sessions.len() as u32;
        let total_cost: f64 = all_sessions.iter().map(|s| s.total_cost).sum();
        let input_cost: f64 = all_sessions.iter().map(|s| s.input_cost).sum();
        let output_cost: f64 = all_sessions.iter().map(|s| s.output_cost).sum();
        let cache_read_cost: f64 = all_sessions.iter().map(|s| s.cache_read_cost).sum();
        let cache_write_cost: f64 = all_sessions.iter().map(|s| s.cache_write_cost).sum();
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

        // Aggregate tool detail data
        let mut bash_commands_map: HashMap<String, u32> = HashMap::new();
        let mut read_files_map: HashMap<String, u32> = HashMap::new();
        let mut edit_files_map: HashMap<String, u32> = HashMap::new();
        let mut write_files_map: HashMap<String, u32> = HashMap::new();

        for session in &all_sessions {
            // Aggregate bash commands
            for (command, count) in &session.bash_commands {
                *bash_commands_map.entry(command.clone()).or_insert(0) += count;
            }
            // Aggregate read files
            for (file, count) in &session.read_files {
                *read_files_map.entry(file.clone()).or_insert(0) += count;
            }
            // Aggregate edit files
            for (file, count) in &session.edit_files {
                *edit_files_map.entry(file.clone()).or_insert(0) += count;
            }
            // Aggregate write files
            for (file, count) in &session.write_files {
                *write_files_map.entry(file.clone()).or_insert(0) += count;
            }
        }

        // Convert to top-20 lists and sort by count descending
        let mut top_bash_commands: Vec<NameCount> = bash_commands_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        top_bash_commands.sort_by(|a, b| b.count.cmp(&a.count));
        top_bash_commands.truncate(20);

        let mut top_read_files: Vec<NameCount> = read_files_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        top_read_files.sort_by(|a, b| b.count.cmp(&a.count));
        top_read_files.truncate(20);

        let mut top_edit_files: Vec<NameCount> = edit_files_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        top_edit_files.sort_by(|a, b| b.count.cmp(&a.count));
        top_edit_files.truncate(20);

        let mut top_write_files: Vec<NameCount> = write_files_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        top_write_files.sort_by(|a, b| b.count.cmp(&a.count));
        top_write_files.truncate(20);

        // Get recent sessions (last 20)
        let mut recent_sessions = all_sessions.clone();
        recent_sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        recent_sessions.truncate(20);

        Ok(AnalyticsOverview {
            total_sessions,
            total_projects,
            total_cost,
            input_cost,
            output_cost,
            cache_read_cost,
            cache_write_cost,
            total_tokens,
            sessions_by_date,
            cost_by_date,
            projects,
            models,
            tools,
            top_bash_commands,
            top_read_files,
            top_edit_files,
            top_write_files,
            recent_sessions,
        })
    }

    /// Get sessions for a specific project from cached data
    pub async fn get_project_sessions(&self, project_name: &str) -> Result<Vec<SessionSummary>, String> {
        let all_sessions = self.get_or_init().await?;
        
        let mut project_sessions: Vec<SessionSummary> = all_sessions
            .into_iter()
            .filter(|session| session.project_name == project_name)
            .collect();

        // Sort by started_at descending
        project_sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));

        Ok(project_sessions)
    }

    /// Get a specific session from cached data
    pub async fn get_session_detail(&self, session_id: &str) -> Result<SessionSummary, String> {
        let all_sessions = self.get_or_init().await?;
        
        all_sessions
            .into_iter()
            .find(|session| session.id == session_id)
            .ok_or_else(|| format!("Session with id {} not found", session_id))
    }

    /// Get all sessions, optionally filtered by project name
    pub async fn get_all_sessions(&self, project_name: Option<&str>) -> Result<Vec<SessionSummary>, String> {
        let all_sessions = self.get_or_init().await?;

        let mut filtered: Vec<SessionSummary> = match project_name {
            Some(pn) => all_sessions.into_iter().filter(|s| s.project_name == pn).collect(),
            None => all_sessions,
        };

        // Sort by started_at descending (newest first)
        filtered.sort_by(|a, b| b.started_at.cmp(&a.started_at));

        Ok(filtered)
    }

    /// Get detailed tool usage data, optionally filtered by project
    pub async fn get_tool_details(
        &self,
        tool_name: &str,
        project_name: Option<&str>,
    ) -> Result<ToolDetailResponse, String> {
        let all_sessions = self.get_or_init().await?;

        let filtered: Vec<&SessionSummary> = all_sessions
            .iter()
            .filter(|s| match project_name {
                Some(pn) => s.project_name == pn,
                None => true,
            })
            .collect();

        // Aggregate tool calls/errors
        let mut total_calls: u32 = 0;
        let mut total_errors: u32 = 0;
        for s in &filtered {
            if let Some(tc) = s.tool_calls.get(tool_name) {
                total_calls += tc.calls;
                total_errors += tc.errors;
            }
        }

        // Aggregate items (bash_commands or *_files)
        let mut items_map: HashMap<String, u32> = HashMap::new();
        for s in &filtered {
            let source = match tool_name {
                "bash" => &s.bash_commands,
                "read" => &s.read_files,
                "edit" => &s.edit_files,
                "write" => &s.write_files,
                _ => continue,
            };
            for (key, count) in source {
                *items_map.entry(key.clone()).or_insert(0) += count;
            }
        }
        let mut items: Vec<NameCount> = items_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        items.sort_by(|a, b| b.count.cmp(&a.count));

        // By project breakdown
        let mut project_map: HashMap<String, HashMap<String, u32>> = HashMap::new();
        let mut project_calls: HashMap<String, u32> = HashMap::new();
        for s in &filtered {
            let source = match tool_name {
                "bash" => &s.bash_commands,
                "read" => &s.read_files,
                "edit" => &s.edit_files,
                "write" => &s.write_files,
                _ => continue,
            };
            if source.is_empty() {
                continue;
            }
            let pmap = project_map.entry(s.project_name.clone()).or_default();
            for (key, count) in source {
                *pmap.entry(key.clone()).or_insert(0) += count;
                *project_calls.entry(s.project_name.clone()).or_insert(0) += count;
            }
        }
        let mut by_project: Vec<ProjectToolSummary> = project_map
            .into_iter()
            .map(|(pname, imap)| {
                let mut pitems: Vec<NameCount> = imap
                    .into_iter()
                    .map(|(name, count)| NameCount { name, count })
                    .collect();
                pitems.sort_by(|a, b| b.count.cmp(&a.count));
                pitems.truncate(5);
                ProjectToolSummary {
                    total_calls: project_calls.get(&pname).copied().unwrap_or(0),
                    project_name: pname,
                    items: pitems,
                }
            })
            .collect();
        by_project.sort_by(|a, b| b.total_calls.cmp(&a.total_calls));

        // By date
        let mut date_map: HashMap<String, u32> = HashMap::new();
        for s in &filtered {
            let source = match tool_name {
                "bash" => &s.bash_commands,
                "read" => &s.read_files,
                "edit" => &s.edit_files,
                "write" => &s.write_files,
                _ => continue,
            };
            let day_total: u32 = source.values().sum();
            if day_total == 0 {
                continue;
            }
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s.started_at) {
                let date = dt.format("%Y-%m-%d").to_string();
                *date_map.entry(date).or_insert(0) += day_total;
            }
        }
        let mut by_date: Vec<DayCount> = date_map
            .into_iter()
            .map(|(date, count)| DayCount { date, count })
            .collect();
        by_date.sort_by(|a, b| a.date.cmp(&b.date));

        Ok(ToolDetailResponse {
            tool_name: tool_name.to_string(),
            total_calls,
            total_errors,
            items,
            by_project,
            by_date,
        })
    }

    /// Get file and tool analytics for a specific project
    pub async fn get_project_file_stats(&self, project_name: &str) -> Result<ProjectFileStats, String> {
        let all_sessions = self.get_or_init().await?;

        let project_sessions: Vec<_> = all_sessions
            .iter()
            .filter(|s| s.project_name == project_name)
            .collect();

        let total_sessions = project_sessions.len() as u32;

        // Tool distribution
        let mut tool_map: HashMap<String, u32> = HashMap::new();
        for s in &project_sessions {
            for (name, tc) in &s.tool_calls {
                *tool_map.entry(name.clone()).or_insert(0) += tc.calls;
            }
        }
        let mut tool_distribution: Vec<NameCount> = tool_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        tool_distribution.sort_by(|a, b| b.count.cmp(&a.count));

        // Aggregate file maps
        let mut read_map: HashMap<String, u32> = HashMap::new();
        let mut edit_map: HashMap<String, u32> = HashMap::new();
        let mut write_map: HashMap<String, u32> = HashMap::new();
        let mut bash_map: HashMap<String, u32> = HashMap::new();

        for s in &project_sessions {
            for (k, v) in &s.read_files {
                *read_map.entry(k.clone()).or_insert(0) += v;
            }
            for (k, v) in &s.edit_files {
                *edit_map.entry(k.clone()).or_insert(0) += v;
            }
            for (k, v) in &s.write_files {
                *write_map.entry(k.clone()).or_insert(0) += v;
            }
            for (k, v) in &s.bash_commands {
                *bash_map.entry(k.clone()).or_insert(0) += v;
            }
        }

        let mut read_files: Vec<NameCount> = read_map.iter()
            .map(|(name, &count)| NameCount { name: name.clone(), count })
            .collect();
        read_files.sort_by(|a, b| b.count.cmp(&a.count));

        let mut edit_files: Vec<NameCount> = edit_map.iter()
            .map(|(name, &count)| NameCount { name: name.clone(), count })
            .collect();
        edit_files.sort_by(|a, b| b.count.cmp(&a.count));

        let mut write_files: Vec<NameCount> = write_map.iter()
            .map(|(name, &count)| NameCount { name: name.clone(), count })
            .collect();
        write_files.sort_by(|a, b| b.count.cmp(&a.count));

        let mut bash_commands: Vec<NameCount> = bash_map
            .into_iter()
            .map(|(name, count)| NameCount { name, count })
            .collect();
        bash_commands.sort_by(|a, b| b.count.cmp(&a.count));

        // Directory stats from file paths
        let mut dir_read: HashMap<String, u32> = HashMap::new();
        let mut dir_edit: HashMap<String, u32> = HashMap::new();
        let mut dir_write: HashMap<String, u32> = HashMap::new();

        let parent_dir = |path: &str| -> String {
            let p = std::path::Path::new(path);
            p.parent()
                .map(|d| d.to_string_lossy().into_owned())
                .unwrap_or_else(|| ".".to_string())
        };

        for (path, count) in &read_map {
            *dir_read.entry(parent_dir(path)).or_insert(0) += count;
        }
        for (path, count) in &edit_map {
            *dir_edit.entry(parent_dir(path)).or_insert(0) += count;
        }
        for (path, count) in &write_map {
            *dir_write.entry(parent_dir(path)).or_insert(0) += count;
        }

        let all_dirs: std::collections::HashSet<String> = dir_read.keys()
            .chain(dir_edit.keys())
            .chain(dir_write.keys())
            .cloned()
            .collect();

        let mut directory_stats: Vec<DirectoryStat> = all_dirs
            .into_iter()
            .map(|path| {
                let read_count = dir_read.get(&path).copied().unwrap_or(0);
                let edit_count = dir_edit.get(&path).copied().unwrap_or(0);
                let write_count = dir_write.get(&path).copied().unwrap_or(0);
                let total = read_count + edit_count + write_count;
                DirectoryStat { path, read_count, edit_count, write_count, total }
            })
            .collect();
        directory_stats.sort_by(|a, b| b.total.cmp(&a.total));

        // Activity by date
        let mut date_map: HashMap<String, u32> = HashMap::new();
        for s in &project_sessions {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s.started_at) {
                let date = dt.format("%Y-%m-%d").to_string();
                *date_map.entry(date).or_insert(0) += 1;
            }
        }
        let mut activity_by_date: Vec<DayCount> = date_map
            .into_iter()
            .map(|(date, count)| DayCount { date, count })
            .collect();
        activity_by_date.sort_by(|a, b| a.date.cmp(&b.date));

        Ok(ProjectFileStats {
            project_name: project_name.to_string(),
            total_sessions,
            tool_distribution,
            read_files,
            edit_files,
            write_files,
            bash_commands,
            directory_stats,
            activity_by_date,
        })
    }

    pub async fn get_time_breakdown(&self, range_days: u32) -> Result<TimeBreakdown, String> {
        use chrono::{Datelike, Timelike};

        let sessions = self.get_or_init().await?;

        let now = Utc::now();
        let filtered: Vec<&crate::models::session::SessionSummary> = sessions.iter().filter(|s| {
            if range_days == 0 {
                return true;
            }
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s.started_at) {
                let age = now.signed_duration_since(dt.with_timezone(&Utc));
                age.num_days() < range_days as i64
            } else {
                false
            }
        }).collect();

        let total_sessions = filtered.len() as u32;
        let total_cost: f64 = filtered.iter().map(|s| s.total_cost).sum();
        let total_tokens: u64 = filtered.iter().map(|s| s.total_tokens).sum();
        let avg_cost_per_session = if total_sessions > 0 { total_cost / total_sessions as f64 } else { 0.0 };

        // By weekday: 0=Mon..6=Sun
        let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        let mut weekday_sessions = [0u32; 7];
        let mut weekday_cost = [0f64; 7];

        // By time of day buckets: (label, hour_start, hour_end)
        let time_buckets: [(&str, u32, u32); 5] = [
            ("After midnight", 0, 5),
            ("Morning", 6, 11),
            ("Afternoon", 12, 16),
            ("Evening", 17, 21),
            ("Night", 22, 23),
        ];
        let mut tod_sessions = [0u32; 5];
        let mut tod_cost = [0f64; 5];

        // Daily
        let mut daily_sessions_map: HashMap<String, u32> = HashMap::new();
        let mut daily_cost_map: HashMap<String, f64> = HashMap::new();

        for s in &filtered {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s.started_at) {
                let dt_utc = dt.with_timezone(&Utc);
                // weekday: chrono weekday Mon=0..Sun=6 via num_days_from_monday
                let wd = dt_utc.weekday().num_days_from_monday() as usize;
                weekday_sessions[wd] += 1;
                weekday_cost[wd] += s.total_cost;

                // time of day
                let hour = dt_utc.hour();
                for (i, (_label, h_start, h_end)) in time_buckets.iter().enumerate() {
                    if hour >= *h_start && hour <= *h_end {
                        tod_sessions[i] += 1;
                        tod_cost[i] += s.total_cost;
                        break;
                    }
                }

                // daily
                let date = dt_utc.format("%Y-%m-%d").to_string();
                *daily_sessions_map.entry(date.clone()).or_insert(0) += 1;
                *daily_cost_map.entry(date).or_insert(0.0) += s.total_cost;
            }
        }

        let by_weekday: Vec<WeekdayStat> = (0..7).map(|i| {
            let share = if total_sessions > 0 { weekday_sessions[i] as f64 / total_sessions as f64 * 100.0 } else { 0.0 };
            WeekdayStat {
                day: day_names[i].to_string(),
                sessions: weekday_sessions[i],
                cost: weekday_cost[i],
                share,
            }
        }).collect();

        let by_time_of_day: Vec<TimeOfDayStat> = (0..5).map(|i| {
            let (label, hour_start, hour_end) = time_buckets[i];
            let share = if total_sessions > 0 { tod_sessions[i] as f64 / total_sessions as f64 * 100.0 } else { 0.0 };
            TimeOfDayStat {
                label: label.to_string(),
                hour_start,
                hour_end,
                sessions: tod_sessions[i],
                cost: tod_cost[i],
                share,
            }
        }).collect();

        let mut daily_sessions: Vec<DayCount> = daily_sessions_map.into_iter()
            .map(|(date, count)| DayCount { date, count })
            .collect();
        daily_sessions.sort_by(|a, b| a.date.cmp(&b.date));

        let mut daily_cost: Vec<DayCost> = daily_cost_map.into_iter()
            .map(|(date, cost)| DayCost { date, cost })
            .collect();
        daily_cost.sort_by(|a, b| a.date.cmp(&b.date));

        Ok(TimeBreakdown {
            range_days,
            total_sessions,
            total_cost,
            avg_cost_per_session,
            total_tokens,
            by_weekday,
            by_time_of_day,
            daily_sessions,
            daily_cost,
        })
    }
}