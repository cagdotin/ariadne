# Migration Spec — QMD Logs and Observability Rewrite

Status: Draft
Date: 2026-03-28
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

QMD logs is a separate observability subsystem built from pi session logs, not from QMD SQLite state. It already has its own parser, cache, routes, and scoped badge behavior.

Because it shares source material with analytics but not the same startup path, it is especially vulnerable to migration mistakes:
- accidentally coupling it back into analytics cache initialization
- changing CLI detection semantics
- changing filter or stats behavior
- losing incomplete-call handling or output parsing hints

## 2. Goals and non-goals

### 2.1 Goals
- Port QMD log parsing, caching, stats, and filtering semantics to TypeScript.
- Preserve lazy, separate cache behavior.
- Preserve project-scope filtering and badge/stat outputs.
- Add parity fixtures for command detection and extraction edge cases.

### 2.2 Non-goals
- Redesigning the `/qmd/logs` page UX.
- Adding summarization/clustering of documentation gaps.
- Coupling QMD logs to the analytics cache build path.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/parser/qmd_logs.rs`
- `src-tauri/src/qmd_log_cache.rs`
- `src-tauri/src/models/qmd_logs.rs`
- `src-tauri/src/commands/qmd_logs.rs`
- `src/api/qmd-logs.ts`
- `src/schemas/qmd-logs.ts`
- `src/pages/qmd-logs.tsx`
- `src/components/qmd-logs/*`
- `docs/specs/2026-03-27-qmd-logs.md`
- `docs/ARCHITECTURE.md`
- `docs/knowledge/qmd.md`

### 3.2 Current behavior to preserve
- QMD log cache is separate from `SessionCache`
- cache builds lazily on first logs/stats request
- detection parses assistant bash tool-call blocks, not bashExecution records
- command detection handles env-var-prefixed forms
- tool-call/result correlation uses tool-call block `id` matched to toolResult `toolCallId`
- incomplete tool calls remain visible as entries with `has_output: false`
- stats are filterable by project scope server-side

## 4. Conventions and style

Recommended target modules:

```text
backend/qmd-logs/
  parser.ts
  command-parse.ts
  cache.ts
  stats.ts
  commands.ts
backend/workers/
  qmd-log-build.worker.ts
```

Keep parser, cache, and stats separate so parity tests can isolate failures.

## 5. Domain model

### 5.1 Commands covered
- `get_qmd_logs(project_path?)`
- `get_qmd_log_stats(project_path?)`

### 5.2 Cache model
Recommended behavior:
- one lazy cache holding parsed `QmdLogEntry[]`
- explicit invalidation hook called from session resync
- project filtering applied against cached entries, not via client-only filtering
- stats derived from filtered entries

## 6. Detailed design

### 6.1 Contract changes
**No contract changes.**

### 6.2 Parser rewrite
Port the current parser as a dedicated TypeScript module with explicit helpers for:
- qmd-command detection
- env-prefix stripping
- shell tokenization
- subcommand/index/collection/primary-argument extraction
- output-kind detection
- preview truncation

Recommended split:
- `command-parse.ts` handles string parsing and detection
- `parser.ts` handles session JSONL traversal and call/result correlation

### 6.3 Caching model
Preserve the intentional separation from analytics:
- QMD logs should not initialize as part of Overview/Sessions/Usage loads
- cache builds should happen in a worker thread because they still parse all sessions
- cache invalidation should be triggered by the same resync flow that rebuilds analytics

### 6.4 Filtering/stats behavior
Preserve server-side filtering by optional `project_path`:
- `get_qmd_logs()` returns only scoped rows when requested
- `get_qmd_log_stats()` derives totals, errors, unique projects, unique sessions, and `by_subcommand` from the same filtered set

Phase-1 rule:
- keep time-range behavior unchanged; it currently does not participate in QMD logs filtering

### 6.5 Output semantics to preserve
- `output_preview` is table-focused truncation, not the full output
- `output_kind` is best-effort and may be `unknown`
- JSON-like output detection should preserve current broad heuristics rather than becoming stricter in phase 1

### 6.6 Fixture/parity strategy
Required fixture cases:
- plain `qmd query ...`
- `cd repo && qmd query ...`
- env-var-prefixed `qmd` command
- piped `qmd search --json ... | jq ...`
- non-QMD bash command that should be ignored
- quoted `qmd` text that should not false-positive
- missing tool result
- JSON output kinds and raw-text output kinds

### 6.7 Semantic drift traps
1. The parser scans assistant `toolCall` blocks, not arbitrary command strings elsewhere.
2. `toolCallId` is not on the assistant toolCall block in the authoritative form; the block `id` is the correlation key.
3. The cache sorts by timestamp descending after parse.
4. Project filtering is path-based.
5. The logs badge on the QMD page depends on scoped stats loading independently from QMD page data.

## 7. Error handling and failure modes

- malformed session lines should be skipped, not fatal
- unparseable commands should still produce rows when the call/result pair is valid and `is_qmd_command()` matched
- missing outputs should produce incomplete entries rather than silent drops
- cache build failure should not poison analytics cache state

## 8. Security and safety considerations

- session-derived command/output text is untrusted and display-only
- JSON output parsing must remain data-only and never execute content
- fixture data should be scrubbed of sensitive search queries where necessary

## 9. Testing strategy

### 9.1 Unit tests
- command detection
- env-prefix stripping
- tokenization
- subcommand/collection/index parsing
- preview truncation
- output-kind detection

### 9.2 Integration/parity tests
- current Rust parser/cache outputs vs Node parser/cache outputs on shared fixture sessions
- `resync_sessions()` invalidation behavior parity
- scoped stats parity used by the QMD page badge and `/qmd/logs`

## 10. Implementation checklist
- [ ] Port command detection/parsing helpers.
- [ ] Port session traversal and tool-call/result correlation.
- [ ] Port lazy cache with worker-thread build path.
- [ ] Preserve resync invalidation wiring.
- [ ] Add fixture sessions and golden outputs for logs/stats.

## 11. Rollout / cutover notes

- QMD logs can be cut over independently from the main QMD subsystem because its data source is session logs, not QMD SQLite.
- Do not tie this cutover to analytics startup changes; preserve the separate lazy-loading behavior.

## 12. Dependencies and parallelization

### Depends on
- contract freeze/parity harness
- backend process architecture
- analytics/session fixture-root strategy (shared source roots only)

### Can proceed in parallel with
- analytics/session backend port
- QMD subsystem rewrite
- provider limits rewrite
- Electron shell work

### Must not run in parallel with
- another agent editing shared QMD-log contracts or the session-fixture goldens without coordination

## 13. Open questions
- Should the Node port preserve the current simple JSON-output heuristic exactly, or freeze it with golden tests first and only then consider a richer typed output-kind classifier in a separate follow-up?
