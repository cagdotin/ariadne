# Task: Record Golden Outputs from Current Tauri Backend

**Status: ✅ Completed**
**Depends on: ✅ build-fixture-bundles (completed)**

## Context

This is part of the Tauri → Electron migration (Milestone 2: Contract Freeze & Parity Harness). After fixture bundles are built, we need to run the current Rust backend against them and capture the exact JSON responses as golden files. The future Node backend will be compared against these goldens to prove behavioral equivalence.

## Spec references

- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md` — Section 6.3
- `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`

## Approach

Write a Rust integration test binary (or `#[test]` module) that:
1. Sets the env var overrides to point at fixture roots
2. Calls the same backend functions that Tauri commands call (parser, cache, QMD reads, QMD log cache, provider limits)
3. Serializes the responses as JSON
4. Writes them to `fixtures/migration/golden/`

This avoids needing the full Tauri runtime — the backend logic is callable without Tauri.

## Golden output files to produce

```
fixtures/migration/golden/
  analytics/
    minimal-overview.json               # get_analytics_overview() against minimal fixture
    minimal-sessions.json               # get_all_sessions() against minimal fixture
    minimal-session-detail.json         # get_session_detail() for the single session
    multi-project-overview-all.json     # get_analytics_overview(None, 0) against multi-project
    multi-project-overview-filtered.json # get_analytics_overview(Some("project-alpha"), 0)
    multi-project-overview-ranged.json  # get_analytics_overview(None, Some(range_days))
    multi-project-sessions.json         # get_all_sessions() against multi-project
    multi-project-file-stats.json       # get_project_file_stats("project-alpha")
    multi-project-time-breakdown.json   # get_time_breakdown(30, None)
    multi-project-tool-details.json     # get_tool_details("read", None, 0)
    multi-project-file-sizes.json       # get_file_sizes([known paths])
  replay/
    minimal-entries.json                # get_session_entries() for minimal session
    branching-entries.json              # get_session_entries() for branching session
  qmd/
    list-indexes.json                   # qmd_list_indexes() against fixture cache-root
    default-status.json                 # qmd_get_status("default")
    default-collections.json            # qmd_list_collections("default")
    default-collection-detail.json      # qmd_get_collection_detail("default", collection_name)
    work-status.json                    # qmd_get_status("work")
    availability.json                   # qmd_check_availability()
    progress-update-sample.json         # Sample update progress event payload
    progress-embed-sample.json          # Sample embed progress event payload
    progress-search-sample.json         # Sample search progress event payload
  qmd-logs/
    all-logs.json                       # get_qmd_logs(None) against qmd-cli fixture
    all-log-stats.json                  # get_qmd_log_stats(None)
    filtered-logs.json                  # get_qmd_logs(Some("project-alpha"))
  provider-limits/
    session-log-fallback.json           # fallback_session_logs() against codex fixture
```

## Normalizations

Apply these normalizations before writing golden files:

1. **Sort unordered maps/records** by key (e.g., `tool_calls`, `bash_commands`, `read_files`) — the Rust HashMap iteration order is non-deterministic.
2. **Sort array fields** that are unordered from the backend's perspective (e.g., `models_used` — sort by model_id).
3. **Do NOT sort** arrays where order is meaningful (e.g., `sessions_by_date`, `entries`, `recent_sessions`).
4. **Redact `db_path`** in QMD responses — replace absolute paths with a placeholder like `<FIXTURE_ROOT>/index.sqlite` since these contain machine-local paths.
5. **Redact `db_size_bytes`** in QMD index/status responses — file sizes vary by platform and SQLite version. Record the value but mark it as `"__unstable__"` or exclude it from comparison.
6. **Pin timezone** — set `TZ=UTC` in the test environment. The analytics code uses local timezone for date bucketing (`sessions_by_date`, `cost_by_date`).
7. **Redact `file_size_bytes`** in session summaries — JSONL file sizes may differ across platforms due to line endings.

## Implementation location

Recommended: `src-tauri/tests/golden_capture.rs` or `src-tauri/src/bin/capture_goldens.rs`

The binary needs access to the same crate internals (parser, cache, qmd commands, qmd_log_cache, provider_limits). If module visibility is an issue, use `#[cfg(test)]` integration tests that `use` the crate.

## Key functions to call

### Analytics/Sessions (from `src-tauri/src/cache.rs`)
- `SessionCache::new()` + trigger initial parse via `cache.get_analytics_overview(None, 0).await`
- `cache.list_projects().await`
- `cache.get_all_sessions(None, 0).await`
- `cache.get_session_detail(&session_id).await`
- `cache.get_project_file_stats(&project_path, 0).await`
- `cache.get_time_breakdown(30, None).await`
- `cache.get_tool_details("read", None, 0).await`
- `SessionCache::get_file_sizes(paths)`
- `cache.get_session_entries(&session_id).await`

### QMD reads (from `src-tauri/src/commands/qmd.rs`)
- `qmd_list_indexes()` — these are standalone async functions, not methods on a struct
- `qmd_get_status(index)` 
- `qmd_list_collections(index)`
- `qmd_get_collection_detail(index, name)`
- `qmd_check_availability()`

Note: QMD commands use `#[tauri::command]` with `State<>` params. For the golden capture, you may need to call the underlying `open_db()` and query logic directly, or restructure the commands slightly to be testable without Tauri state. Keep any restructuring minimal.

### QMD logs (from `src-tauri/src/qmd_log_cache.rs`)
- `QmdLogCache::new()` + `cache.get_qmd_logs(None).await`
- `cache.get_qmd_log_stats(None).await`

### Provider limits (from `src-tauri/src/provider_limits/codex.rs`)
- `fallback_session_logs()` — this is the only fixture-testable path. The `probe_app_server()` path requires a live binary.

## Rules

- **Do not modify the backend logic.** This task captures current behavior, not improved behavior.
- **Minimal restructuring only** — if a function needs to be extracted from a Tauri command to be testable, keep the extraction small and ensure the command still calls the extracted function.
- **Write goldens as pretty-printed JSON** for easy diffing.
- **Include a manifest** — `golden/manifest.json` listing every golden file with its command name, fixture root, and parameters.

## Verification

1. All golden files are valid JSON and parse against the corresponding Zod schemas in `contracts/`.
2. Running the capture binary twice produces identical output (determinism check).
3. Golden values match the expected values documented in each fixture scenario's `README.md`.

## Acceptance

- Golden files exist for all commands listed above
- Normalizations are applied consistently
- A capture binary/test exists that can regenerate goldens from fixtures
- `golden/manifest.json` documents every golden file
- Determinism is verified (two runs produce identical output)
