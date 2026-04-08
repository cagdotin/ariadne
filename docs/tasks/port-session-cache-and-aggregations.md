# Task: Port Session Cache and Aggregations to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ port-session-discovery-and-parser**
**Unlocks: port-analytics-worker-thread**

## Context

This task ports the `SessionCache` struct and all aggregation methods to TypeScript, wires them into the backend request router (replacing stubs), and validates parity against golden files.

## Spec references

- `docs/specs/2026-03-28-migration-analytics-session-backend.md` — Sections 6.4, 6.5
- Rust source: `src-tauri/src/cache.rs` (865 lines)

## Target files

```
backend/analytics/session-cache.ts
backend/analytics/aggregations/overview.ts
backend/analytics/aggregations/tool-details.ts
backend/analytics/aggregations/file-stats.ts
backend/analytics/aggregations/time-breakdown.ts
backend/analytics/replay-loader.ts
backend/analytics/commands.ts          # wires handlers into request router
```

## What to build

### 1. Session cache (`session-cache.ts`)

Port the `SessionCache` struct:
- In-memory store of `SessionSummary[]`
- Lazy initialization on first read (`get_or_init()`)
- Explicit resync (`resync()`) — re-discovers and re-parses all files
- **IMPORTANT:** `resync_sessions()` must also invalidate the QMD log cache (cross-subsystem hook). For now, import and call a cache invalidation function that will be provided by the QMD logs module. If it doesn't exist yet, add a placeholder hook.

### 2. Shared filtering

Port the filter helper:
```typescript
function session_matches(
  session: SessionSummary,
  project_path: string | null,
  range_days: number,
  now: Date
): boolean
```
- If `project_path` is provided: session.project_path must match exactly
- If `range_days === 0`: no time filter (all time)
- Otherwise: session age in days < range_days (from started_at)

### 3. Aggregation: overview (`overview.ts`)

Port `get_analytics_overview(project_path, range_days)`:
- Filter sessions, then aggregate: total tokens/costs, per-project summaries, per-date breakdowns, model usage, tool usage, top-N lists (bash commands, file reads/edits/writes)
- Return 20 most recent sessions
- Projects sorted by session_count descending
- Dates sorted chronologically ascending
- Top-N sorted by count descending, truncated to 20

### 4. Aggregation: tool details (`tool-details.ts`)

Port `get_tool_details(tool_name, project_path, range_days)`:
- Filter sessions, aggregate tool-specific items (bash commands or file paths)
- Break down by project and by date
- Return top items per project

### 5. Aggregation: file stats (`file-stats.ts`)

Port `get_project_file_stats(project_path, range_days)`:
- Filter to project, track distinct sessions per file (HashSet equivalent)
- Aggregate directory statistics from file paths
- Return tool_distribution, read/edit/write files, directory_stats, file_insights

### 6. Aggregation: time breakdown (`time-breakdown.ts`)

Port `get_time_breakdown(range_days, project_path)`:
- By weekday: Monday=0, Sunday=6
- By time-of-day buckets: [0-5, 6-11, 12-16, 17-21, 22-23]
- By date: local timezone formatting
- By hour: only when range_days=1

### 7. Replay loader (`replay-loader.ts`)

Port `get_session_entries(session_id)`:
- Locate file via session_dir + file_name
- Read JSONL line by line
- First `type: "session"` line → header
- All other lines → entries array
- Track last entry ID as leaf_id
- Return raw JSON values (the frontend renders them)

### 8. Static helpers

Port `get_file_sizes(paths)` — returns fs.stat sizes for given paths (0 if not found).

Port `list_projects()` — extract unique projects from cached sessions.

### 9. Wire into request router

In `backend/analytics/commands.ts`, import the cache and register real handlers for ALL analytics channels, replacing the stubs in `backend/stubs/index.ts`. Remove or override the stub registrations for:
- `list_projects`, `get_analytics_overview`, `get_session_detail`, `get_all_sessions`, `resync_sessions`, `get_project_file_stats`, `get_time_breakdown`, `get_session_entries`, `get_tool_details`, `get_file_sizes`

## Parity verification

After wiring, flip `BACKEND_READY.analytics = true` and `BACKEND_READY.replay = true` in `tests/parity/run-parity.test.ts` and run:
```
bun run test:parity
```

All 13 analytics + 2 replay tests must pass (golden comparison + schema validation).

## Rules

- Match Rust behavior exactly
- Local timezone for date bucketing (the test runs with TZ=UTC)
- Do not modify contracts/ or src/ files
- Do not modify golden files

## Acceptance

- All 13 analytics parity tests pass
- Both replay parity tests pass
- resync invalidates QMD log cache
- Cache is lazy-initialized
