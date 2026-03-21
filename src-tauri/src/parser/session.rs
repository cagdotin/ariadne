use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use serde_json::Value;
use chrono::DateTime;

use crate::models::session::{SessionSummary, ToolCallSummary, ModelUsage};

pub fn parse_session_file(file_path: &Path, dir_name: String) -> Result<SessionSummary, String> {
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open file {}: {}", file_path.display(), e))?;
    
    let reader = BufReader::new(file);
    let mut session_summary = SessionSummary::default();
    
    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    
    let file_size = file_path
        .metadata()
        .map(|m| m.len())
        .unwrap_or(0);

    session_summary.session_dir = dir_name;
    session_summary.file_name = file_name;
    session_summary.file_size_bytes = file_size;

    let mut last_timestamp: Option<String> = None;
    let mut tool_call_counts: HashMap<String, ToolCallSummary> = HashMap::new();
    let mut model_usage_map: HashMap<(String, String), u32> = HashMap::new();
    
    for (line_num, line) in reader.lines().enumerate() {
        let line = match line {
            Ok(line) => line,
            Err(e) => {
                eprintln!("Failed to read line {} in {}: {}", line_num, file_path.display(), e);
                continue;
            }
        };

        let json_value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                // Skip malformed lines gracefully
                continue;
            }
        };

        // Update last timestamp
        if let Some(timestamp) = json_value.get("timestamp").and_then(|t| t.as_str()) {
            last_timestamp = Some(timestamp.to_string());
        }

        // Parse based on event type
        match json_value.get("type").and_then(|t| t.as_str()) {
            Some("session") => {
                if let Some(id) = json_value.get("id").and_then(|i| i.as_str()) {
                    session_summary.id = id.to_string();
                }
                if let Some(timestamp) = json_value.get("timestamp").and_then(|t| t.as_str()) {
                    session_summary.started_at = timestamp.to_string();
                }
                if let Some(cwd) = json_value.get("cwd").and_then(|c| c.as_str()) {
                    session_summary.project_path = cwd.to_string();
                    // Extract project name as the last path segment
                    session_summary.project_name = Path::new(cwd)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                }
            },
            Some("session_info") => {
                if let Some(name) = json_value.get("name").and_then(|n| n.as_str()) {
                    session_summary.title = Some(name.to_string());
                }
            },
            Some("model_change") => {
                // Track model changes if needed
            },
            Some("message") => {
                if let Some(message) = json_value.get("message") {
                    match message.get("role").and_then(|r| r.as_str()) {
                        Some("user") => {
                            session_summary.user_message_count += 1;
                        },
                        Some("assistant") => {
                            session_summary.assistant_message_count += 1;
                            
                            // Check for stop reason to count turns
                            if message.get("stopReason").is_some() {
                                session_summary.turn_count += 1;
                            }

                            // Extract tool call parameters from content blocks
                            if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                                for block in content {
                                    if block.get("type").and_then(|t| t.as_str()) == Some("toolCall") {
                                        let tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                        let arguments = block.get("arguments");

                                        match tool_name {
                                            "bash" => {
                                                if let Some(cmd) = arguments.and_then(|a| a.get("command")).and_then(|c| c.as_str()) {
                                                    // Extract the program name (first token of the command)
                                                    let program = cmd.trim()
                                                        .split_whitespace()
                                                        .next()
                                                        .unwrap_or(cmd)
                                                        .to_string();
                                                    *session_summary.bash_commands.entry(program).or_insert(0) += 1;
                                                }
                                            },
                                            "read" | "Read" => {
                                                if let Some(path) = arguments.and_then(|a| a.get("path")).and_then(|p| p.as_str()) {
                                                    *session_summary.read_files.entry(path.to_string()).or_insert(0) += 1;
                                                }
                                            },
                                            "edit" | "Edit" => {
                                                if let Some(path) = arguments.and_then(|a| a.get("path")).and_then(|p| p.as_str()) {
                                                    *session_summary.edit_files.entry(path.to_string()).or_insert(0) += 1;
                                                }
                                            },
                                            "write" | "Write" => {
                                                if let Some(path) = arguments.and_then(|a| a.get("path")).and_then(|p| p.as_str()) {
                                                    *session_summary.write_files.entry(path.to_string()).or_insert(0) += 1;
                                                }
                                            },
                                            _ => {}
                                        }
                                    }
                                }
                            }

                            // Extract usage information (camelCase in JSON)
                            if let Some(usage) = message.get("usage") {
                                if let Some(input) = usage.get("input").and_then(|i| i.as_u64()) {
                                    session_summary.input_tokens += input;
                                }
                                if let Some(output) = usage.get("output").and_then(|o| o.as_u64()) {
                                    session_summary.output_tokens += output;
                                }
                                if let Some(cache_read) = usage.get("cacheRead").and_then(|c| c.as_u64()) {
                                    session_summary.cache_read_tokens += cache_read;
                                }
                                if let Some(cache_write) = usage.get("cacheWrite").and_then(|c| c.as_u64()) {
                                    session_summary.cache_write_tokens += cache_write;
                                }
                                if let Some(total) = usage.get("totalTokens").and_then(|t| t.as_u64()) {
                                    session_summary.total_tokens += total;
                                }

                                // Extract cost information
                                if let Some(cost) = usage.get("cost") {
                                    if let Some(input_cost) = cost.get("input").and_then(|i| i.as_f64()) {
                                        session_summary.input_cost += input_cost;
                                    }
                                    if let Some(output_cost) = cost.get("output").and_then(|o| o.as_f64()) {
                                        session_summary.output_cost += output_cost;
                                    }
                                    if let Some(cache_read_cost) = cost.get("cacheRead").and_then(|c| c.as_f64()) {
                                        session_summary.cache_read_cost += cache_read_cost;
                                    }
                                    if let Some(cache_write_cost) = cost.get("cacheWrite").and_then(|c| c.as_f64()) {
                                        session_summary.cache_write_cost += cache_write_cost;
                                    }
                                    if let Some(total_cost) = cost.get("total").and_then(|t| t.as_f64()) {
                                        session_summary.total_cost += total_cost;
                                    }
                                }
                            }

                            // Track model usage
                            if let (Some(model), Some(provider)) = (
                                message.get("model").and_then(|m| m.as_str()),
                                message.get("provider").and_then(|p| p.as_str())
                            ) {
                                let key = (model.to_string(), provider.to_string());
                                *model_usage_map.entry(key).or_insert(0) += 1;
                            }
                        },
                        Some("toolResult") => {
                            session_summary.tool_result_count += 1;
                            
                            // Track tool usage
                            if let Some(tool_name) = message.get("toolName").and_then(|t| t.as_str()) {
                                let is_error = message.get("isError").and_then(|e| e.as_bool()).unwrap_or(false);
                                
                                let entry = tool_call_counts.entry(tool_name.to_string()).or_insert(ToolCallSummary {
                                    name: tool_name.to_string(),
                                    calls: 0,
                                    errors: 0,
                                });
                                
                                entry.calls += 1;
                                if is_error {
                                    entry.errors += 1;
                                }
                            }
                        },
                        _ => {}
                    }
                }
            },
            Some("compaction") => {
                session_summary.compaction_count += 1;
            },
            _ => {
                // Skip unknown event types
            }
        }
    }

    // Set end timestamp and calculate duration
    session_summary.ended_at = last_timestamp.clone();
    if let Some(end) = &last_timestamp {
        if let (Ok(start_time), Ok(end_time)) = (
            DateTime::parse_from_rfc3339(&session_summary.started_at),
            DateTime::parse_from_rfc3339(end)
        ) {
            let duration = end_time.timestamp() - start_time.timestamp();
            session_summary.duration_seconds = Some(duration as f64);
        }
    }

    // Convert tool calls map to HashMap
    session_summary.tool_calls = tool_call_counts;

    // Convert model usage map to vector
    session_summary.models_used = model_usage_map
        .into_iter()
        .map(|((model_id, provider), message_count)| ModelUsage {
            model_id,
            provider,
            message_count,
        })
        .collect();

    Ok(session_summary)
}

impl Default for SessionSummary {
    fn default() -> Self {
        SessionSummary {
            id: String::new(),
            project_path: String::new(),
            project_name: String::new(),
            session_dir: String::new(),
            file_name: String::new(),
            file_size_bytes: 0,
            started_at: String::new(),
            ended_at: None,
            duration_seconds: None,
            title: None,
            total_cost: 0.0,
            input_cost: 0.0,
            output_cost: 0.0,
            cache_read_cost: 0.0,
            cache_write_cost: 0.0,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            user_message_count: 0,
            assistant_message_count: 0,
            tool_result_count: 0,
            turn_count: 0,
            compaction_count: 0,
            tool_calls: HashMap::new(),
            bash_commands: HashMap::new(),
            read_files: HashMap::new(),
            edit_files: HashMap::new(),
            write_files: HashMap::new(),
            models_used: Vec::new(),
        }
    }
}