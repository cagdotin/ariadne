# Task: Port QMD SQLite Read Service to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ Milestone 3 (runtime skeleton), ✅ comparison harness**
**Unlocks: port-qmd-bridge-orchestration**

## Context

Ports the read-only QMD SQLite commands from Rust to TypeScript. These serve the QMD dashboard/status pages without needing the QMD bridge process.

## Spec references

- `docs/specs/2026-03-28-migration-qmd-subsystem.md` — Sections 6.1, 6.2
- Rust source: `src-tauri/src/commands/qmd.rs` (923 lines)

## Target files

```
backend/qmd/index-paths.ts              # path resolution + validation
backend/qmd/sqlite-read-service.ts      # all read-only SQLite queries
backend/qmd/commands/indexes.ts          # create/delete/rename index (fs ops)
backend/qmd/commands.ts                  # wire handlers into request router
```

## What to build

### 1. Index path resolution (`index-paths.ts`)

- `resolve_cache_root()` — `ARIADNE_QMD_CACHE_ROOT` env var or `~/.cache/qmd/`
- `resolve_index_db_path(name)` — `"default"` → `index.sqlite`, others → `{name}.sqlite`
- `validate_index_name(name)` — regex `^[a-z][a-z0-9-]*$`, max 32 chars, reject reserved names (`"index"`, `"models"`)

### 2. SQLite read service (`sqlite-read-service.ts`)

Choose and install a Node-compatible SQLite library. Recommended: `better-sqlite3` (synchronous, simple, packages well with Electron).

Port these commands:

**`qmd_list_indexes()`** — scan cache dir for `.sqlite` files, skip `"models"` and empty stems, open each DB and count collections + active docs, sort default first then alphabetically.

**`qmd_get_status(index)`** — count total/active docs, docs needing embedding (LEFT JOIN content_vectors WHERE cv.hash IS NULL AND active=1), embedded chunks, fetch global_context from store_config, calculate days_since_update.

**`qmd_list_collections(index)`** — JOIN store_collections with documents and content_vectors. Aggregate active docs, embedded count (cv.seq=0). Parse ignore_patterns (try JSON, else comma-split). Parse contexts from JSON map.

**`qmd_get_collection_detail(index, name)`** — detailed collection info including documents list.

**`qmd_check_availability()`** — check if `qmd` binary exists (spawn `qmd --version`), check if default DB exists.

**`qmd_get_indexed_paths(index, collection)`** — get paths from documents table.

### 3. Index management (`commands/indexes.ts`)

**`qmd_create_index(name)`** — validate name, delegate to bridge (or create empty DB).

**`qmd_delete_index(name)`** — prevent deleting "default", remove .sqlite + WAL/SHM files.

**`qmd_rename_index(old_name, new_name)`** — validate, prevent renaming "default", rename .sqlite + WAL/SHM.

### 4. Wire into request router

Register real handlers replacing stubs for: `qmd_list_indexes`, `qmd_get_status`, `qmd_list_collections`, `qmd_get_collection_detail`, `qmd_check_availability`, `qmd_get_indexed_paths`, `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index`.

## Parity verification

Flip `BACKEND_READY.qmd = true` in `tests/parity/run-parity.test.ts` and run:
```
bun run test:parity
```

All 6 QMD parity tests must pass.

## Dependencies

- Install `better-sqlite3` and `@types/better-sqlite3` (or chosen SQLite library)

## Rules

- Match Rust SQL queries as closely as possible
- Read-only posture for dashboard/status queries
- Do not modify contracts/ or src/ files

## Acceptance

- All 6 QMD parity tests pass
- SQLite library installed and working
- Index validation matches Rust behavior (regex, reserved names)
