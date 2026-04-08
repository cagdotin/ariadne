# Task: Build Parity Comparison Harness for Node Backend

**Status: ✅ Completed**
**Depends on: ✅ record-golden-outputs (completed), ✅ Milestone 3 (completed)**

## Context

This is the final piece of Milestone 2: Contract Freeze & Parity Harness, but it can only be fully implemented once the Node backend exists (Milestone 3+). This task defines the harness so it can be built as soon as the backend runtime skeleton is ready.

The harness runs the Node backend against the same fixture roots used to produce the Tauri goldens, then compares the output. It is a temporary testing tool that gets removed after the migration is complete.

## Spec references

- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md` — Sections 6.3, 9.2
- `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`

## Approach

A TypeScript test suite (using Bun's test runner) that:
1. Sets env vars to point at `fixtures/migration/` roots
2. Imports and calls Node backend command handlers directly (no Electron, no IPC)
3. Serializes responses as JSON
4. Applies the same normalizations as the golden capture
5. Diffs against the golden files in `fixtures/migration/golden/`

## Location

```
tests/parity/
  run-parity.test.ts          # Main test file
  normalize.ts                # Shared normalization helpers
  diff.ts                     # JSON diff utility
  README.md                   # How to run, what it tests, when to delete
```

## Test structure

```typescript
// Pseudocode — actual imports depend on backend module structure

import { describe, test, expect } from "bun:test";
import { readGolden, normalize } from "./helpers";

// Point at fixtures
process.env.ARIADNE_PI_SESSIONS_ROOT = "fixtures/migration/sessions/minimal";
process.env.ARIADNE_QMD_CACHE_ROOT = "fixtures/migration/qmd/cache-root";
process.env.ARIADNE_CODEX_HOME = "fixtures/migration/provider-limits/codex-session-log";

describe("analytics parity", () => {
  test("minimal overview matches golden", async () => {
    const result = await backend.get_analytics_overview(null, 0);
    const golden = readGolden("analytics/minimal-overview.json");
    expect(normalize(result)).toEqual(normalize(golden));
  });
  // ... one test per golden file
});
```

## Normalization rules (must match golden capture)

1. Sort unordered maps/records by key
2. Sort `models_used` arrays by `model_id`
3. Do NOT sort ordered arrays (`sessions_by_date`, `entries`, etc.)
4. Redact `db_path` in QMD responses
5. Redact `db_size_bytes` in QMD responses
6. Pin `TZ=UTC`
7. Redact `file_size_bytes` in session summaries

These rules must be identical to the ones applied during golden recording. The `normalize.ts` module should be shared or kept in exact sync.

## Parity test matrix

| Golden file | Backend function | Fixture root |
|---|---|---|
| `analytics/minimal-overview.json` | `get_analytics_overview(null, 0)` | `sessions/minimal` |
| `analytics/minimal-sessions.json` | `get_all_sessions(null, 0)` | `sessions/minimal` |
| `analytics/minimal-session-detail.json` | `get_session_detail(id)` | `sessions/minimal` |
| `analytics/multi-project-overview-all.json` | `get_analytics_overview(null, 0)` | `sessions/multi-project` |
| `analytics/multi-project-overview-filtered.json` | `get_analytics_overview("project-alpha", 0)` | `sessions/multi-project` |
| `analytics/multi-project-overview-ranged.json` | `get_analytics_overview(null, range_days)` | `sessions/multi-project` |
| `analytics/multi-project-sessions.json` | `get_all_sessions(null, 0)` | `sessions/multi-project` |
| `analytics/multi-project-file-stats.json` | `get_project_file_stats("project-alpha")` | `sessions/multi-project` |
| `analytics/multi-project-time-breakdown.json` | `get_time_breakdown(30, null)` | `sessions/multi-project` |
| `analytics/multi-project-tool-details.json` | `get_tool_details("read", null, 0)` | `sessions/multi-project` |
| `analytics/multi-project-file-sizes.json` | `get_file_sizes(paths)` | `sessions/multi-project` |
| `replay/minimal-entries.json` | `get_session_entries(id)` | `sessions/minimal` |
| `replay/branching-entries.json` | `get_session_entries(id)` | `sessions/branching-replay` |
| `qmd/list-indexes.json` | `qmd_list_indexes()` | `qmd/cache-root` |
| `qmd/default-status.json` | `qmd_get_status("default")` | `qmd/cache-root` |
| `qmd/default-collections.json` | `qmd_list_collections("default")` | `qmd/cache-root` |
| `qmd/default-collection-detail.json` | `qmd_get_collection_detail(...)` | `qmd/cache-root` |
| `qmd/work-status.json` | `qmd_get_status("work")` | `qmd/cache-root` |
| `qmd/availability.json` | `qmd_check_availability()` | `qmd/cache-root` |
| `qmd-logs/all-logs.json` | `get_qmd_logs(null)` | `sessions/qmd-cli` |
| `qmd-logs/all-log-stats.json` | `get_qmd_log_stats(null)` | `sessions/qmd-cli` |
| `qmd-logs/filtered-logs.json` | `get_qmd_logs("project-alpha")` | `sessions/qmd-cli` |
| `provider-limits/session-log-fallback.json` | `fallback_session_logs()` | `provider-limits/codex-session-log` |

## Contract validation layer

In addition to golden comparison, every backend response should be validated against its Zod schema from `contracts/`:

```typescript
import { analytics_overview_schema } from "@contracts/analytics/overview";

const result = await backend.get_analytics_overview(null, 0);
// This must not throw
analytics_overview_schema.parse(result);
```

This catches cases where the Node backend returns structurally valid but schema-non-conformant data.

## Rules

- **This harness is temporary.** It exists only to prove Tauri ↔ Node parity during migration.
- **Add a `README.md`** in `tests/parity/` explaining this and linking to the migration spec.
- **Use `bun test`** as the runner (repo rule: always use Bun).
- **Do not import Electron or Tauri.** The harness calls backend functions directly.
- **Fail loudly on any diff.** Show the exact field path and expected vs actual values.

## Verification

1. `bun test tests/parity/` runs all parity tests.
2. All tests pass when the Node backend correctly reimplements the Rust behavior.
3. Schema validation catches type/shape mismatches even when golden values match.

## Acceptance

- Test suite exists at `tests/parity/`
- One test per golden file (23+ tests)
- Shared normalization module
- Contract schema validation on every response
- `README.md` documenting purpose, how to run, and when to delete
- All tests are skipped or stubbed until the Node backend modules exist (tests should not fail in CI before the backend is ported)
