# Migration Spec — Analytics and Session Backend Rewrite

Status: Draft
Date: 2026-03-28
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

The analytics/session backend is the largest Rust-owned subsystem in Ariadne. It discovers pi session JSONL files, parses session summaries, builds in-memory aggregates, filters across project/time scopes, serves file analytics, and loads raw replay entries on demand.

This rewrite must preserve current behavior while moving the implementation into TypeScript. The risk is not only performance — it is semantic drift in filtering, aggregation, replay loading, and file analytics.

## 2. Goals and non-goals

### 2.1 Goals
- Port current session discovery, session parsing, analytics aggregation, and replay loading semantics to TypeScript.
- Preserve current command contracts and filtering semantics.
- Keep heavy parse/aggregation work off Electron main.
- Define cache, memory, and worker-thread behavior explicitly.
- Add fixtures and parity checks for analytics, replay, and file analytics.

### 2.2 Non-goals
- Reworking chart/page presentation.
- Changing time-range semantics.
- Adding a persisted analytics database.
- Redesigning session replay UI data structures.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/cache.rs`
- `src-tauri/src/parser/discovery.rs`
- `src-tauri/src/parser/session.rs`
- `src-tauri/src/models/session.rs`
- `src-tauri/src/models/analytics.rs`
- `src-tauri/src/commands/analytics.rs`
- `src/api/analytics.ts`
- `src/schemas/session.ts`
- `src/schemas/analytics.ts`
- `src/components/session-viewer/types.ts`
- `src/pages/session-detail.tsx`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`

### 3.2 Current behavior that matters
- discovery walks `~/.pi/agent/sessions/**` and sorts by `file_name`
- summaries are built line-by-line from JSONL
- malformed lines are skipped, not fatal
- `SessionCache` is an in-memory parsed-view cache, not a database
- shared filter helpers apply project scope + `range_days` consistently across analytics methods
- replay entries are loaded on demand from disk, not cached eagerly

## 4. Conventions and style

Recommended target modules:

```text
backend/analytics/
  discovery.ts
  session-parser.ts
  session-types.ts
  session-cache.ts
  aggregations/
    overview.ts
    tool-details.ts
    file-stats.ts
    time-breakdown.ts
  replay-loader.ts
backend/workers/
  analytics-build.worker.ts
  replay-load.worker.ts (optional)
```

Design rule:
- keep parsing and aggregation pure where possible
- keep cache orchestration separate from aggregate math
- keep replay loading separate from summary analytics

## 5. Domain model

### 5.1 Commands covered
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

### 5.2 Target cache model
Recommended runtime objects:

- `SessionSourceConfig` — resolved fixture/home paths
- `SessionSummaryRecord` — TypeScript port of `SessionSummary`
- `SessionCacheStore` — in-memory summaries + last-built metadata
- `AnalyticsBuildResult` — worker-produced summaries and indexes

Cache invariants to preserve:
- lazy initialization on first read
- explicit resync rebuild
- no eager raw-entry cache
- one shared filtering path reused by overview/sessions/tool-details/file-stats/time-breakdown

## 6. Detailed design

### 6.1 Contract changes
**No contract changes** for any analytics/session command in phase 1.

### 6.2 Session discovery rewrite
Port `discover_session_files()` semantics first, including:
- home-root/override resolution
- recursive `.jsonl` walk under encoded project directories
- `dir_name`, `file_name`, and metadata capture
- sorting behavior

Hidden parity trap:
- current sorting is by `file_name`, not full path. Preserve it first, even if later cleanup is desirable.

### 6.3 Session parser rewrite
Port current line-by-line parser behavior exactly:
- skip malformed lines
- derive `project_name` from final cwd path segment
- track first user message truncation behavior
- parse assistant usage/cost fields
- collect bash program counts from the first token only
- collect read/edit/write file maps
- track `toolResult` calls/errors separately from tool-call extraction
- derive `ended_at` and `duration_seconds`

Worker-thread recommendation:
- parse files in batches inside worker threads so cache rebuilds do not block the backend service event loop

### 6.4 Aggregation/cache rewrite
Port current aggregate families as separate pure functions over `SessionSummaryRecord[]`:
- overview
- list_projects
- all_sessions
- tool_details
- project_file_stats
- time_breakdown

Important invariants to preserve:
- shared `project_path` + `range_days` filtering semantics
- `range_days == 0` means all time
- project identity is `project_path`, not display name
- local-timezone date bucketing for date/hour views
- `distinct_session_count` for file insights

### 6.5 Replay entry loading rewrite
`get_session_entries()` should remain a separate path from summary analytics.

Recommended behavior:
- locate session file via cached `session_dir + file_name`
- read raw JSONL lines on demand
- preserve header + raw entries + `leaf_id`
- avoid eagerly parsing entire replay trees into memory during cache initialization

### 6.6 Performance considerations
Required posture:
- cache builds happen in worker threads
- backend service keeps only summaries in memory after cache build
- replay entries are streamed/read on demand
- file-size stats remain cheap synchronous metadata calls or batched async fs stats

Potential future optimization, explicitly out of scope for phase 1:
- persisted summary snapshots or incremental file-change indexing

### 6.7 Memory model
Recommended memory rules:
- keep one in-memory summary cache
- do not cache raw replay entries globally
- avoid duplicating summary arrays per request; use filtered views and only clone when contract output needs value copies
- if worker results are large, transfer serialized summaries once and reuse them in-process

### 6.8 Parity fixture strategy
Must include fixture cases for:
- multiple projects with duplicate display names but distinct paths
- sessions spanning range filters and timezone boundaries
- sessions with malformed lines
- sessions with branching replay
- sessions with read/edit/write-heavy file analytics
- sessions with compactions and mixed model usage

### 6.9 Semantic drift traps
1. Current `first_user_message` truncates to 200 chars with UTF-8 boundary safety.
2. Bash program extraction uses only the first token; it does not shell-parse commands fully.
3. Tool calls are inferred partly from assistant content blocks and partly from tool results.
4. Replay `leaf_id` is simply the last entry id encountered.
5. Local timezone affects `sessions_by_date`, `cost_by_date`, and hourly buckets.
6. `resync_sessions()` currently also invalidates QMD log cache — analytics rewrite cannot forget that cross-subsystem hook.

## 7. Error handling and failure modes

- unreadable session files should log and skip, not crash the whole cache build
- malformed JSON lines should be skipped inside the parser
- replay file missing on demand should return explicit error
- cache build failures should not leave half-written cache state visible
- partial parse failures should not silently zero out existing good cache data during refresh

## 8. Security and safety considerations

- session files remain read-only
- replay content is untrusted text/json and must stay data-only
- fixture roots should avoid personal data leakage

## 9. Testing strategy

### 9.1 Unit tests
- session discovery root resolution
- session parser line handling
- first-user-message truncation
- aggregate helpers for overview/tool/file/time outputs
- replay loader behavior and `leaf_id` tracking

### 9.2 Integration/parity tests
- current Tauri vs Node analytics outputs against shared fixtures
- replay payload parity for `get_session_entries()`
- resync behavior parity, including QMD log cache invalidation hook
- performance smoke tests on a moderately sized fixture set

## 10. Implementation checklist
- [ ] Port discovery logic with fixture-root overrides.
- [ ] Port session parser semantics into pure TS modules.
- [ ] Build worker-driven cache rebuild flow.
- [ ] Port aggregate helpers one command family at a time.
- [ ] Port replay loader with raw payload fidelity.
- [ ] Add parity fixtures/goldens for analytics and replay.

## 11. Rollout / cutover notes

- This subsystem can be cut over command-by-command behind the shared runtime router if needed, but resync/listing/overview should likely flip together because they share cache semantics.
- Session replay should not be cut over before raw payload parity is proven.

## 12. Dependencies and parallelization

### Depends on
- contract freeze/parity harness
- backend service runtime skeleton

### Can proceed in parallel with
- QMD subsystem rewrite
- QMD logs rewrite
- provider limits rewrite
- Electron shell work

### Must not run in parallel with
- another agent editing analytics contracts or shared filtering semantics

## 13. Open questions
- Should replay loading use a dedicated worker thread in phase 1, or remain in the backend event loop if on-demand file sizes are proven small enough?
- Do we want to preserve the exact current file-name-only discovery sort if it later proves unintuitive across projects, or freeze it only for parity and document a later cleanup?
