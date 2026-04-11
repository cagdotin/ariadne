# Fix Session Exploration Graph v1 correctness gaps

Status: Complete
Owner: Follow-up implementation agent
Created: 2026-04-10
Spec: [[docs/specs/2026-04-10-session-exploration-graph.md]]
Related plan: [[docs/exec-plans/pending/2026-04-10-session-exploration-graph.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

The first Exploration implementation is in place, but review found a core correctness bug in artifact identity, a high-risk false-edge bug in import resolution, and missing UI behavior coverage.

This fix pass must make the current feature trustworthy before further product iteration.

After this work:
- explored files/docs have one canonical artifact identity across dynamic and static layers
- repo-context relations attach to the same artifacts referenced by exploration events
- file import neighbors are only emitted when the target path actually exists
- exploration caching no longer hides repo-context staleness forever
- the new Exploration route has UI tests for the main click-driven behaviors

Verification target: selecting a file/doc/turn in `/sessions/:id/exploration` highlights one coherent graph/timeline model with no duplicate artifact identities and no obviously false import neighbors.

## Progress

- [x] (2026-04-11) Milestone 1: Unify canonical artifact IDs across dynamic and static layers.
- [x] (2026-04-11) Milestone 2: Make import resolution existence-aware and remove false neighbors.
- [x] (2026-04-11) Milestone 3: Fix exploration cache freshness behavior.
- [x] (2026-04-11) Milestone 4: Add UI interaction tests for Exploration route behavior.
- [x] (2026-04-11) Milestone 5: Re-run review checks and document remaining limitations.

## Surprises & Discoveries

- Observation: the current implementation generates different artifact IDs for the same file depending on whether it came from replay derivation or repo-context derivation.
  Evidence: `derive-exploration.ts` uses underscore-sanitized IDs like `art_src_app.ts`, while `repo-context.ts` uses slash-preserving IDs like `art_src/app.ts`.

- Observation: `resolve_import()` currently returns the first guessed extension candidate even when the file does not exist.
  Evidence: `repo-context.ts` returns the first generated candidate from `SOURCE_EXTENSIONS` without a filesystem existence check.

- Observation: the session-level exploration cache can mask repo-context TTL behavior entirely.
  Evidence: `commands.ts` returns `get_cached(session_id)` before consulting repo-context freshness.

## Decision Log

- Decision: canonical artifact identity should be based on one shared normalization function used by both dynamic and static derivation paths.
  Rationale: the renderer contract needs one stable identity per artifact so events, relations, highlighting, and merging all refer to the same node.
  Date/Author: 2026-04-10 / review follow-up

- Decision: when import resolution is ambiguous, prefer omitting an edge over inventing one.
  Rationale: this feature explicitly prioritizes trustworthy links over maximum recall.
  Date/Author: 2026-04-10 / review follow-up

- Decision: UI interaction coverage is required before calling the current slice stable.
  Rationale: the product value is click-driven causal explanation, not just backend payload generation.
  Date/Author: 2026-04-10 / review follow-up

## Outcomes & Retrospective

- **Duplicate artifact identity**: Fully eliminated. A shared `artifact-ids.ts` module provides `make_artifact_id()`, `make_section_id()`, and `make_discovery_artifact_id()` used by both `derive-exploration.ts` and `repo-context.ts`. The canonical format is `art_<relative/path.ext>` (preserves slashes). Dynamic derivation now converts absolute paths to relative using project_path before ID generation.
  - Before: `art_src_app.ts` (dynamic) vs `art_src/app.ts` (static) for the same file.
  - After: `art_src/app.ts` everywhere.

- **Import-resolution edge cases**: `resolve_import()` now checks `fs.statSync()` before returning any candidate. Supported: extensionless imports (tries all extensions), `.js` to `.ts`/`.tsx` mapping, `index.*` directory imports. Nonexistent files produce no edge. No intentional unsupported cases remain.
  - Before: `import './phantom'` would emit a `file_imports_file` edge to `phantom.ts` even when it doesn't exist.
  - After: only real files get edges.

- **Cache invalidation**: Solved with payload splitting. The exploration cache now stores only the dynamic (replay-derived) layer. On each request, the dynamic layer is cloned and fresh repo-context is merged. The repo-context cache continues to use its own 5-minute TTL. This means repo-context staleness is observable without backend restart.

- **UI test coverage**: 16 tests in `exploration-selection.test.ts` covering:
  - Turn selection highlighting (events + artifacts)
  - Event selection highlighting (event + linked artifact + relation endpoints)
  - Artifact selection highlighting (artifact + referencing events + relation endpoints)
  - Related relations computation
  - Causal chain computation (incoming relations)
  - Full selection flow integration (turn → events/artifacts, artifact → inspector relations, unexplored neighbor distinction)
  - Route-level wiring not yet tested (no jsdom/testing-library infrastructure); selection logic is tested as pure functions.

- **Validation results**: `bun run typecheck` passes. `bun run test` passes (672 tests, 40 files). `bun run lint` has 2 pre-existing errors in `cost-tab.tsx` and `patterns-tab.tsx` (unrelated template literal style issues) and 1 pre-existing warning (`MockFs` unused type).

## Context and orientation

### Files directly implicated by review

| Path | Issue |
|---|---|
| `backend/analytics/exploration/derive-exploration.ts` | Dynamic artifact IDs are generated here. |
| `backend/analytics/exploration/repo-context.ts` | Static artifact IDs and import-neighbor edges are generated here. |
| `backend/analytics/exploration/commands.ts` | Dynamic/static merge and top-level cache behavior live here. |
| `backend/analytics/exploration/exploration-cache.ts` | Session-scoped memoization currently has no freshness model. |
| `backend/analytics/exploration/repo-context-cache.ts` | Repo-context cache has TTL, but current command flow can bypass it. |
| `src/components/exploration/exploration-view.tsx` | Highlighting behavior depends on canonical IDs. |
| `src/components/exploration/exploration-inspector.tsx` | Inspector explanation depends on correct relation wiring. |
| `src/pages/session-detail-exploration.tsx` | Route-level loading surface for the new feature. |
| `tests/unit/backend/exploration-derive.test.ts` | Existing backend derivation coverage. |
| `tests/unit/backend/repo-context.test.ts` | Existing repo-context coverage. |

### Review findings this plan addresses

1. **Blocking**: duplicate artifact identities between dynamic and static layers break graph/timeline coherence.
2. **Warning**: import resolution creates false `file_imports_file` and `adjacent_unexplored` edges.
3. **Warning**: exploration cache can serve stale repo-context forever.
4. **Warning**: Exploration UI has no interaction tests yet.

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests that expose the bug or missing behavior,
2. implement the smallest change that makes the tests pass,
3. run targeted tests,
4. run broader validation before moving on.

### Milestone 1 — Canonical artifact IDs

Add a single shared artifact-ID normalization helper and use it in both:
- `derive-exploration.ts`
- `repo-context.ts`

Requirements:
- one file/doc path maps to one artifact ID everywhere
- merge logic in `commands.ts` must enrich existing artifacts rather than duplicating them
- selection/highlighting in the renderer must continue to work without code changes beyond any necessary cleanup

Tests to add first:
- dynamic and static derivation produce the same artifact ID for the same explored file
- merging repo-context into exploration payload does not create duplicate artifacts for the same path
- selecting an event-linked artifact still reaches repo-context relations through the shared ID

### Milestone 2 — Existence-aware import resolution

Tighten `resolve_import()` and any related import logic in `repo-context.ts`.

Requirements:
- only emit import edges for files that actually exist
- support common extensionless local imports and `index.*` patterns where the file exists
- keep skipping bare package specifiers
- avoid creating `adjacent_unexplored` edges for invented targets

Tests to add first:
- extensionless import resolves to an existing local file only
- nonexistent relative import yields no relation
- directory import resolves to existing `index.ts`/`index.tsx`/etc. only when present
- repo-context no longer creates ghost unexplored neighbors from guessed files

### Milestone 3 — Cache freshness model

Make `get_session_exploration` respect freshness.

Acceptable solutions include:
- giving exploration payloads their own TTL and rebuild path,
- caching only the dynamic replay-derived layer and merging fresh repo-context on each request,
- or explicitly invalidating session exploration cache when repo-context should refresh.

Requirements:
- repo-context TTL must matter in practice
- cached exploration should not remain permanently stale for the lifetime of the backend process
- the implementation should stay simple and explainable

Tests to add first:
- session exploration payload refreshes when repo-context freshness expires or invalidates
- dynamic replay caching, if retained, does not prevent updated repo-context from appearing

### Milestone 4 — UI interaction tests

Add component/route tests for the new surface.

Required behaviors to cover:
- selecting a turn highlights downstream events/artifacts
- selecting an artifact shows the expected inspector content
- selecting an event shows related relations
- one-hop unexplored neighbors are visibly distinct from explored artifacts
- session-detail navigation behavior for Conversation / Traces / Exploration matches the intended route affordances

Prefer behavior assertions over snapshots.

### Milestone 5 — Revalidation and cleanup

Run:
- targeted backend tests
- new UI tests
- `bun run typecheck`
- `bun run test`
- `bun run lint`

Then confirm manually on a real session that:
- duplicate artifacts are gone
- doc/file relations connect to the event-linked artifacts
- import neighbors are plausible
- the inspector explanations make sense from actual selection state

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

1. Add shared artifact-ID helper near exploration backend code or in a small shared exploration utility module.
2. Update `derive-exploration.ts` and `repo-context.ts` to use the shared helper.
3. Add failing tests for duplicate artifact merge behavior.
4. Fix merge behavior in `commands.ts` if needed.
5. Add failing tests for extensionless/nonexistent imports.
6. Update `resolve_import()` to check filesystem and only return real targets.
7. Add failing tests for cache freshness behavior.
8. Refactor exploration caching so repo-context freshness is observable.
9. Add renderer/component tests for Exploration interactions and navigation.
10. Run full validation commands and record outcomes.

## Validation and acceptance

This fix pass is complete when all of the following are true:

1. The same source/doc path produces the same artifact ID in both dynamic and static derivation.
2. `merge_repo_context()` no longer causes duplicate artifacts for the same path.
3. Import-neighbor edges are emitted only for real files.
4. Cache behavior allows refreshed repo-context to appear without backend restart.
5. Exploration UI behavior is covered by tests for selection/highlighting/inspector/navigation.
6. `bun run typecheck` passes.
7. `bun run test` passes.
8. `bun run lint` passes or any unrelated pre-existing failures are explicitly documented and isolated.

## Idempotence and recovery

- Shared artifact-ID changes are safe to re-run as long as tests pin the canonical format.
- If import-resolution tightening removes more edges than expected, prefer the stricter behavior first, then add explicit supported cases.
- If cache refactoring becomes invasive, split dynamic and static caches rather than adding hidden invalidation complexity.
- If UI tests are hard to wire at the route level initially, start with component-level tests around `ExplorationView` and then add route wiring coverage.

## Artifacts and notes

- Example before/after artifact IDs: `src/app.ts` was `art_src_app.ts` (dynamic) / `art_src/app.ts` (static). Now `art_src/app.ts` everywhere.
- Example false import edge removed: `import './phantom.js'` when `phantom.js` does not exist no longer creates a `file_imports_file` relation or `adjacent_unexplored` neighbor.
- Cache refresh: dynamic layer is cached; repo-context is freshly merged on each request via `clone_payload()` + `merge_repo_context()`.
- New test files: `tests/unit/components/exploration/exploration-selection.test.ts` (16 tests), plus 6 new tests in `repo-context.test.ts` and 3 new tests in `exploration-derive.test.ts`.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| Shared artifact ID helper | Establishes one stable identity model across exploration layers. |
| Exploration payload contract | Must remain stable while internal identity generation changes. |
| Repo-context import resolver | Main source of current false-neighbor risk. |
| Exploration cache strategy | Must align with the lazy-build + cache product promise. |
| Exploration UI tests | Required to prove the feature’s click-driven value is actually working. |
