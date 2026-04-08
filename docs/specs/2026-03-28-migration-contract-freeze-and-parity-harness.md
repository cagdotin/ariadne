# Migration Spec — Contract Freeze and Parity Harness

Status: Approved
Date: 2026-03-28
Approved: 2026-04-08
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

Ariadne cannot safely port its backend from Rust/Tauri to Electron/Node unless the current behavior is frozen as an explicit contract. Today the contract is spread across:

- Tauri command names in `src-tauri/src/lib.rs`
- frontend wrapper functions in `src/api/*.ts`
- Zod schemas in `src/schemas/*.ts`
- untyped session replay payloads in `src/components/session-viewer/types.ts`
- direct Tauri event listeners in `src/hooks/use-qmd-operation.ts` and `src/components/qmd-search-modal.tsx`
- direct dialog usage in `src/components/add-collection-dialog.tsx`

Without a contract freeze, each subsystem port risks redefining payload shapes, error behavior, or event semantics independently. That would turn a backend rewrite into a product redesign.

## 2. Goals and non-goals

### 2.1 Goals
- Inventory the complete current command/API/event/dialog surface.
- Freeze request/response/event contracts in shared TypeScript/Zod definitions.
- Add a fixture-driven parity harness that can compare current Tauri behavior to the new Node backend behavior.
- Cover both typed responses and currently-untyped replay payloads.
- Make backend input roots injectable so parity tests do not depend on the operator’s real home directory.

### 2.2 Non-goals
- Changing user-visible API behavior.
- Introducing a new renderer data-fetching pattern.
- Replacing the session viewer data model.
- Redesigning error messages beyond minimal normalization needed for deterministic tests.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/analytics.rs`
- `src-tauri/src/commands/qmd.rs`
- `src-tauri/src/commands/qmd_logs.rs`
- `src-tauri/src/commands/provider_limits.rs`
- `src/api/analytics.ts`
- `src/api/qmd.ts`
- `src/api/qmd-logs.ts`
- `src/api/provider-limits.ts`
- `src/schemas/analytics.ts`
- `src/schemas/qmd.ts`
- `src/schemas/qmd-logs.ts`
- `src/schemas/provider-limits.ts`
- `src/schemas/session.ts`
- `src/components/session-viewer/types.ts`
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`
- `src/components/add-collection-dialog.tsx`
- `docs/ARCHITECTURE.md`
- `docs/information-architecture.md`

### 3.2 Current contract surface to freeze

#### Command families

**Analytics / sessions**
- `list_projects`
- `get_analytics_overview`
- `get_session_detail`
- `get_all_sessions`
- `resync_sessions`
- `get_project_file_stats`
- `get_time_breakdown`
- `get_session_entries`
- `get_tool_details`
- `get_file_sizes`

**QMD**
- `qmd_list_indexes`
- `qmd_create_index`
- `qmd_delete_index`
- `qmd_rename_index`
- `qmd_check_availability`
- `qmd_get_status`
- `qmd_list_collections`
- `qmd_get_collection_detail`
- `qmd_add_collection`
- `qmd_remove_collection`
- `qmd_rename_collection`
- `qmd_add_context`
- `qmd_remove_context`
- `qmd_set_global_context`
- `qmd_reindex`
- `qmd_embed`
- `qmd_cleanup`
- `qmd_scan_filesystem`
- `qmd_get_indexed_paths`
- `qmd_toggle_files`
- `qmd_search`

**QMD logs**
- `get_qmd_logs`
- `get_qmd_log_stats`

**Provider limits**
- `get_provider_limits`
- `refresh_provider_limits`

#### Event channels
- `qmd:update-progress`
- `qmd:embed-progress`
- `qmd:search-progress`

#### Dialog capabilities
- folder picker via `open({ directory: true, multiple: false, title })`

## 4. Conventions and style

- Shared contract definitions should live in `contracts/`.
- The freeze must preserve current field names exactly, including mixed conventions where they already exist.
- Current renderer wrappers remain the reference UX surface even if backend transport changes.
- Untyped contracts should be wrapped in schemas where practical, but the first objective is fidelity, not cleanup.

## 5. Domain model

### 5.1 Contract modules to introduce
Recommended contract layout:

```text
contracts/
  commands/
    analytics.ts
    qmd.ts
    qmd-logs.ts
    provider-limits.ts
  events/
    qmd-progress.ts
  dialogs/
    filesystem.ts
  replay/
    session-entry.ts
  channels.ts
  index.ts
```

### 5.2 Contract rules
- One schema pair per command: request + response.
- One schema per event payload.
- One schema for replay response even if some nested entry types remain permissive.
- Channel names live as exported constants to eliminate string drift.

## 6. Detailed design

### 6.1 Contract changes
**No user-visible contract changes are permitted in this phase.**

Allowed additive changes only:
- test-only environment overrides for data roots
- new shared schema modules that mirror the current behavior
- deterministic sorting/normalization for test comparators where the UI does not observe the original nondeterminism

### 6.2 Fixture strategy
Create a dedicated migration fixture bundle, for example:

```text
fixtures/migration/
  sessions/
    minimal/
    multi-project/
    branching-replay/
    qmd-cli/
  qmd/
    cache-root/
      index.sqlite
      work.sqlite
  provider-limits/
    codex-app-server/
    codex-session-log/
  golden/
    analytics/
    qmd/
    qmd-logs/
    provider-limits/
```

Required fixture scenarios:

1. **analytics minimal** — one project, one session, stable totals
2. **analytics multi-project + range filter** — verifies `project_path` and `range_days` behavior
3. **branching replay** — verifies `get_session_entries()` preserves raw branch data and `leaf_id`
4. **file analytics** — verifies `distinct_session_count`, directory aggregation, and tool/file maps
5. **QMD status/index/collection reads** — validates SQLite read behavior on known sample indexes
6. **QMD progress-producing operations** — validates emitted progress payload shape using stubbed or recorded bridge responses
7. **QMD CLI log extraction** — plain commands, env-prefixed commands, missing tool result, JSON output kinds
8. **provider limits** — app-server success, fallback-to-session-log, and error cases

### 6.3 Golden testing strategy
For each command family:

- run the current Tauri backend against the fixture root
- capture response payloads as golden JSON
- later run the Node backend against the same fixture root
- diff normalized JSON output

Important normalizations:
- pin timezone to a known value during parity runs
- sort unordered arrays/maps before comparison only when the UI does not depend on source order
- redact machine-local absolute paths only if contract consumers never display the raw value

### 6.4 Testability prerequisites in the current backend
The current code resolves data roots directly from the environment/home directory:

- pi sessions via `dirs::home_dir()/.pi/agent/sessions`
- QMD cache via `XDG_CACHE_HOME` or `~/.cache/qmd`
- Codex session logs via `~/.codex/sessions`

Before parity harnesses are useful, add override points such as:

- `ARIADNE_PI_SESSIONS_ROOT`
- `ARIADNE_QMD_CACHE_ROOT`
- `ARIADNE_CODEX_HOME`

or a consolidated migration-test config.

This is the only acceptable pre-migration behavior change in this area because it enables deterministic fixtures without changing product semantics.

### 6.5 Hidden drift risks this spec must pin down
1. `get_session_entries()` currently bypasses Zod and returns raw JSON values.
2. QMD progress payloads preserve camelCase fields from the sidecar.
3. `resync_sessions()` invalidates QMD log cache in addition to rebuilding analytics.
4. `qmd_search()` returns both results and expanded query/timing traces.
5. `qmd_toggle_files()` returns only `{ indexed, deactivated }`, not a more detailed mutation summary.
6. `AddCollectionDialog` currently expects a directory-only single-selection dialog result.
7. `list_projects()` identity is path-based even when names collide.

## 7. Error handling and failure modes

- Fixture harnesses must preserve explicit error cases instead of only testing happy paths.
- If the current backend has unstable human-readable error strings, parity tests should compare structured error categories plus optional message snapshots.
- Missing tool results in QMD log extraction should remain visible as incomplete entries.
- Replay payload parsing tests must fail loudly on malformed fixture lines.

## 8. Security and safety considerations

- Contract fixtures must avoid leaking personal filesystem paths or sensitive session content.
- Any captured provider transcripts should be scrubbed of email/account identifiers unless intentionally needed for the contract.
- Replay fixtures should use curated or sanitized JSONL files.

## 9. Testing strategy

### 9.1 Unit tests
- contract schema parse tests for every command family
- event payload schema tests
- replay schema tests against representative raw entries

### 9.2 Integration/parity tests
- Tauri-backed fixture execution producing goldens
- Node-backed fixture execution compared against goldens
- event contract tests that subscribe and assert progress payloads
- dialog adapter contract tests for single-directory selection behavior

## 10. Implementation checklist
- [ ] Inventory every command, event, and dialog capability in one shared contract map.
- [ ] Add `contracts/` modules for requests, responses, events, channels, and dialog shapes.
- [ ] Add replay response validation strategy for `get_session_entries()`.
- [ ] Add fixture-root override support for current backend data sources.
- [ ] Build curated fixture bundles for analytics, replay, QMD, QMD logs, and provider limits.
- [ ] Record golden outputs from current Tauri behavior.
- [ ] Add a comparison harness that later runs the Node backend against the same goldens.

## 11. Rollout / cutover notes

- This spec is a prerequisite for every backend-port spec.
- No subsystem should be marked migration-ready until its parity fixtures exist.
- Tauri remains the reference runtime until Node passes parity against frozen goldens.

## 12. Dependencies and parallelization

### Depends on
- approval of target shared-contract location from the migration overview

### Can proceed in parallel with
- early Electron shell scaffolding research, as long as no frozen contract files are modified
- packaging/build research

### Must not run in parallel with
- multiple agents editing `contracts/**`, `src/api/**`, or `src/schemas/**`
- renderer platform-wrapper redesign that assumes new contract shapes before the freeze lands

## 13. Resolved questions
- **Replay entry validation:** start permissive (`z.unknown()`-heavy) to preserve current behavior exactly. A strict schema derived from `session-viewer/types.ts` is a tracked follow-up — add a TODO in `contracts/replay/session-entry.ts` when that file is created. (Approved 2026-04-08)
- **Parity harness:** two separate runners with shared golden files. Record Tauri goldens once, then the Node backend compares against those saved goldens independently. The parity test suite is removed after migration completes since it exists only to prove behavioral equivalence. (Approved 2026-04-08)
