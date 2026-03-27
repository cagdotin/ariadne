use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use serde_json::Value;

use crate::models::qmd_logs::QmdLogEntry;

/// Maximum length for the output preview shown in table cells.
const PREVIEW_MAX_LEN: usize = 200;

/// Parse a single session JSONL file and return all detected QMD CLI log entries.
pub fn parse_qmd_logs_from_session(file_path: &Path) -> Result<Vec<QmdLogEntry>, String> {
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open file {}: {}", file_path.display(), e))?;
    let reader = BufReader::new(file);

    let mut session_id = String::new();
    let mut project_path = String::new();
    let mut project_name = String::new();

    // Pending QMD bash calls keyed by toolCallId
    let mut pending: HashMap<String, PendingQmdCall> = HashMap::new();
    let mut results: Vec<QmdLogEntry> = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        let json_value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match json_value.get("type").and_then(|t| t.as_str()) {
            Some("session") => {
                if let Some(id) = json_value.get("id").and_then(|i| i.as_str()) {
                    session_id = id.to_string();
                }
                if let Some(cwd) = json_value.get("cwd").and_then(|c| c.as_str()) {
                    project_path = cwd.to_string();
                    project_name = Path::new(cwd)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
            Some("message") => {
                if let Some(message) = json_value.get("message") {
                    let role = message.get("role").and_then(|r| r.as_str()).unwrap_or("");
                    let timestamp = json_value
                        .get("timestamp")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string();

                    match role {
                        "assistant" => {
                            if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                                for block in content {
                                    if block.get("type").and_then(|t| t.as_str()) != Some("toolCall") {
                                        continue;
                                    }
                                    let tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                    if tool_name != "bash" && tool_name != "Bash" {
                                        continue;
                                    }
                                    // The toolCall block uses "id" as the correlation key,
                                    // while the matching toolResult uses "toolCallId".
                                    // Fall back to "toolCallId" for compatibility.
                                    let tool_call_id = block
                                        .get("id")
                                        .and_then(|id| id.as_str())
                                        .or_else(|| block.get("toolCallId").and_then(|id| id.as_str()));
                                    let tool_call_id = match tool_call_id {
                                        Some(id) => id.to_string(),
                                        None => continue,
                                    };
                                    let command = block
                                        .get("arguments")
                                        .and_then(|a| a.get("command"))
                                        .and_then(|c| c.as_str())
                                        .unwrap_or("");

                                    if !is_qmd_command(command) {
                                        continue;
                                    }

                                    pending.insert(
                                        tool_call_id.clone(),
                                        PendingQmdCall {
                                            tool_call_id,
                                            raw_command: command.to_string(),
                                            timestamp: timestamp.clone(),
                                        },
                                    );
                                }
                            }
                        }
                        "toolResult" => {
                            let tool_call_id = message
                                .get("toolCallId")
                                .and_then(|id| id.as_str())
                                .unwrap_or("");

                            if let Some(call) = pending.remove(tool_call_id) {
                                let is_error = message.get("isError").and_then(|e| e.as_bool()).unwrap_or(false);
                                let output_text = extract_tool_result_text(message);
                                let output_preview = truncate_preview(&output_text, PREVIEW_MAX_LEN);
                                let output_kind = detect_output_kind(&output_text);
                                let parsed = parse_qmd_command(&call.raw_command);

                                results.push(QmdLogEntry {
                                    id: format!("{}:{}", session_id, call.tool_call_id),
                                    session_id: session_id.clone(),
                                    project_path: project_path.clone(),
                                    project_name: project_name.clone(),
                                    timestamp: call.timestamp,
                                    tool_call_id: call.tool_call_id,
                                    raw_command: call.raw_command,
                                    subcommand: parsed.subcommand,
                                    primary_argument: parsed.primary_argument,
                                    index_name: parsed.index_name,
                                    collections: parsed.collections,
                                    is_error,
                                    has_output: true,
                                    output_text,
                                    output_preview,
                                    output_kind,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    // Handle pending calls that never got a tool result
    for (_id, call) in pending {
        let parsed = parse_qmd_command(&call.raw_command);
        results.push(QmdLogEntry {
            id: format!("{}:{}", session_id, call.tool_call_id),
            session_id: session_id.clone(),
            project_path: project_path.clone(),
            project_name: project_name.clone(),
            timestamp: call.timestamp,
            tool_call_id: call.tool_call_id,
            raw_command: call.raw_command,
            subcommand: parsed.subcommand,
            primary_argument: parsed.primary_argument,
            index_name: parsed.index_name,
            collections: parsed.collections,
            is_error: false,
            has_output: false,
            output_text: String::new(),
            output_preview: String::new(),
            output_kind: "unknown".to_string(),
        });
    }

    Ok(results)
}

struct PendingQmdCall {
    tool_call_id: String,
    raw_command: String,
    timestamp: String,
}

struct ParsedQmdCommand {
    subcommand: String,
    primary_argument: Option<String>,
    index_name: Option<String>,
    collections: Vec<String>,
}

/// Detect if a bash command contains a `qmd` CLI invocation.
fn is_qmd_command(command: &str) -> bool {
    // Look for `qmd` as a standalone command token.
    // Handles: `qmd query ...`, `cd foo && qmd query ...`, `qmd query ... | jq ...`
    // Also handles env var prefixes: `BUN_INSTALL="" qmd query ...`
    for segment in command.split(|c: char| c == '|' || c == '&' || c == ';') {
        let trimmed = segment.trim();
        if contains_qmd_invocation(trimmed) {
            return true;
        }
    }
    false
}

/// Check if a command segment contains a qmd invocation, handling env var prefixes.
fn contains_qmd_invocation(segment: &str) -> bool {
    // Direct match
    if segment == "qmd" || segment.starts_with("qmd ") {
        return true;
    }
    // Handle env var prefixes like `FOO=bar qmd query ...`
    // Skip tokens that look like VAR=value assignments
    let mut rest = segment;
    loop {
        rest = rest.trim();
        // Check if current position starts with an env var assignment (WORD=...)
        if let Some(eq_pos) = rest.find('=') {
            let before_eq = &rest[..eq_pos];
            // Env var names are alphanumeric + underscore, starting with letter or underscore
            if !before_eq.is_empty()
                && before_eq.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                && before_eq.chars().next().map_or(false, |c| c.is_ascii_alphabetic() || c == '_')
            {
                // Skip past the value (which might be quoted)
                let after_eq = &rest[eq_pos + 1..];
                let skip = skip_shell_value(after_eq);
                rest = &after_eq[skip..];
                continue;
            }
        }
        break;
    }
    rest = rest.trim();
    rest == "qmd" || rest.starts_with("qmd ")
}

/// Strip leading env var assignments from a command string.
/// e.g. `BUN_INSTALL="" qmd query ...` → `qmd query ...`
fn strip_env_prefixes(s: &str) -> &str {
    let mut rest = s.trim();
    loop {
        // Check if current position starts with an env var assignment
        if let Some(eq_pos) = rest.find('=') {
            let before_eq = &rest[..eq_pos];
            if !before_eq.is_empty()
                && !before_eq.contains(char::is_whitespace)
                && before_eq.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                && before_eq.chars().next().map_or(false, |c| c.is_ascii_alphabetic() || c == '_')
            {
                let after_eq = &rest[eq_pos + 1..];
                let skip = skip_shell_value(after_eq);
                rest = after_eq[skip..].trim();
                continue;
            }
        }
        break;
    }
    rest
}

/// Skip a shell value (possibly quoted) and return number of bytes consumed from `s`.
fn skip_shell_value(s: &str) -> usize {
    if s.starts_with('"') {
        // Double-quoted: find matching close quote
        if let Some(end) = s[1..].find('"') {
            return 1 + end + 1;
        }
    } else if s.starts_with('\'') {
        if let Some(end) = s[1..].find('\'') {
            return 1 + end + 1;
        }
    }
    // Unquoted: consume until whitespace
    s.find(char::is_whitespace).unwrap_or(s.len())
}

/// Known QMD subcommands.
const QMD_SUBCOMMANDS: &[&str] = &[
    "query", "search", "get", "multi-get", "status", "collection",
    "context", "update", "embed", "cleanup", "ls", "paths",
];

/// Best-effort parse a QMD CLI command string.
fn parse_qmd_command(command: &str) -> ParsedQmdCommand {
    // Find the qmd invocation segment
    let qmd_segment = command
        .split(|c: char| c == '|' || c == ';')
        .find(|seg| {
            let t = seg.trim();
            // Handle `&&` splits
            t.split("&&").any(|part| {
                contains_qmd_invocation(part.trim())
            })
        })
        .unwrap_or(command);

    // Extract the `qmd ...` part from potential `cd foo && qmd ...` or `ENV=val qmd ...`
    let qmd_part_raw = qmd_segment
        .split("&&")
        .find(|part| contains_qmd_invocation(part.trim()))
        .unwrap_or(qmd_segment)
        .trim();

    // Strip env var prefixes to get the actual `qmd ...` invocation
    let qmd_part = strip_env_prefixes(qmd_part_raw);

    let tokens = shell_tokenize(qmd_part);

    let mut subcommand = "unknown".to_string();
    let mut primary_argument: Option<String> = None;
    let mut index_name: Option<String> = None;
    let mut collections: Vec<String> = Vec::new();

    // tokens[0] should be "qmd"
    let mut i = 1;

    // Skip any global flags before the subcommand
    while i < tokens.len() {
        let tok = &tokens[i];
        if tok.starts_with('-') {
            i += 1;
            // Skip flag value if it looks like a value flag
            if i < tokens.len() && !tokens[i].starts_with('-') {
                i += 1;
            }
        } else {
            break;
        }
    }

    // Identify subcommand
    if i < tokens.len() {
        let candidate = tokens[i].to_lowercase();
        if QMD_SUBCOMMANDS.contains(&candidate.as_str()) {
            subcommand = candidate;
        }
        i += 1;
    }

    // Parse remaining tokens for flags and positional args
    let mut positional_args: Vec<String> = Vec::new();

    while i < tokens.len() {
        let tok = &tokens[i];
        if tok == "-c" || tok == "--collection" {
            // Next token is a collection name
            i += 1;
            if i < tokens.len() {
                collections.push(tokens[i].clone());
            }
        } else if tok == "-i" || tok == "--index" {
            i += 1;
            if i < tokens.len() {
                index_name = Some(tokens[i].clone());
            }
        } else if tok == "--json" || tok == "--files" || tok == "--full" || tok == "--verbose" || tok == "-v" {
            // Known flags with no value, skip
        } else if tok.starts_with('-') {
            // Unknown flag; skip it and possibly its value
            i += 1;
            if i < tokens.len() && !tokens[i].starts_with('-') {
                // Probably a flag value, skip
            } else {
                continue; // re-examine current token
            }
        } else {
            positional_args.push(tokens[i].clone());
        }
        i += 1;
    }

    // Primary argument is the first positional arg after subcommand
    if !positional_args.is_empty() {
        primary_argument = Some(positional_args[0].clone());
    }

    ParsedQmdCommand {
        subcommand,
        primary_argument,
        index_name,
        collections,
    }
}

/// Simple shell tokenizer that handles quoted strings.
fn shell_tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escape_next = false;

    for ch in input.chars() {
        if escape_next {
            current.push(ch);
            escape_next = false;
            continue;
        }
        if ch == '\\' && !in_single_quote {
            escape_next = true;
            continue;
        }
        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }
        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }
        if ch.is_whitespace() && !in_single_quote && !in_double_quote {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }
        current.push(ch);
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

/// Extract text content from a toolResult message.
fn extract_tool_result_text(message: &Value) -> String {
    if let Some(content) = message.get("content") {
        if let Some(text) = content.as_str() {
            return text.to_string();
        }
        if let Some(arr) = content.as_array() {
            let mut parts = Vec::new();
            for item in arr {
                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                        parts.push(text.to_string());
                    }
                }
            }
            return parts.join("\n");
        }
    }
    String::new()
}

/// Truncate a string for table preview display.
fn truncate_preview(text: &str, max_len: usize) -> String {
    // Take first line or first max_len chars, whichever is shorter
    let first_line = text.lines().next().unwrap_or("");
    if first_line.len() <= max_len {
        first_line.to_string()
    } else {
        let mut end = max_len;
        while !first_line.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        format!("{}…", &first_line[..end])
    }
}

/// Detect output kind based on content.
fn detect_output_kind(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    // Check if it looks like JSON
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            // Check for search result shape
            if val.get("results").is_some() || val.get("hits").is_some() {
                return "search_json".to_string();
            }
            if val.is_array() {
                // Could be a file list
                if let Some(arr) = val.as_array() {
                    if !arr.is_empty() {
                        if arr[0].get("path").is_some() || arr[0].get("file").is_some() {
                            return "files_json".to_string();
                        }
                    }
                }
            }
            return "search_json".to_string(); // generic JSON
        }
    }
    "raw_text".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_qmd_command() {
        assert!(is_qmd_command("qmd query 'something'"));
        assert!(is_qmd_command("cd repo && qmd query -c agents 'something'"));
        assert!(is_qmd_command("qmd search --json something | jq ."));
        assert!(is_qmd_command("qmd status"));
        assert!(is_qmd_command("qmd"));
        // Env var prefix
        assert!(is_qmd_command(r#"BUN_INSTALL="" qmd query -c agents "test""#));
        assert!(is_qmd_command("FOO=bar BAZ=qux qmd search 'hello'"));
        assert!(!is_qmd_command("ls -la"));
        assert!(!is_qmd_command("echo qmd"));
        assert!(!is_qmd_command("grep qmd file.txt"));
        assert!(!is_qmd_command("cat /path/to/qmd/config"));
        // Quoted qmd inside another command must not false-positive
        assert!(!is_qmd_command(r#"echo "qmd query 'hello'""#));
        assert!(!is_qmd_command(r#"echo "qmd query" | grep results"#));
        assert!(!is_qmd_command("cat qmd.log"));
    }

    #[test]
    fn test_parse_qmd_command_basic() {
        let parsed = parse_qmd_command("qmd query 'what is the architecture'");
        assert_eq!(parsed.subcommand, "query");
        assert_eq!(parsed.primary_argument.as_deref(), Some("what is the architecture"));
    }

    #[test]
    fn test_parse_qmd_command_with_collection() {
        let parsed = parse_qmd_command("qmd query -c agents 'how to use tools'");
        assert_eq!(parsed.subcommand, "query");
        assert_eq!(parsed.collections, vec!["agents"]);
        assert_eq!(parsed.primary_argument.as_deref(), Some("how to use tools"));
    }

    #[test]
    fn test_parse_qmd_command_with_cd() {
        let parsed = parse_qmd_command("cd /some/repo && qmd query -c docs 'authentication flow'");
        assert_eq!(parsed.subcommand, "query");
        assert_eq!(parsed.collections, vec!["docs"]);
        assert_eq!(parsed.primary_argument.as_deref(), Some("authentication flow"));
    }

    #[test]
    fn test_parse_qmd_command_with_pipe() {
        // The parser should focus on the qmd segment before the pipe
        let parsed = parse_qmd_command("qmd search --json 'test query' | jq .");
        assert_eq!(parsed.subcommand, "search");
        assert_eq!(parsed.primary_argument.as_deref(), Some("test query"));
    }

    #[test]
    fn test_parse_qmd_command_with_env_prefix() {
        let parsed = parse_qmd_command(r#"BUN_INSTALL="" qmd query -c agents "How do extensions work?""#);
        assert_eq!(parsed.subcommand, "query");
        assert_eq!(parsed.collections, vec!["agents"]);
        assert_eq!(parsed.primary_argument.as_deref(), Some("How do extensions work?"));
    }

    #[test]
    fn test_parse_qmd_command_status() {
        let parsed = parse_qmd_command("qmd status");
        assert_eq!(parsed.subcommand, "status");
        assert!(parsed.primary_argument.is_none());
    }

    #[test]
    fn test_shell_tokenize() {
        let tokens = shell_tokenize("qmd query -c agents 'how are you'");
        assert_eq!(tokens, vec!["qmd", "query", "-c", "agents", "how are you"]);
    }

    #[test]
    fn test_shell_tokenize_double_quotes() {
        let tokens = shell_tokenize(r#"qmd query "hello world""#);
        assert_eq!(tokens, vec!["qmd", "query", "hello world"]);
    }

    #[test]
    fn test_detect_output_kind() {
        assert_eq!(detect_output_kind(""), "unknown");
        assert_eq!(detect_output_kind("some plain text"), "raw_text");
        assert_eq!(detect_output_kind(r#"{"results": []}"#), "search_json");
    }

    #[test]
    fn test_truncate_preview() {
        assert_eq!(truncate_preview("short", 200), "short");
        let long = "a".repeat(300);
        let preview = truncate_preview(&long, 200);
        assert!(preview.len() <= 204); // 200 + "…" (3 bytes)
    }
}
