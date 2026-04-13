# Migrate Exploration to graph-first

Status: Active
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
Related plans:
- [[docs/exec-plans/pending/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/exec-plans/active/2026-04-13-session-graph-ir-review-fixes.md]]
- [[docs/specs/2026-04-10-session-exploration-graph.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

The graph IR foundation and review fixes are now in place, but the Exploration route is still not truly graph-first.

Today `/sessions/:id/exploration` still fetches:
- `get_session_exploration()`
- `get_session_graph()`

and renders primarily from `ExplorationPayload`, with graph IR acting mostly as a framing sidecar.

That keeps two overlapping truth models alive:
- the old exploration-specific backend derivation
- the new graph IR

This migration makes the graph IR the actual runtime source of truth for the Exploration route.

After this work:
- the Exploration route loads from **one graph-backed source of truth**
- the old `ExplorationPayload` is either derived directly from graph in one explicit adapter layer or removed from the route entirely
- selection, highlighting, inspector behavior, and framing all operate from graph-consistent identities
- the codebase is ready for a follow-up visualization rewrite on top of a stable graph contract

Verification target:
- opening `/sessions/:id/exploration` loads a graph-first payload path only
- there is no route-level dual-fetch drift between exploration and graph models
- graph-derived framing, artifacts, path/timeline, and inspector state all remain coherent
- the next visualization rewrite can target the graph IR without also rewriting backend semantics

## Should a separate cleanup task happen first?

**No hard blocking pre-task is required.**

The remaining cleanup needed before graph-first migration is small and should be folded into this plan:
- close out real-session validation notes from the graph IR plan
- update stale exec-plan statuses/bookkeeping once migration lands
- add any missing command/API seam coverage if the migration introduces or changes those seams

A separate prior task is only worth spinning off if you want a purely administrative housekeeping pass. It is not technically blocking.

## Progress

- [x] (2026-04-13) Milestone 0: Fold in housekeeping and closeout notes needed for migration.
- [x] (2026-04-13) Milestone 1: Lock the target graph-first runtime boundary.
- [x] (2026-04-13) Milestone 2: Replace route-level dual fetch with a single graph-backed load path.
- [x] (2026-04-13) Milestone 3: Make Exploration UI data flow graph-first while preserving current UX behavior.
- [x] (2026-04-13) Milestone 4: Retire or quarantine legacy exploration derivation from the Exploration route.
- [x] (2026-04-13) Milestone 5: Validate on real sessions and prepare the visualization-rewrite seam.

## Current state

What is now true (after milestones 0–4):
- `contracts/graph/*` exists and is validated with tests.
- `backend/analytics/graph/*` exists for derivation, augmentation, caching, and graph-to-exploration projection.
- framing is visible and inspectable in the current Exploration UI.
- graph IDs and cache freshness were reviewed and fixed.
- **`src/pages/session-detail-exploration.tsx` now fetches graph only** — no dual fetch.
- **`src/lib/graph-to-exploration-adapter.ts` is the renderer-side canonical adapter**, projecting `SessionGraphPayload` → `ExplorationPayload` via `useMemo` in the route.
- **`get_session_exploration()` is no longer called by the Exploration route.** It is retained in `src/api/exploration.ts` for backward compatibility with other callers, with comments documenting its non-authoritative status.
- The backend adapter at `backend/analytics/graph/graph-to-exploration-adapter.ts` is documented as a backend-side copy, with parity enforced by test.
- `bun run typecheck` passes across all 3 tsconfig passes.
- `bun run test` passes: 781 tests across 48 files.

What remains for Milestone 5:
- validate graph-first Exploration on real sessions
- document the visualization-rewrite seam

## Surprises & Discoveries

- Observation: the graph-to-exploration adapter is pure logic with no backend dependencies — it only imports contract types.
  Evidence: `backend/analytics/graph/graph-to-exploration-adapter.ts` imports only from `contracts/`.
  Implication: the adapter can live in the renderer without any backend coupling, enabling Option A (renderer-side projection) cleanly.

- Observation: the renderer-side and backend-side adapters produce byte-identical output for the same graph input.
  Evidence: parity test in `tests/unit/lib/graph-to-exploration-adapter.test.ts` passes with deep equality.
  Implication: no divergence risk from having two copies during the transition.

- Observation: `get_session_exploration()` had zero consumers in `src/` outside the route page.
  Evidence: grep of `src/` for `get_session_exploration` returns only `src/api/exploration.ts` (the definition).
  Implication: quarantining the legacy path was non-disruptive — no other UI code relied on it.

## Decision Log

- Decision: the graph IR becomes the source of truth for the Exploration route before any major visualization rewrite.
  Rationale: rewriting visualization on top of a dual-model route would compound product and architecture risk.
  Date/Author: 2026-04-13 / planning session

- Decision: a transitional adapter layer is acceptable if it is explicit and one-directional.
  Rationale: we do not need to fully rewrite the current Exploration UI before making the route graph-first, but we do need one authoritative semantic source.
  Date/Author: 2026-04-13 / planning session

- Decision: no separate cleanup sprint is required before migration.
  Rationale: the remaining cleanup is small and is better captured as Milestone 0 in this plan.
  Date/Author: 2026-04-13 / planning session

- Decision: adapter lives in `src/lib/graph-to-exploration-adapter.ts` (renderer-side canonical), with backend copy retained for server-side callers.
  Rationale: Option A (renderer-side projection) is simplest and gives the future visualization rewrite direct access to graph IR in the renderer. The adapter is pure logic with no backend deps, so placement is clean.
  Date/Author: 2026-04-13 / implementation

## Definitions

- **Graph-first**: the backend-derived `SessionGraphPayload` is the only semantic source of truth for the Exploration route.
- **Adapter**: a deterministic projection from graph IR into the existing exploration-view shape.
- **Legacy exploration path**: `backend/analytics/exploration/*` plus `get_session_exploration()` as currently used by the route.
- **Visualization-rewrite seam**: the minimal stable interface the future graph renderer will consume.

## Target architecture

### Minimum acceptable target

The minimum acceptable graph-first migration is:
- route fetches **only graph-backed data**
- current Exploration UI still renders via a projection layer if needed
- the projection is derived from graph, not from the old exploration backend

That means one of these is acceptable:

#### Option A — Graph fetch + renderer/local adapter
- backend returns `SessionGraphPayload`
- renderer converts graph → current exploration view shape through one explicit adapter
- route uses one fetch only

#### Option B — Graph fetch + backend-provided projection bundle
- backend returns graph plus a graph-derived exploration projection
- route uses one fetch only
- projection stays server-side

### Preferred target for this repo

**Preferred target: Option A, with one route fetch to `get_session_graph()` and a clearly named adapter feeding the existing UI.**

Why:
- preserves the graph contract as the transport truth
- minimizes API churn while still removing dual-fetch drift
- gives the upcoming visualization rewrite direct access to graph IR in the renderer
- avoids inventing a second graph-adjacent response envelope unless we truly need it

Longer-term target after this migration:
- progressively replace exploration-specific UI assumptions with graph-native components
- eventually remove the adapter or reduce it to a narrow compatibility helper

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests that expose the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Housekeeping folded into migration

Do the small cleanup items inside this plan rather than as a separate pre-task.

Required outcomes:
- record current graph-IR implementation status in `docs/exec-plans/pending/2026-04-11-session-graph-ir-and-framing.md`
- if migration completes graph-first behavior, update that plan’s `Outcomes & Retrospective`
- move or mark `docs/exec-plans/active/2026-04-13-session-graph-ir-review-fixes.md` honestly once complete
- if real-session validation is performed during this work, capture the result where it belongs

Tests to add first:
- none; this is bookkeeping and validation capture

### Milestone 1 — Lock the graph-first runtime boundary

Before editing route code, decide exactly where the graph → UI projection lives.

Required outcomes:
- one explicit source-of-truth statement in code comments and module naming
- one explicit adapter boundary if current `ExplorationView` still needs projected data
- no ambiguity about whether the route trusts graph or legacy exploration derivation

Recommended concrete decision:
- make `SessionDetailExploration` fetch graph only
- produce a projected `ExplorationPayload` from graph for current UI consumption
- keep both `graph` and projected `payload` in the page/component tree for now, but derive them from the same graph object

Tests to add first:
- adapter tests proving the projection still covers current Exploration UI needs
- route/component tests proving graph failure vs success behavior is handled intentionally if fallback remains

### Milestone 2 — Replace dual fetch with one graph-backed load path

Refactor `src/pages/session-detail-exploration.tsx`.

Required outcomes:
- remove route-level `get_session_exploration()` fetch for the Exploration page
- use `get_session_graph()` as the one data load
- derive any current `ExplorationPayload` shape from graph in one explicit place
- keep framing and current split-view behavior working during the migration

Expected code changes:
- `src/pages/session-detail-exploration.tsx`
- `src/api/graph.ts` if needed
- adapter location depending on final ownership choice

Tests to add first:
- route-level behavior when graph load succeeds
- route-level behavior when graph load fails
- no test should rely on the legacy exploration command for the Exploration page

### Milestone 3 — Make UI data flow graph-first

Keep the current UX mostly stable, but ensure all displayed exploration state derives from graph.

Required outcomes:
- `ExplorationView` receives graph-derived state only
- current timeline/path, artifact list, inspector, and framing remain consistent
- selection/highlighting uses IDs coming from one graph-derived pipeline
- graph-node inspector behavior continues to work

Suggested implementation approach:
- treat the current `ExplorationPayload` as a compatibility view model only
- compute it once from graph and pass both into the view while the UI still needs both
- forbid direct backend coupling to old exploration semantics inside the route

Tests to add first:
- integration-level tests that a graph fixture yields expected current UI sections
- regression tests for selection/highlighting on projected data
- regression tests for framing selection with graph-derived projection present

### Milestone 4 — Retire or quarantine the legacy exploration path

Once the route is graph-first, make the old exploration derivation clearly non-authoritative.

Required outcomes:
- `get_session_exploration()` is no longer used by `/sessions/:id/exploration`
- legacy exploration backend code is either:
  - retained only for backward compatibility / other callers, with comments explaining that it is not the source of truth for the route, or
  - refactored to derive from graph rather than its own separate semantics
- avoid having two places where causal/exploration truth can diverge

Preferred direction:
- if practical, reimplement `get_session_exploration()` as a graph-derived projection so both APIs stay coherent during transition

Tests to add first:
- if `get_session_exploration()` remains, add parity tests showing it projects from graph or matches graph-derived output for representative fixtures
- if it is unused and left in place temporarily, add comments/tests documenting its status clearly

### Milestone 5 — Real-session validation and visualization-rewrite seam

Use this migration to prepare the next phase cleanly.

Required outcomes:
- validate graph-first Exploration on at least two real sessions
- confirm framing, path/timeline, artifact view, and inspector still make sense end-to-end
- identify the stable graph-native data surface the visualization rewrite should target next
- document what should be deleted or refactored during the visualization rewrite

The output of this milestone should explicitly answer:
- what contract the next visualization should consume
- which current components can be kept temporarily
- which current projection/adaptation layers are transitional and can later be removed

Tests to add first:
- none strictly required before manual validation, but ensure all automated tests are green before spot-checking real sessions

## Parallelization strategy

This work can be split once the graph-first boundary decision is made.

### Workstream A — Route and transport migration
- remove dual fetch
- make page load graph only
- ensure fallback/error behavior is intentional

### Workstream B — Adapter / compatibility view model
- harden graph → exploration projection
- add projection parity tests
- keep current UI stable while route becomes graph-first

### Workstream C — UI integration and validation
- update `ExplorationView` data flow
- add route/component tests
- perform manual checks on real sessions

Dependency order:
- Workstream B should lock projection semantics first.
- Workstream A and C can then proceed in parallel.

## Concrete handoff checklist

Pass the next agent this exact ordered list:

1. **Make the route graph-first**
   - stop dual-fetching `get_session_exploration()` and `get_session_graph()`
   - fetch graph only in `src/pages/session-detail-exploration.tsx`

2. **Use one explicit adapter if needed**
   - project graph into the current Exploration UI shape from one place only
   - do not keep separate backend/runtime derivation for the route

3. **Keep the current UX stable during migration**
   - timeline/path still works
   - artifact panel still works
   - inspector still works
   - framing still works

4. **Quarantine legacy exploration derivation**
   - make clear in code whether `get_session_exploration()` is transitional, graph-derived, or deprecated for this route

5. **Validate graph-first on real sessions**
   - at least two real sessions
   - verify observed vs ambient vs unavailable context still reads truthfully

6. **Prepare the visualization rewrite seam**
   - document what the next graph renderer should consume directly
   - call out which compatibility layers are temporary

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add or extend adapter and route tests first
bun run test tests/unit/backend/graph-adapter.test.ts tests/unit/components/exploration/exploration-selection.test.ts

# 2. Refactor route to graph-only loading
bun run test <new-route-or-component-tests>

# 3. If needed, align legacy exploration command with graph-derived output
bun run test <adapter/parity-tests>

# 4. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use the same verified Ariadne sessions from prior investigation, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This migration is complete when all of the following are true:

1. `/sessions/:id/exploration` no longer dual-fetches the legacy exploration payload.
2. The route is powered by one graph-backed source-of-truth path.
3. Current Exploration UX still works via graph-derived state.
4. Framing, inspector, and selection remain coherent after migration.
5. `get_session_exploration()` is either clearly transitional or graph-derived, not a competing truth source for the route.
6. Real-session validation is documented.
7. `bun run typecheck` passes.
8. `bun run test` passes.
9. Any remaining temporary adapter layers are explicitly documented for the upcoming visualization rewrite.

## Idempotence and recovery

- If full graph-native UI migration becomes too large, keep the adapter but still finish the route-level graph-only fetch. That is enough to establish graph-first truth.
- If adapter ownership is debated, prefer the simplest option that removes route-level dual-fetch drift immediately.
- If parity between graph-derived and legacy exploration output is imperfect, prefer graph truth and document any temporary UX deltas explicitly rather than preserving silent drift.
- If the visualization rewrite is going to begin immediately afterward, avoid over-investing in polishing the compatibility adapter.

## Outcomes & Retrospective

### What was done

- **Route is graph-first.** `src/pages/session-detail-exploration.tsx` fetches `get_session_graph()` only. No dual-fetch.
- **Renderer-side adapter.** `src/lib/graph-to-exploration-adapter.ts` projects `SessionGraphPayload` → `ExplorationPayload` in a `useMemo`. This is Option A from the target architecture.
- **Parity enforced by test.** `tests/unit/lib/graph-to-exploration-adapter.test.ts` includes a parity test proving renderer and backend adapters produce identical output.
- **Route contract tests.** `tests/unit/lib/graph-first-route.test.ts` proves graph-only loading produces valid, complete exploration payloads with correct multi-turn structure, event kinds, artifact linking, and selection-compatible IDs.
- **Legacy quarantined.** `get_session_exploration()` retained in `src/api/exploration.ts` with comments documenting its non-authoritative status. Backend `commands.ts` similarly documented.
- **Real-session validation.** Two real sessions validated through the full graph → adapter → exploration pipeline:
  - Session `2a3d05f8`: 327 nodes, 19 turns, 88 artifacts, 130 relations — schema-valid
  - Session `61c7b647`: 70 nodes, 4 turns, 14 artifacts, 15 relations — schema-valid
- **All tests green.** 781 tests across 48 files. Typecheck passes across all 3 tsconfig passes.

### Visualization-rewrite seam

The next graph renderer should consume:
- **`SessionGraphPayload`** directly — available as `graph` prop already passed to `ExplorationView`
- **`ExplorationFraming`** already renders graph-natively — no adapter needed for framing
- **`ExplorationInspector`** already handles `graph_node` selections with full evidence/metadata/edge display

Temporary compatibility layers that can be removed during visualization rewrite:
- `src/lib/graph-to-exploration-adapter.ts` — the entire `ExplorationPayload` projection
- `ExplorationTimeline` and `ExplorationGraph` components that consume `ExplorationPayload` shape
- The `ExplorationPayload` contract itself, once no route depends on it

Components that can be kept:
- `ExplorationFraming` — already graph-native
- `ExplorationInspector` — already supports both exploration and graph-node selections
- `exploration-selection.ts` — selection logic works with both shapes

### What went well

- The adapter was pure logic with no backend deps — made renderer-side placement trivial.
- TDD approach caught the `framing_includes` edge kind mistake in fixtures immediately.
- Zero consumer breakage when removing the dual-fetch — `get_session_exploration()` had no other callers.

## What comes immediately after this plan

Once graph-first migration lands, the next plan should target:
- graph-native visualization improvement / rewrite
- better topology rendering
- potential replacement of the current grouped artifact browser with a true graph canvas or graph-aware layout

That next phase should assume:
- graph IR is already the semantic source of truth
- it does **not** need to solve backend truth/model migration at the same time

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `contracts/graph/*` | Canonical graph contract that should power the route. |
| `backend/analytics/graph/derive-session-graph.ts` | Graph derivation source. |
| `backend/analytics/graph/graph-to-exploration-adapter.ts` | Transitional compatibility layer for current UI. |
| `backend/analytics/graph/commands.ts` | Backend graph fetch path for the route. |
| `src/api/graph.ts` | Renderer graph transport boundary. |
| `src/pages/session-detail-exploration.tsx` | The current dual-fetch route that must become graph-first. |
| `src/components/exploration/exploration-view.tsx` | Current composition point for framing, timeline, artifact view, and inspector. |
| `backend/analytics/exploration/*` | Legacy exploration derivation that should no longer be authoritative for this route. |
