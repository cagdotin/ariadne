# Task: Port Session Discovery and Parser to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ Milestone 3 (runtime skeleton), ✅ comparison harness**
**Unlocks: port-session-cache-and-aggregations**

## Context

This is the first task in the analytics/sessions port stream. It ports the two lowest-level modules — session file discovery and line-by-line JSONL parsing — as pure TypeScript functions with no cache or worker-thread concerns.

## Spec references

- `docs/specs/2026-03-28-migration-analytics-session-backend.md` — Sections 6.2, 6.3
- Rust source: `src-tauri/src/parser/discovery.rs`, `src-tauri/src/parser/session.rs`

## Target files

```
backend/analytics/discovery.ts
backend/analytics/session-parser.ts
backend/analytics/session-types.ts
```

## What to build

### 1. Session types (`session-types.ts`)

Define the TypeScript equivalent of the Rust `SessionSummary` struct and `SessionFile` struct. These must match the shapes validated by the Zod schemas in `contracts/sessions/summary.ts`.

Key fields for `SessionFile`:
- `path: string` — full filesystem path to the .jsonl file
- `dir_name: string` — parent directory name (URL-encoded project path)
- `file_name: string` — .jsonl filename
- `file_size: number` — file size in bytes

Key fields for `SessionSummary` — match the Rust struct exactly:
- id, project_path, project_name, session_dir, file_name, file_size_bytes
- started_at, ended_at, duration_seconds, title, first_user_message
- All token/cost fields (total, input, output, cache_read, cache_write)
- Message counts (user, assistant, tool_result, turn, compaction)
- tool_calls (HashMap equivalent: `Record<string, { name: string; calls: number; errors: number }>`)
- bash_commands, read_files, edit_files, write_files (all `Record<string, number>`)
- models_used: `Array<{ model_id: string; provider: string; message_count: number }>`

### 2. Session discovery (`discovery.ts`)

Port `discover_session_files()`:

1. Resolve root: `ARIADNE_PI_SESSIONS_ROOT` env var or `~/.pi/agent/sessions/`
2. If root doesn't exist, return empty array (graceful degradation)
3. Recursively walk for `.jsonl` files
4. For each file: capture `dir_name` (first-level subdirectory name), `file_name`, `file_size` (from fs.stat)
5. Sort results by `file_name` alphabetically (preserving current Rust behavior)
6. Return `SessionFile[]`

Use `node:fs` and `node:path`. Use synchronous or async fs — either works since this will later run in a worker thread.

### 3. Session parser (`session-parser.ts`)

Port `parse_session_file()`:

Read the .jsonl file line by line. For each line, parse JSON and process by `type` field:

**`type: "session"`** — extract `id`, `timestamp` (→ started_at), `cwd` (→ project_path). Derive `project_name` from last path segment.

**`type: "session_info"`** — extract `name` (→ title).

**`type: "message"` with `role: "user"`** — increment user_message_count. Capture first user message (truncated to 200 chars with UTF-8 boundary safety). Handle both string and array content formats.

**`type: "message"` with `role: "assistant"`** — increment assistant_message_count. If `stopReason` present, increment turn_count. Extract tool calls from `content[].toolCall` blocks:
- For `name: "bash"`: extract `arguments.command`, split on first whitespace for program name → add to bash_commands
- For `name: "read"`: extract `arguments.path` → add to read_files
- For `name: "edit"`: extract `arguments.path` → add to edit_files
- For `name: "write"`: extract `arguments.path` → add to write_files
- Track ALL tool calls by name in tool_calls map
Extract `usage` object: input, output, cacheRead, cacheWrite, totalTokens. Extract `usage.cost`: input, output, cacheRead, cacheWrite, total. Track `model` + `provider` pairs in models_used.

**`type: "message"` with `role: "toolResult"`** — increment tool_result_count. Map `toolName` → increment calls in tool_calls. If `isError: true` → increment errors.

**`type: "compaction"`** — increment compaction_count.

Update `ended_at` with every event's timestamp. Calculate `duration_seconds` from RFC3339 start/end timestamps.

**Edge cases to handle:**
- Malformed JSON lines: skip with continue (log warning but don't crash)
- Missing fields: use safe access with defaults
- Content as string vs array: handle both
- First user message truncation: 200 chars, respect UTF-8 boundaries

### 4. Export barrel

Export all types and functions from these modules so the cache task can import them.

## Verification

1. Write a small test or script that runs discovery + parser against `fixtures/migration/sessions/minimal/` and prints the resulting SessionSummary
2. Compare key values against the golden file `fixtures/migration/golden/analytics/minimal-overview.json` — the totals should match (total_cost: 0.0405, total_tokens: 7750, total_tool_calls: 3)
3. Run against `fixtures/migration/sessions/multi-project/` and verify 3 sessions are found across 2 projects

## Rules

- Pure functions only — no caching, no singletons, no worker threads
- Do not import Electron or Tauri
- Do not modify contracts/ or src/ files
- Match Rust behavior exactly — this is a port, not a redesign

## Acceptance

- `discover_session_files()` returns correct SessionFile arrays for fixture roots
- `parse_session_file()` produces SessionSummary objects matching golden expected values
- Malformed lines are skipped without crashing
- All field names and types match the contracts
