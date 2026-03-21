use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::Emitter;

struct SidecarProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

struct QmdSidecarInner {
    process: Mutex<Option<SidecarProcess>>,
    current_index: Mutex<Option<String>>,
    next_id: AtomicU64,
}

/// Manages the QMD sidecar child process.
/// Clone is cheap (Arc).
#[derive(Clone)]
pub struct QmdSidecar {
    inner: Arc<QmdSidecarInner>,
}

fn get_default_db_path() -> Option<PathBuf> {
    let base = if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        PathBuf::from(xdg)
    } else {
        dirs::home_dir()?.join(".cache")
    };
    let path = base.join("qmd").join("index.sqlite");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn find_bridge_script() -> Result<PathBuf, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let repo_root = PathBuf::from(manifest_dir)
        .parent()
        .ok_or_else(|| "Cannot find repo root".to_string())?
        .to_path_buf();
    let bridge = repo_root.join("src-sidecar").join("qmd-bridge.ts");
    if bridge.exists() {
        Ok(bridge)
    } else {
        Err(format!("Bridge script not found at {}", bridge.display()))
    }
}

fn find_runtime() -> Result<(String, Vec<String>), String> {
    // Try bun first
    if Command::new("bun")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
    {
        return Ok(("bun".to_string(), vec!["run".to_string()]));
    }

    // Fall back to node + tsx
    if Command::new("node")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
    {
        return Ok(("npx".to_string(), vec!["tsx".to_string()]));
    }

    Err("Neither bun nor node found on PATH".to_string())
}

impl QmdSidecar {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(QmdSidecarInner {
                process: Mutex::new(None),
                current_index: Mutex::new(None),
                next_id: AtomicU64::new(1),
            }),
        }
    }

    /// Ensure the sidecar process is running. Spawns it if not.
    /// Blocking — call from spawn_blocking.
    pub fn ensure_running(&self) -> Result<(), String> {
        let mut guard = self
            .inner
            .process
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;

        // Check if process is still alive
        if let Some(ref mut proc) = *guard {
            match proc.child.try_wait() {
                Ok(Some(_status)) => {
                    // Process exited, clear and respawn
                    *guard = None;
                    // Also clear current_index since the process died
                    if let Ok(mut ci) = self.inner.current_index.lock() {
                        *ci = None;
                    }
                }
                Ok(None) => {
                    // Still running
                    return Ok(());
                }
                Err(_) => {
                    *guard = None;
                    if let Ok(mut ci) = self.inner.current_index.lock() {
                        *ci = None;
                    }
                }
            }
        }

        // Spawn the sidecar — use default db path if available, otherwise
        // just start with a placeholder (the first ensure_index call will switch)
        let bridge_script = find_bridge_script()?;
        let (runtime, runtime_args) = find_runtime()?;

        let db_path = get_default_db_path();

        let mut cmd = Command::new(&runtime);
        for arg in &runtime_args {
            cmd.arg(arg);
        }
        cmd.arg(bridge_script.to_string_lossy().as_ref());
        if let Some(ref p) = db_path {
            cmd.arg("--db-path");
            cmd.arg(p.to_string_lossy().as_ref());
        }
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture sidecar stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture sidecar stdout".to_string())?;

        // Record the initial index
        let initial_index = db_path.map(|p| p.to_string_lossy().to_string());

        *guard = Some(SidecarProcess {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        });

        // Verify with ping — must release the lock first since send_and_read needs it
        drop(guard);
        let ping_result = self.send_and_read("ping", json!({}))?;
        if ping_result.get("ok") != Some(&json!(true)) {
            return Err(format!("Sidecar ping failed: {:?}", ping_result));
        }

        // Set the current index after successful ping
        if let Ok(mut ci) = self.inner.current_index.lock() {
            *ci = initial_index;
        }

        Ok(())
    }

    /// Ensure the sidecar has the specified index open.
    /// If the current index differs, sends switch_index first.
    /// Blocking — call from spawn_blocking.
    pub fn ensure_index(&self, db_path: &str) -> Result<(), String> {
        self.ensure_running()?;
        let current = self
            .inner
            .current_index
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        if current.as_deref() != Some(db_path) {
            // Need to release the lock before calling send_and_read (which takes process lock)
            drop(current);
            self.send_and_read("switch_index", json!({ "db_path": db_path }))?;
            let mut current = self
                .inner
                .current_index
                .lock()
                .map_err(|e| format!("Lock poisoned: {}", e))?;
            *current = Some(db_path.to_string());
        }
        Ok(())
    }

    /// Send a JSON-RPC request and read the response. Skips progress events.
    /// Blocking — call from spawn_blocking.
    fn send_and_read(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);

        let request = json!({
            "id": id,
            "method": method,
            "params": params,
        });

        let mut guard = self
            .inner
            .process
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        let proc = guard
            .as_mut()
            .ok_or_else(|| "Sidecar not running".to_string())?;

        // Write request
        let mut request_str = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;
        request_str.push('\n');
        proc.stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        proc.stdin
            .flush()
            .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;

        // Read response lines until matching id with result/error
        loop {
            let mut line = String::new();
            let bytes_read = proc
                .stdout
                .read_line(&mut line)
                .map_err(|e| format!("Failed to read from sidecar stdout: {}", e))?;

            if bytes_read == 0 {
                return Err("Sidecar process closed stdout unexpectedly".to_string());
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let msg: Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse sidecar response: {} (line: {})", e, trimmed))?;

            if msg.get("id").and_then(|v| v.as_u64()) != Some(id) {
                continue;
            }

            // Skip progress events
            if msg.get("event").is_some() {
                continue;
            }

            if let Some(error) = msg.get("error") {
                let error_msg = error
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown sidecar error");
                return Err(error_msg.to_string());
            }

            if let Some(result) = msg.get("result") {
                return Ok(result.clone());
            }

            return Err(format!("Unexpected sidecar response: {}", trimmed));
        }
    }

    /// Send a JSON-RPC request and read the response, forwarding progress events.
    /// Blocking — call from spawn_blocking.
    fn send_and_read_with_progress(
        &self,
        method: &str,
        params: Value,
        app: &tauri::AppHandle,
        event_name: &str,
    ) -> Result<Value, String> {
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);

        let request = json!({
            "id": id,
            "method": method,
            "params": params,
        });

        let mut guard = self
            .inner
            .process
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        let proc = guard
            .as_mut()
            .ok_or_else(|| "Sidecar not running".to_string())?;

        // Write request
        let mut request_str = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;
        request_str.push('\n');
        proc.stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        proc.stdin
            .flush()
            .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;

        // Read response lines, forwarding progress events
        loop {
            let mut line = String::new();
            let bytes_read = proc
                .stdout
                .read_line(&mut line)
                .map_err(|e| format!("Failed to read from sidecar stdout: {}", e))?;

            if bytes_read == 0 {
                return Err("Sidecar process closed stdout unexpectedly".to_string());
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let msg: Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse sidecar response: {} (line: {})", e, trimmed))?;

            if msg.get("id").and_then(|v| v.as_u64()) != Some(id) {
                continue;
            }

            // Forward progress events to frontend
            if msg.get("event").is_some() {
                if let Some(data) = msg.get("data") {
                    let _ = app.emit(event_name, data.clone());
                }
                continue;
            }

            if let Some(error) = msg.get("error") {
                let error_msg = error
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown sidecar error");
                return Err(error_msg.to_string());
            }

            if let Some(result) = msg.get("result") {
                return Ok(result.clone());
            }

            return Err(format!("Unexpected sidecar response: {}", trimmed));
        }
    }

    /// Public blocking call — ensures sidecar is running, sends request, returns result.
    /// Call from within `tokio::task::spawn_blocking`.
    pub fn call_blocking(&self, method: &str, params: Value) -> Result<Value, String> {
        self.ensure_running()?;
        self.send_and_read(method, params)
    }

    /// Public blocking call with progress — ensures sidecar is running, streams progress events.
    /// Call from within `tokio::task::spawn_blocking`.
    pub fn call_with_progress_blocking(
        &self,
        method: &str,
        params: Value,
        app: &tauri::AppHandle,
        event_name: &str,
    ) -> Result<Value, String> {
        self.ensure_running()?;
        self.send_and_read_with_progress(method, params, app, event_name)
    }

    /// Shutdown the sidecar process.
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.inner.process.lock() {
            if let Some(mut proc) = guard.take() {
                // Drop stdin to signal EOF
                drop(proc.stdin);
                // Try to wait briefly, then kill
                match proc.child.try_wait() {
                    Ok(Some(_)) => {}
                    _ => {
                        let _ = proc.child.kill();
                        let _ = proc.child.wait();
                    }
                }
            }
        }
        if let Ok(mut ci) = self.inner.current_index.lock() {
            *ci = None;
        }
    }
}

impl Drop for QmdSidecarInner {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(mut proc) = guard.take() {
                drop(proc.stdin);
                match proc.child.try_wait() {
                    Ok(Some(_)) => {}
                    _ => {
                        let _ = proc.child.kill();
                        let _ = proc.child.wait();
                    }
                }
            }
        }
    }
}
