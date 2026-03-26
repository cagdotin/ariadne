# Ariadne — Rebuild Spec 02: Rust Backend

> Complete specification for the Tauri v2 Rust backend: models, session parser, cache, sidecar manager, and IPC commands.

## Module Structure

```
src-tauri/src/
├── main.rs              # Windows entry point
├── lib.rs               # App builder — plugins, state, commands
├── cache.rs             # In-memory session cache + analytics aggregation
├── sidecar.rs           # QMD sidecar child process manager
├── models/
│   ├── mod.rs           # pub mod re-exports
│   ├── session.rs       # SessionSummary and related types
│   ├── analytics.rs     # Analytics response types
│   └── qmd.rs           # QMD data types
├── parser/
│   ├── mod.rs           # pub mod re-exports
│   ├── discovery.rs     # Session file discovery
│   └── session.rs       # JSONL line-by-line parser
└── commands/
    ├── mod.rs           # pub mod re-exports
    ├── analytics.rs     # Session/project/usage Tauri commands
    └── qmd.rs           # QMD Tauri commands
```

---

## 1. Entry Points

### `main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    ariadne_lib::run()
}
```

### `lib.rs`

Registers all plugins, managed state, and Tauri commands:

```rust
mod models;
mod parser;
mod commands;
mod cache;
mod sidecar;

use commands::analytics::*;
use commands::qmd::*;
use cache::SessionCache;
use sidecar::QmdSidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionCache::new())
        .manage(QmdSidecar::new())
        .invoke_handler(tauri::generate_handler![
            // Analytics commands
            get_analytics_overview,
            get_project_sessions,
            get_session_detail,
            get_all_sessions,
            resync_sessions,
            get_tool_details,
            get_project_file_stats,
            get_time_breakdown,
            get_session_entries,
            // QMD commands
            qmd_check_availability,
            qmd_get_status,
            qmd_list_collections,
            qmd_get_collection_detail,
            qmd_get_collection_documents,
            qmd_add_collection,
            qmd_remove_collection,
            qmd_rename_collection,
            qmd_add_context,
            qmd_remove_context,
            qmd_set_global_context,
            qmd_reindex,
            qmd_embed,
            qmd_cleanup,
            qmd_scan_filesystem,
            qmd_get_indexed_paths,
            qmd_toggle_files,
            qmd_list_indexes,
            qmd_create_index,
            qmd_delete_index,
            qmd_rename_index,
            qmd_search,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 2. Models

All models derive `Serialize` with `#[serde(rename_all = "snake_case")]`. Field names must exactly match the frontend Zod schemas.

### `models/session.rs`

```rust
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionSummary {
    pub id: String,                           // UUID from session header
    pub project_path: String,                 // decoded cwd
    pub project_name: String,                 // last path segment of cwd
    pub session_dir: String,                  // URL-encoded directory name
    pub file_name: String,                    // .jsonl filename
    pub file_size_bytes: u64,
    pub started_at: String,                   // ISO 8601 / RFC 3339
    pub ended_at: Option<String>,
    pub duration_seconds: Option<f64>,
    pub title: Option<String>,                // from session_info event
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
    // Activity counts
    pub user_message_count: u32,
    pub assistant_message_count: u32,
    pub tool_result_count: u32,
    pub turn_count: u32,                      // assistant messages with stopReason
    pub compaction_count: u32,
    // Tool breakdown
    pub tool_calls: HashMap<String, ToolCallSummary>,
    // Tool call targets
    pub bash_commands: HashMap<String, u32>,  // program name → count
    pub read_files: HashMap<String, u32>,     // file path → count
    pub edit_files: HashMap<String, u32>,
    pub write_files: HashMap<String, u32>,
    // Models used
    pub models_used: Vec<ModelUsage>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionEntriesResponse {
    pub header: Option<serde_json::Value>,
    pub entries: Vec<serde_json::Value>,
    pub leaf_id: Option<String>,
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
```

Implement `Default` for `SessionSummary` with all fields zeroed/empty.

### `models/analytics.rs`

```rust
use serde::Serialize;
use super::session::SessionSummary;

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
    pub total_file_size_bytes: u64,
    pub sessions_by_date: Vec<DayCount>,
    pub cost_by_date: Vec<DayCost>,
    pub projects: Vec<ProjectSummary>,
    pub models: Vec<ModelAggregate>,
    pub tools: Vec<ToolAggregate>,
    pub top_bash_commands: Vec<NameCount>,    // top 20
    pub top_read_files: Vec<NameCount>,       // top 20
    pub top_edit_files: Vec<NameCount>,       // top 20
    pub top_write_files: Vec<NameCount>,      // top 20
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
pub struct ProjectToolSummary {
    pub project_name: String,
    pub total_calls: u32,
    pub items: Vec<NameCount>,   // top 5 per project
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
pub struct ProjectFileStats {
    pub project_name: String,
    pub total_sessions: u32,
    pub tool_distribution: Vec<NameCount>,
    pub read_files: Vec<NameCount>,
    pub edit_files: Vec<NameCount>,
    pub write_files: Vec<NameCount>,
    pub bash_commands: Vec<NameCount>,
    pub directory_stats: Vec<DirectoryStat>,
    pub activity_by_date: Vec<DayCount>,
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
pub struct WeekdayStat {
    pub day: String,            // "Mon", "Tue", etc.
    pub sessions: u32,
    pub cost: f64,
    pub share: f64,             // percentage 0-100
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TimeOfDayStat {
    pub label: String,          // "After midnight", "Morning", etc.
    pub hour_start: u32,
    pub hour_end: u32,
    pub sessions: u32,
    pub cost: f64,
    pub share: f64,
}
```

### `models/qmd.rs`

```rust
use serde::Serialize;

#[derive(Serialize)]
pub struct QmdAvailability {
    pub installed: bool,
    pub version: Option<String>,
    pub db_path: Option<String>,
    pub db_size_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct QmdIndex {
    pub name: String,            // display name ("default" for index.sqlite)
    pub file_stem: String,       // actual filename stem
    pub db_path: String,
    pub db_size_bytes: u64,
    pub collection_count: u32,
    pub document_count: u32,
    pub last_modified: Option<String>,
}

#[derive(Serialize)]
pub struct QmdStatus {
    pub total_documents: u32,
    pub active_documents: u32,
    pub embedded_chunks: u32,
    pub needs_embedding: u32,
    pub collection_count: u32,
    pub db_size_bytes: u64,
    pub global_context: Option<String>,
    pub days_since_update: Option<u32>,
}

#[derive(Serialize)]
pub struct QmdContext {
    pub path: String,
    pub context: String,
}

#[derive(Serialize)]
pub struct QmdCollection {
    pub name: String,
    pub path: String,
    pub pattern: String,
    pub ignore_patterns: Vec<String>,
    pub include_by_default: bool,
    pub update_command: Option<String>,
    pub doc_count: u32,
    pub active_doc_count: u32,
    pub embedded_count: u32,
    pub last_modified: Option<String>,
    pub contexts: Vec<QmdContext>,
}

#[derive(Serialize)]
pub struct QmdDocument {
    pub path: String,
    pub title: String,
    pub docid: String,            // first 6 chars of hash
    pub collection: String,
    pub modified_at: String,
    pub body_length: u32,
}

#[derive(Serialize)]
pub struct QmdCollectionDetail {
    pub collection: QmdCollection,
    pub documents: Vec<QmdDocument>,
}

#[derive(Serialize)]
pub struct QmdCommandResult {
    pub success: bool,
    pub output: String,
}
```

---

## 3. Session Parser

### `parser/discovery.rs` — File Discovery

Walks `~/.pi/agent/sessions/` recursively to find all `.jsonl` files.

**Algorithm:**
1. Resolve home dir via `dirs::home_dir()`
2. Check `~/.pi/agent/sessions/` exists, return empty vec if not
3. Iterate each subdirectory (URL-encoded project paths)
4. Use `walkdir::WalkDir` within each subdirectory to find `.jsonl` files
5. Record: `path`, `dir_name` (parent directory name), `file_name`, `file_size`
6. Sort results by `file_name` for consistent ordering

**Returns:** `Vec<SessionFile>` where `SessionFile` has `{path, dir_name, file_name, file_size}`.

### `parser/session.rs` — JSONL Parser

Parses a single `.jsonl` file line-by-line into a `SessionSummary`.

**For each line:**
1. Parse as `serde_json::Value`. Skip malformed lines gracefully (never fail the file).
2. Track `last_timestamp` from every line that has a `timestamp` field.
3. Dispatch on `type` field:

**Event type handlers:**

| `type` | Action |
|---|---|
| `"session"` | Extract `id`, `cwd` (→ `project_path`, `project_name` as last path segment), `timestamp` (→ `started_at`) |
| `"session_info"` | Extract `name` → `title` |
| `"message"` with `role: "user"` | Increment `user_message_count` |
| `"message"` with `role: "assistant"` | Increment `assistant_message_count`. If `stopReason` present, increment `turn_count`. Parse `content` array for `toolCall` blocks (see below). Parse `usage` object for tokens and costs. Track `model` + `provider` pair in model usage map. |
| `"message"` with `role: "toolResult"` | Increment `tool_result_count`. Track tool name in `tool_calls` map (calls + errors via `isError`). |
| `"compaction"` | Increment `compaction_count` |

**Tool call extraction from assistant content blocks:**

For each content block where `type == "toolCall"`:
- `bash` → Extract first whitespace-delimited token of `arguments.command` as program name → `bash_commands`
- `read` or `Read` → Extract `arguments.path` → `read_files`
- `edit` or `Edit` → Extract `arguments.path` → `edit_files`
- `write` or `Write` → Extract `arguments.path` → `write_files`

**Usage extraction from assistant messages:**

From `message.usage`:
- `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` → accumulate into token fields
- `usage.cost.input`, `.output`, `.cacheRead`, `.cacheWrite`, `.total` → accumulate into cost fields

**Post-processing:**
- Set `ended_at` from last timestamp
- Calculate `duration_seconds` from `started_at` to `ended_at` (RFC 3339 parse)
- Convert model usage map to `Vec<ModelUsage>`

---

## 4. Session Cache (`cache.rs`)

In-memory cache using `Arc<RwLock<Option<Vec<SessionSummary>>>>`.

### Methods

| Method | Behavior |
|---|---|
| `new()` | Create empty cache |
| `get_or_init()` | Read lock → if Some, return clone. Otherwise call `resync()`. |
| `resync()` | Discover all session files, parse each (skipping failures), store in write lock, update timestamp. Returns `Vec<SessionSummary>`. |
| `get_analytics_overview()` | Full aggregation (see below) |
| `get_project_sessions(name)` | Filter by project_name, sort by started_at descending |
| `get_session_detail(id)` | Find by session id |
| `get_all_sessions(project?)` | Optional project filter, sort by started_at descending |
| `get_tool_details(tool, project?)` | Per-tool aggregation |
| `get_project_file_stats(name)` | Per-project file/tool stats |
| `get_time_breakdown(range_days)` | Time-filtered analytics. `range_days=0` means all time. |
| `get_session_entries(id)` | Read raw JSONL from disk for session viewer (not cached) |

### `get_analytics_overview()` aggregation logic

1. Sum total sessions, cost (all 4 categories), tokens, file size
2. Group by project → `ProjectSummary` with name, path, session_count, cost, tokens, last_active
3. Group by date → `sessions_by_date` and `cost_by_date` (YYYY-MM-DD)
4. Aggregate models → `ModelAggregate` with message_count and approximate cost
5. Aggregate tools → `ToolAggregate` with total_calls and total_errors
6. Aggregate bash_commands, read_files, edit_files, write_files → top 20 each (sorted by count desc)
7. Recent sessions → last 20 by started_at desc

### `get_time_breakdown(range_days)` logic

1. Filter sessions where `now - started_at < range_days` (skip if range_days == 0)
2. Weekday buckets: Mon–Sun (chrono `num_days_from_monday()`)
3. Time-of-day buckets: After midnight (0-5), Morning (6-11), Afternoon (12-16), Evening (17-21), Night (22-23)
4. Daily sessions and cost aggregation
5. Compute shares as percentages

### `get_session_entries(id)` behavior

1. Find session by ID in cache
2. Reconstruct file path: `~/.pi/agent/sessions/{session_dir}/{file_name}`
3. Read file line-by-line, parse each as `serde_json::Value`
4. First line with `type: "session"` → `header`
5. All other lines → `entries` vector
6. Track `leaf_id` as the `id` of the last entry
7. Return `SessionEntriesResponse { header, entries, leaf_id }`

---

## 5. Sidecar Manager (`sidecar.rs`)

Manages a long-lived child process running the QMD bridge TypeScript script.

### Architecture

- `QmdSidecar` is Clone-friendly (wraps `Arc<QmdSidecarInner>`)
- `QmdSidecarInner` holds:
  - `process: Mutex<Option<SidecarProcess>>` — the child process with stdin/stdout
  - `current_index: Mutex<Option<String>>` — current DB path
  - `next_id: AtomicU64` — request ID counter

### Key methods

| Method | Description |
|---|---|
| `new()` | Create unstarted sidecar |
| `ensure_running()` | Check process status, spawn if not running. Sends `ping` to verify. |
| `ensure_index(db_path)` | Ensure sidecar has the right index open. Sends `switch_index` if needed. |
| `call_blocking(method, params)` | Ensure running → send JSON-RPC → read response (skip progress events) |
| `call_with_progress_blocking(method, params, app, event_name)` | Same but forward progress events via `app.emit()` |
| `shutdown()` | Drop stdin, try_wait, kill |

### Spawn sequence

1. Find bridge script at `{CARGO_MANIFEST_DIR}/../src-sidecar/qmd-bridge.ts`
2. Detect runtime: try `bun` first, fall back to `npx tsx`
3. Spawn with stdin/stdout piped, stderr inherited
4. If default DB (`~/.cache/qmd/index.sqlite`) exists, pass `--db-path`
5. Send `ping`, verify `{ok: true}` response
6. On crash: clear process and current_index, respawn on next call

### JSON-RPC protocol

**Request format:** `{"id": <u64>, "method": "<name>", "params": {...}}\n`

**Response format (success):** `{"id": <u64>, "result": {...}}\n`

**Response format (error):** `{"id": <u64>, "error": {"code": <i32>, "message": "<string>"}}\n`

**Progress event:** `{"id": <u64>, "event": "progress", "data": {...}}\n`

All messages are newline-delimited JSON on stdout. The Rust side reads line-by-line, skips events with mismatched IDs, skips progress events (or forwards them), and returns the first matching result/error.

### Drop behavior

`QmdSidecarInner` implements `Drop`: drops stdin, waits briefly, kills if needed.

---

## 6. Tauri Commands

### `commands/analytics.rs`

All commands take `State<SessionCache>` and delegate to cache methods:

| Command | Params | Returns |
|---|---|---|
| `get_analytics_overview` | — | `AnalyticsOverview` |
| `get_project_sessions` | `project_name: String` | `Vec<SessionSummary>` |
| `get_session_detail` | `session_id: String` | `SessionSummary` |
| `get_all_sessions` | `project_name: Option<String>` | `Vec<SessionSummary>` |
| `resync_sessions` | — | `AnalyticsOverview` (force resync then return fresh overview) |
| `get_project_file_stats` | `project_name: String` | `ProjectFileStats` |
| `get_time_breakdown` | `range_days: u32` | `TimeBreakdown` |
| `get_tool_details` | `tool_name: String, project_name: Option<String>` | `ToolDetailResponse` |
| `get_session_entries` | `session_id: String` | `SessionEntriesResponse` |

### `commands/qmd.rs`

**Index resolution:** `"default"` maps to `index.sqlite`, all others map to `{name}.sqlite` in `~/.cache/qmd/`.

**Read operations** use direct `rusqlite` with `SQLITE_OPEN_READ_ONLY`:

| Command | Description |
|---|---|
| `qmd_check_availability` | Check `qmd --version`, check if default DB exists |
| `qmd_list_indexes` | Scan `~/.cache/qmd/*.sqlite`, read collection/doc counts |
| `qmd_get_status(index)` | Query documents, chunks, collections, DB size, global context, days since update |
| `qmd_list_collections(index)` | JOIN store_collections with documents and content_vectors |
| `qmd_get_collection_detail(index, name)` | Collection metadata + document list |
| `qmd_get_collection_documents(index, collection)` | Active documents with body length |
| `qmd_get_indexed_paths(index, collection)` | Active document paths |

**Write operations** use sidecar via `spawn_blocking`:

| Command | Sidecar Method |
|---|---|
| `qmd_create_index(name)` | `create_index` — validates name with regex `^[a-z][a-z0-9-]*$`, max 32 chars, rejects "index" and "models" |
| `qmd_delete_index(name)` | Direct fs delete of .sqlite + .sqlite-wal + .sqlite-shm. Cannot delete "default". |
| `qmd_rename_index(old, new)` | Direct fs rename. Cannot rename "default". |
| `qmd_add_collection(index, name, path, pattern?)` | `add_collection` |
| `qmd_remove_collection(index, name)` | `remove_collection` |
| `qmd_rename_collection(index, old, new)` | `rename_collection` |
| `qmd_add_context(index, collection, path, text)` | `add_context` |
| `qmd_remove_context(index, collection, path)` | `remove_context` |
| `qmd_set_global_context(index, text)` | `set_global_context` |
| `qmd_reindex(index)` | `update` with progress → `qmd:update-progress` |
| `qmd_embed(index)` | `embed` with progress → `qmd:embed-progress` |
| `qmd_cleanup(index)` | `cleanup` |
| `qmd_scan_filesystem(index, collection)` | Reads path+pattern from SQLite, sends to sidecar `scan_filesystem` |
| `qmd_toggle_files(index, collection, repo_root, adds, removes)` | `toggle_files` |
| `qmd_search(index, query, collections?, limit?)` | `search` with progress → `qmd:search-progress` |

Every sidecar command calls `ensure_index(db_path)` before the actual method call to ensure the correct index is loaded.

### SQL queries used in QMD read commands

**Status:**
```sql
SELECT COUNT(*) FROM documents
SELECT COUNT(*) FROM documents WHERE active = 1
SELECT COUNT(DISTINCT d.hash) FROM documents d
  LEFT JOIN content_vectors cv ON d.hash = cv.hash AND cv.seq = 0
  WHERE d.active = 1 AND cv.hash IS NULL
SELECT COUNT(*) FROM content_vectors
SELECT COUNT(*) FROM store_collections
SELECT value FROM store_config WHERE key = 'global_context'
SELECT MAX(modified_at) FROM documents WHERE active = 1
```

**Collections:**
```sql
SELECT sc.name, sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default,
  sc.update_command, sc.context,
  COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count,
  COUNT(DISTINCT d.id) as total_doc_count,
  COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count,
  MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified
FROM store_collections sc
LEFT JOIN documents d ON d.collection = sc.name
LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0
GROUP BY sc.name
```

**Documents:**
```sql
SELECT d.path, d.title, SUBSTR(d.hash, 1, 6) as docid, d.collection, d.modified_at,
  LENGTH(c.doc) as body_length
FROM documents d
JOIN content c ON c.hash = d.hash
WHERE d.collection = ? AND d.active = 1
ORDER BY d.modified_at DESC
```

**Ignore patterns parsing:** Try JSON array first, fall back to comma-separated string.

**Context parsing:** Parse `context` column as `HashMap<String, String>` JSON → `Vec<QmdContext>`.
