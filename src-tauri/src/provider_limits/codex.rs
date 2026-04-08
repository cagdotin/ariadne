use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::models::provider_limits::{
    ProviderCredits, ProviderLimitSnapshot, ProviderLimitWindow, SnapshotStatus, SourceConfidence,
};

// ---------------------------------------------------------------------------
// Codex app-server RPC response shapes (camelCase from the protocol)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitsResult {
    rate_limits: RateLimitSnapshot,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitSnapshot {
    primary: Option<RateLimitWindow>,
    secondary: Option<RateLimitWindow>,
    credits: Option<CreditsSnapshot>,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitWindow {
    used_percent: f64,
    window_duration_mins: Option<u32>,
    resets_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreditsSnapshot {
    has_credits: bool,
    unlimited: bool,
    balance: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AccountResult {
    account: AccountInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountInfo {
    #[serde(rename = "type")]
    _auth_type: String,
    email: Option<String>,
    plan_type: Option<String>,
}

// ---------------------------------------------------------------------------
// Session log fallback shapes (snake_case from JSONL files)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct SessionLogRateLimits {
    primary: Option<SessionLogWindow>,
    secondary: Option<SessionLogWindow>,
    credits: Option<SessionLogCredits>,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SessionLogWindow {
    used_percent: f64,
    window_minutes: Option<u32>,
    resets_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct SessionLogCredits {
    has_credits: Option<bool>,
    unlimited: Option<bool>,
    balance: Option<String>,
}

/// Stale-after threshold in seconds (15 minutes).
const STALE_AFTER_SECONDS: u64 = 900;

/// Timeout for the entire app-server probe in seconds.
const PROBE_TIMEOUT_SECONDS: u64 = 15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Fetch Codex provider limits. Tries the app-server probe first, falls back
/// to the most recent session log entry with rate_limits.
pub async fn fetch_codex_limits() -> ProviderLimitSnapshot {
    match probe_app_server().await {
        Ok(snapshot) => snapshot,
        Err(rpc_err) => {
            eprintln!("[provider_limits::codex] app-server probe failed: {rpc_err}");
            match fallback_session_logs().await {
                Ok(snapshot) => snapshot,
                Err(log_err) => {
                    eprintln!("[provider_limits::codex] session log fallback failed: {log_err}");
                    make_error_snapshot(format!("app-server: {rpc_err}; logs: {log_err}"))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// App-server probe
// ---------------------------------------------------------------------------

async fn probe_app_server() -> Result<ProviderLimitSnapshot, String> {
    let codex_bin = find_codex_binary()?;

    let mut child = Command::new(&codex_bin)
        .arg("app-server")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn codex app-server: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or("Failed to open stdin on codex app-server")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to open stdout on codex app-server")?;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(PROBE_TIMEOUT_SECONDS),
        run_rpc_exchange(stdin, stdout),
    )
    .await
    .map_err(|_| "codex app-server probe timed out".to_string())?;

    // Ensure the child is killed regardless of outcome.
    let _ = child.kill().await;

    result
}

async fn run_rpc_exchange(
    mut stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
) -> Result<ProviderLimitSnapshot, String> {
    let mut reader = BufReader::new(stdout).lines();

    // 1. Initialize
    let init_msg = json!({
        "method": "initialize",
        "id": 1,
        "params": {
            "clientInfo": {
                "name": "ariadne",
                "title": null,
                "version": "0.1.0"
            }
        }
    });
    send_line(&mut stdin, &init_msg).await?;
    read_response(&mut reader, 1).await?; // consume init response

    // 2. account/rateLimits/read
    let limits_msg = json!({
        "method": "account/rateLimits/read",
        "id": 2
    });
    send_line(&mut stdin, &limits_msg).await?;
    let limits_resp = read_response(&mut reader, 2).await?;

    // 3. account/read
    let account_msg = json!({
        "method": "account/read",
        "id": 3,
        "params": { "refreshToken": false }
    });
    send_line(&mut stdin, &account_msg).await?;
    let account_resp = read_response(&mut reader, 3).await?;

    // Parse rate limits
    let limits_result: RateLimitsResult = serde_json::from_value(limits_resp)
        .map_err(|e| format!("Failed to parse rateLimits response: {e}"))?;

    // Parse account (optional — don't fail if this doesn't parse)
    let account_result: Option<AccountResult> =
        serde_json::from_value(account_resp).ok();

    let now = Utc::now();
    let snap = &limits_result.rate_limits;

    let mut windows = Vec::new();
    if let Some(ref primary) = snap.primary {
        windows.push(normalize_window("primary", "Primary (5h)", primary));
    }
    if let Some(ref secondary) = snap.secondary {
        windows.push(normalize_window("secondary", "Secondary (7d)", secondary));
    }

    let credits = snap.credits.as_ref().map(|c| ProviderCredits {
        has_credits: c.has_credits,
        unlimited: c.unlimited,
        balance: c.balance.clone(),
    });

    let account_label = account_result
        .as_ref()
        .and_then(|a| a.account.email.clone());

    let plan_type = snap
        .plan_type
        .clone()
        .or_else(|| account_result.and_then(|a| a.account.plan_type));

    Ok(ProviderLimitSnapshot {
        provider_id: "codex".to_string(),
        provider_label: "Codex".to_string(),
        account_label,
        plan_type,
        source: "codex-app-server".to_string(),
        source_confidence: SourceConfidence::High,
        status: SnapshotStatus::Fresh,
        fetched_at: now.to_rfc3339(),
        stale_after_seconds: STALE_AFTER_SECONDS,
        windows,
        credits,
        error_message: None,
    })
}

async fn send_line(
    stdin: &mut tokio::process::ChildStdin,
    msg: &Value,
) -> Result<(), String> {
    let mut line = serde_json::to_string(msg).map_err(|e| format!("JSON serialize error: {e}"))?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to codex stdin: {e}"))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush codex stdin: {e}"))?;
    Ok(())
}

async fn read_response(
    reader: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    expected_id: u32,
) -> Result<Value, String> {
    // Read lines until we get a response matching the expected ID.
    // The server may emit notifications between responses.
    loop {
        let line = reader
            .next_line()
            .await
            .map_err(|e| format!("Failed to read from codex stdout: {e}"))?
            .ok_or("codex app-server closed stdout unexpectedly")?;

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("Malformed JSON from codex: {e}"))?;

        // Check if this is a response (has "id" field) matching our expected ID.
        if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
            if id == expected_id as u64 {
                // Check for RPC error
                if let Some(err) = parsed.get("error") {
                    return Err(format!("codex RPC error: {err}"));
                }
                if let Some(result) = parsed.get("result") {
                    return Ok(result.clone());
                }
                return Err("codex RPC response missing 'result' field".to_string());
            }
        }
        // Otherwise it's a notification or a response for a different ID; skip.
    }
}

fn normalize_window(id: &str, label: &str, w: &RateLimitWindow) -> ProviderLimitWindow {
    let resets_at_iso = w.resets_at.and_then(|ts| {
        Utc.timestamp_opt(ts, 0)
            .single()
            .map(|dt| dt.to_rfc3339())
    });

    ProviderLimitWindow {
        id: id.to_string(),
        label: label.to_string(),
        used_percent: Some(w.used_percent),
        remaining_percent: Some(100.0 - w.used_percent),
        window_minutes: w.window_duration_mins,
        resets_at: resets_at_iso,
    }
}

// ---------------------------------------------------------------------------
// Session log fallback
// ---------------------------------------------------------------------------

async fn fallback_session_logs() -> Result<ProviderLimitSnapshot, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let sessions_dir = home.join(".codex").join("sessions");

    if !sessions_dir.exists() {
        return Err("~/.codex/sessions does not exist".to_string());
    }

    // Collect all .jsonl files, sorted by modified time descending.
    let mut jsonl_files: Vec<PathBuf> = Vec::new();
    collect_jsonl_files(&sessions_dir, &mut jsonl_files);

    if jsonl_files.is_empty() {
        return Err("No session log files found".to_string());
    }

    // Sort by modified time descending (newest first).
    jsonl_files.sort_by(|a, b| {
        let ma = std::fs::metadata(a)
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        let mb = std::fs::metadata(b)
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        mb.cmp(&ma)
    });

    // Scan recent files (limit to newest 20) for the latest rate_limits entry.
    for path in jsonl_files.iter().take(20) {
        if let Some(snapshot) = try_extract_rate_limits(path)? {
            return Ok(snapshot);
        }
    }

    Err("No rate_limits found in recent session logs".to_string())
}

fn collect_jsonl_files(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_jsonl_files(&path, out);
            } else if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                out.push(path);
            }
        }
    }
}

fn try_extract_rate_limits(
    path: &std::path::Path,
) -> Result<Option<ProviderLimitSnapshot>, String> {
    use std::io::{BufRead, BufReader};

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let reader = BufReader::new(file);

    let mut last_rate_limits: Option<SessionLogRateLimits> = None;
    let mut last_timestamp: Option<String> = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Read error in {}: {e}", path.display()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.contains("rate_limits") {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<Value>(trimmed) {
            // Try to extract rate_limits from the payload
            if let Some(payload) = entry.get("payload") {
                if let Some(rl_val) = payload.get("rate_limits") {
                    if let Ok(rl) = serde_json::from_value::<SessionLogRateLimits>(rl_val.clone()) {
                        last_timestamp = entry
                            .get("timestamp")
                            .and_then(|t| t.as_str())
                            .map(String::from);
                        last_rate_limits = Some(rl);
                    }
                }
            }
        }
    }

    let rl = match last_rate_limits {
        Some(rl) => rl,
        None => return Ok(None),
    };

    let now = Utc::now();

    // Determine age — if we have a timestamp from the log, compute staleness.
    let (status, fetched_at) = if let Some(ref ts) = last_timestamp {
        if let Ok(dt) = DateTime::parse_from_rfc3339(ts) {
            let age_secs = now
                .signed_duration_since(dt.with_timezone(&Utc))
                .num_seconds()
                .unsigned_abs();
            let st = if age_secs <= STALE_AFTER_SECONDS {
                SnapshotStatus::Fresh
            } else {
                SnapshotStatus::Stale
            };
            (st, ts.clone())
        } else {
            (SnapshotStatus::Stale, now.to_rfc3339())
        }
    } else {
        (SnapshotStatus::Stale, now.to_rfc3339())
    };

    let mut windows = Vec::new();
    if let Some(ref primary) = rl.primary {
        windows.push(normalize_log_window("primary", "Primary (5h)", primary));
    }
    if let Some(ref secondary) = rl.secondary {
        windows.push(normalize_log_window(
            "secondary",
            "Secondary (7d)",
            secondary,
        ));
    }

    let credits = rl.credits.as_ref().map(|c| ProviderCredits {
        has_credits: c.has_credits.unwrap_or(false),
        unlimited: c.unlimited.unwrap_or(false),
        balance: c.balance.clone(),
    });

    Ok(Some(ProviderLimitSnapshot {
        provider_id: "codex".to_string(),
        provider_label: "Codex".to_string(),
        account_label: None,
        plan_type: rl.plan_type,
        source: "codex-session-log".to_string(),
        source_confidence: SourceConfidence::Medium,
        status,
        fetched_at,
        stale_after_seconds: STALE_AFTER_SECONDS,
        windows,
        credits,
        error_message: None,
    }))
}

fn normalize_log_window(
    id: &str,
    label: &str,
    w: &SessionLogWindow,
) -> ProviderLimitWindow {
    let resets_at_iso = w.resets_at.and_then(|ts| {
        Utc.timestamp_opt(ts, 0)
            .single()
            .map(|dt| dt.to_rfc3339())
    });

    ProviderLimitWindow {
        id: id.to_string(),
        label: label.to_string(),
        used_percent: Some(w.used_percent),
        remaining_percent: Some(100.0 - w.used_percent),
        window_minutes: w.window_minutes,
        resets_at: resets_at_iso,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn find_codex_binary() -> Result<String, String> {
    // Check common locations
    let candidates = [
        // Bun global installs
        dirs::home_dir().map(|h| h.join(".bun/bin/codex")),
        // Homebrew
        Some(PathBuf::from("/opt/homebrew/bin/codex")),
        Some(PathBuf::from("/usr/local/bin/codex")),
    ];

    for candidate in &candidates {
        if let Some(path) = candidate {
            if path.exists() {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    // Fall back to PATH lookup via `which`
    if let Ok(output) = std::process::Command::new("which")
        .arg("codex")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    Err("codex binary not found — is Codex CLI installed?".to_string())
}

fn make_error_snapshot(error_message: String) -> ProviderLimitSnapshot {
    ProviderLimitSnapshot {
        provider_id: "codex".to_string(),
        provider_label: "Codex".to_string(),
        account_label: None,
        plan_type: None,
        source: "none".to_string(),
        source_confidence: SourceConfidence::Low,
        status: SnapshotStatus::Error,
        fetched_at: Utc::now().to_rfc3339(),
        stale_after_seconds: STALE_AFTER_SECONDS,
        windows: vec![],
        credits: None,
        error_message: Some(error_message),
    }
}
