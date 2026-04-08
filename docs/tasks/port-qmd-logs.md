# Task: Port QMD Logs Parser and Cache to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ Milestone 3 (runtime skeleton), ✅ comparison harness**

## Context

Ports the QMD log extraction subsystem — a separate observability feature that parses QMD CLI invocations from pi session logs. It has its own parser, cache, and commands, independent from analytics.

## Spec references

- `docs/specs/2026-03-28-migration-qmd-logs-observability.md`
- Rust source: `src-tauri/src/parser/qmd_logs.rs` (582 lines), `src-tauri/src/qmd_log_cache.rs` (110 lines)

## Target files

```
backend/qmd-logs/command-parse.ts    # QMD command detection + parsing
backend/qmd-logs/parser.ts           # session JSONL traversal, call/result correlation
backend/qmd-logs/cache.ts            # lazy cache with invalidation hook
backend/qmd-logs/stats.ts            # stats aggregation
backend/qmd-logs/commands.ts         # wire handlers into request router
```

## What to build

### 1. Command detection and parsing (`command-parse.ts`)

Port these functions from `qmd_logs.rs`:

**`is_qmd_command(command)`** — split on `|`, `&`, `;`, check each segment for QMD invocation. Handle env-var-prefixed forms like `QMD_INDEX=work qmd search "query"`.

**`contains_qmd_invocation(segment)`** — direct match (`qmd` or `qmd ...`) or after stripping env var assignments. Must handle quoted values in env vars.

**`shell_tokenize(input)`** — handle single quotes, double quotes, backslash escapes.

**`parse_qmd_command(command)`** — find qmd segment, strip env prefixes, tokenize, skip global flags, match subcommand against known list (`query`, `search`, `get`, `multi-get`, `status`, `collection`, `context`, `update`, `embed`, `cleanup`, `ls`, `paths`), parse flags (`-c`/`--collection`, `-i`/`--index`), extract primary argument.

### 2. Session traversal (`parser.ts`)

Port `parse_qmd_logs_from_session(path)`:

1. Read session JSONL, extract session ID and project from `type: "session"`
2. Track pending calls: for each assistant message with bash toolCall blocks where command contains `qmd`, store in pending map keyed by toolCall block `id`
3. For each toolResult: match by `toolCallId`, extract output, mark errors, create final `QmdLogEntry`
4. Remaining pending calls (no result) → emit with `has_output: false`

**QmdLogEntry fields:** id (`{session_id}:{tool_call_id}`), session_id, project_path, project_name, timestamp, tool_call_id, raw_command, subcommand, primary_argument, index_name, collections, is_error, has_output, output_text, output_preview, output_kind.

**Output processing:**
- `extract_tool_result_text(message)` — handle string and array content
- `truncate_preview(text, 200)` — first line, max 200 chars
- `detect_output_kind(text)` — check JSON structure for `search_json`, `files_json`, `raw_text`, `unknown`

### 3. Cache (`cache.ts`)

Port `QmdLogCache`:
- Lazy init on first request
- `build_entries()` — discover all sessions, parse QMD logs from each, sort by timestamp descending
- `invalidate()` — clear cache (called from analytics resync)
- `get_qmd_logs(project_path?)` — filter by project if provided
- `get_qmd_log_stats(project_path?)` — count total, errors, unique projects/sessions, by_subcommand

### 4. Wire into request router

Register handlers for `get_qmd_logs` and `get_qmd_log_stats`, replacing stubs.

Export the `invalidate()` function so the analytics cache resync can call it.

## Parity verification

Flip `BACKEND_READY.qmd_logs = true` in `tests/parity/run-parity.test.ts` and run:
```
bun run test:parity
```

All 3 QMD logs parity tests must pass.

## Rules

- Match Rust parser behavior exactly — this is a faithful port
- Preserve lazy, separate cache (do NOT couple to analytics startup)
- Skip malformed lines, don't crash
- Do not modify contracts/ or src/ files

## Acceptance

- All 3 QMD logs parity tests pass
- Command detection handles env prefixes, pipes, semicolons
- Shell tokenizer handles quotes and escapes
- Cache is lazy and invalidatable
- Incomplete calls (no tool result) produce entries with `has_output: false`
