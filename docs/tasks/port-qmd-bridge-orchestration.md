# Task: Port QMD Bridge Orchestration to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ port-qmd-sqlite-reads**

## Context

Ports the QMD sidecar/bridge management from Rust to TypeScript. The bridge is a long-lived child process that handles QMD SDK mutations, search, and progress streaming.

## Spec references

- `docs/specs/2026-03-28-migration-qmd-subsystem.md` — Sections 6.3, 6.4, 6.5, 6.6
- Rust source: `src-tauri/src/sidecar.rs` (432 lines)
- Current bridge: `src-sidecar/qmd-bridge.ts`

## Target files

```
backend/qmd/bridge/bridge-supervisor.ts    # process spawn, health, restart
backend/qmd/bridge/bridge-client.ts        # JSON-RPC send/receive
backend/qmd/bridge/qmd-bridge.ts           # migrated bridge script (or reuse src-sidecar/)
backend/qmd/commands/mutations.ts          # collection/context mutation commands
backend/qmd/commands/search.ts             # search with progress events
backend/qmd/commands/files.ts              # scan/toggle filesystem commands
```

## What to build

### 1. Bridge supervisor (`bridge-supervisor.ts`)

Port the Rust `QmdSidecar` struct:
- One active bridge process at a time
- `ensure_running()` — check if alive, respawn if dead
- Runtime detection: try `bun --version` first, fall back to `npx tsx`
- Bridge script location: `src-sidecar/qmd-bridge.ts` (reuse existing for now)
- Piped stdin/stdout, kill on drop
- Ping health check on startup
- `ensure_index(db_path)` — switch index if different from current

### 2. Bridge client (`bridge-client.ts`)

JSON-RPC protocol over stdin/stdout:
- Request: `{ id, method, params }` + newline
- Response: `{ id, result }` or `{ id, error: { message } }`
- Progress: `{ id, event, data }`
- Monotonically increasing request IDs
- `send_and_read(method, params)` — sends request, reads until matching ID
- `send_and_read_with_progress(method, params, event_channel)` — same but forwards progress events via the backend event bus

### 3. Mutation commands (`mutations.ts`)

Wire bridge-backed commands:
- `qmd_add_collection`, `qmd_remove_collection`, `qmd_rename_collection`
- `qmd_add_context`, `qmd_remove_context`, `qmd_set_global_context`
- `qmd_reindex` (with progress on `qmd:update-progress`)
- `qmd_embed` (with progress on `qmd:embed-progress`)
- `qmd_cleanup`

### 4. Search command (`search.ts`)

- `qmd_search` with progress on `qmd:search-progress`
- Forward expanded queries and timing data

### 5. File commands (`files.ts`)

- `qmd_scan_filesystem` — reads collection metadata from DB, calls bridge
- `qmd_toggle_files` — passes adds/removes to bridge

### 6. Wire into request router

Register handlers replacing stubs for all bridge-backed commands.

## Rules

- Preserve one-active-index-at-a-time invariant
- Preserve current progress event channel names and payload shapes
- Do not absorb the bridge into the backend process (keep as child process)
- Reuse `src-sidecar/qmd-bridge.ts` for now — don't rewrite it

## Acceptance

- Bridge spawns and responds to ping
- Index switching works
- Mutation commands forward to bridge and return results
- Progress events flow through to renderer
- Search returns results with progress
- File scan/toggle operations work
