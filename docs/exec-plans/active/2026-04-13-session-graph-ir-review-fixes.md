# Fix Session Graph IR review gaps

Status: Completed
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
Related plan: [[docs/exec-plans/pending/2026-04-11-session-graph-ir-and-framing.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

The new graph IR slice is in place, but review found several issues that should be fixed before treating it as the trustworthy foundation for future Exploration work.

The main risks are:
- graph IR is not yet the single source of truth for Exploration
- canonical graph node ID logic is duplicated across derivation and augmentation modules
- graph cache freshness is unbounded and can serve stale results
- framing UI is present but not wired into the main selection/inspector flow
- key seams lack tests
- repo-wide typecheck is currently failing in adjacent exploration modules

After this fix pass:
- graph identity rules are centralized
- graph freshness is explainable and bounded
- framing nodes are actually inspectable in the UI
- graph transport/augmentation/UI seams have coverage
- the branch is back to a healthy typecheck state
- Exploration is closer to being graph-first rather than graph-adjacent

Verification target: a user can open `/sessions/:id/exploration`, see framing context, click into it for provenance, and trust that observed/ambient graph nodes are stable, non-duplicated, and reasonably fresh.

## Progress

- [x] (2026-04-13) Milestone 1: Centralize graph node ID/path normalization.
- [x] (2026-04-13) Milestone 2: Add cache freshness policy for session graph derivation.
- [x] (2026-04-13) Milestone 3: Wire framing/graph selection into inspector flow.
- [x] (2026-04-13) Milestone 4: Add missing graph seam tests.
- [x] (2026-04-13) Milestone 5: Restore repo-wide typecheck health and revalidate.
- [x] (2026-04-13) Milestone 6: Reduce dual-model drift between Exploration payload and graph IR.

## Surprises & Discoveries

- Observation: the Exploration route currently fetches both `get_session_exploration()` and `get_session_graph()` in parallel.
  Evidence: `src/pages/session-detail-exploration.tsx` calls both and renders primarily from `ExplorationPayload`, with graph IR used only for framing.

- Observation: file node IDs are constructed inline in multiple graph modules.
  Evidence: both `backend/analytics/graph/derive-session-graph.ts` and `backend/analytics/graph/augment-repo-context.ts` build `file_${relative.replace(...)}` directly.

- Observation: the graph cache is a permanent in-memory map with no freshness model.
  Evidence: `backend/analytics/graph/graph-cache.ts` stores by `session_id` only; `commands.ts` reuses cached graph indefinitely.

- Observation: framing nodes can render in the UI but are not part of the current selection model.
  Evidence: `ExplorationFraming` supports `on_select_node`, but `ExplorationView` does not pass it and `SelectionTarget` only supports `turn`, `event`, and `artifact`.

- Observation: current hidden-directory scanning rules will skip some plausible ambient instruction locations.
  Evidence: `augment-repo-context.ts` ignores all directories whose names start with `.`.

- Observation: targeted new graph tests pass, but repo-wide typecheck currently fails in the older exploration backend.
  Evidence: `bun run test tests/unit/contracts/graph-schemas.test.ts tests/unit/backend/graph-derive.test.ts` passed; `bun run typecheck` failed in `backend/analytics/exploration/derive-exploration.ts` and `backend/analytics/exploration/repo-context.ts`.

## Decision Log

- Decision: graph identity generation should be centralized before more graph node kinds are added.
  Rationale: duplicated ID logic is a repeat of the artifact-ID bug pattern already seen in Exploration v1.
  Date/Author: 2026-04-13 / review follow-up

- Decision: stale graph results are a correctness issue, not a performance detail.
  Rationale: framing and ambient repo context are only useful if Ariadne can explain how fresh they are.
  Date/Author: 2026-04-13 / review follow-up

- Decision: visible framing without selection/provenance support is incomplete.
  Rationale: the graph IR’s value is explainability, not just extra labels in the UI.
  Date/Author: 2026-04-13 / review follow-up

- Decision: the branch must return to `bun run typecheck` green before further graph expansion.
  Rationale: graph IR should not be built on top of a partially broken baseline.
  Date/Author: 2026-04-13 / review follow-up

## Outcomes & Retrospective

- Graph IR is now documented as the primary truth model in the route. ExplorationPayload is still fetched alongside for backward-compatible rendering, but a `graph-to-exploration-adapter.ts` exists to project from graph to exploration shape. The dual-fetch is intentional and documented.
- Cache freshness: TTL-based (5 minutes, `REPLAY_CACHE_TTL_MS`). Replay cache expires automatically; ambient augmentation is always fresh on each request (applied after cloning cached replay graph).
- Framing selection: `SelectionTarget` extended with `graph_node` variant. Clicking framing items opens the inspector with availability, confidence, evidence detail, metadata, and connected graph edges. Unavailable prompt nodes show explicit "No evidence available" messaging.
- Ambient instruction scanning widened: `.github/` is now an allowed hidden directory for instruction source discovery. Other hidden dirs remain blocked.
- Final validation: `bun run typecheck` fully green across all 3 tsconfig passes. 760 tests pass across 46 files (29 new tests added in this fix pass).

## Review findings this fix plan addresses

1. **Warning**: graph IR is not yet the single source of truth for Exploration.
2. **Warning**: canonical graph node ID generation is duplicated.
3. **Warning**: graph cache can serve stale results indefinitely.
4. **Warning**: framing nodes are not inspectable through the main selection flow.
5. **Warning**: graph augmentation/command/API/UI seams are under-tested.
6. **Warning**: repo-wide typecheck is failing in adjacent exploration modules.
7. **Note**: ambient instruction scan may be too restrictive for hidden directories like `.github/`.

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests that expose the gap,
2. implement the smallest change that makes the tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 1 — Centralize graph identity and path normalization

Create a small shared graph utility module for canonical IDs.

Requirements:
- one shared function for normalizing project-relative paths
- one shared function for file/doc node IDs
- one shared function for stable framing/runtime node IDs where useful
- both replay derivation and repo augmentation must use the same helper

Tests to add first:
- replay-derived and ambient-augmented references to the same file produce the same node ID
- absolute and relative paths normalize consistently under the same project root
- AGENTS.md explicit-read and ambient-discovered paths merge to the same file node identity when appropriate

Suggested implementation targets:
- new helper under `backend/analytics/graph/` or a shared contract-safe utility module
- replace inline `file_${relative.replace(...)}` construction in:
  - `backend/analytics/graph/derive-session-graph.ts`
  - `backend/analytics/graph/augment-repo-context.ts`

### Milestone 2 — Add graph cache freshness policy

Refactor `graph-cache.ts` and `commands.ts` so graph derivation has a bounded freshness model.

Acceptable solutions include:
- a TTL for the full graph payload,
- dynamic replay graph caching plus fresh augmentation on each request,
- or cache keys derived from replay leaf/mtime plus a repo-context TTL.

Requirements:
- session graph should not stay stale forever within one backend process
- freshness policy should be simple and explainable
- ambient augmentation freshness should be independently observable

Tests to add first:
- cached graph invalidates or refreshes after freshness window / source change
- repo-context changes can appear without backend restart
- dynamic replay caching, if retained, does not hide augmentation refresh

### Milestone 3 — Make framing nodes inspectable

Integrate graph/framing selection into the Exploration UI.

Requirements:
- users can click framing items and see evidence/provenance in the inspector
- selection model must support graph-native entities, not only legacy exploration items
- unavailable system/developer prompt nodes should show clear absence state and provenance context
- explicit vs ambient instruction sources should remain distinguishable in the inspector

Tests to add first:
- clicking a framing item opens detail state
- inspector shows node kind, availability, confidence, and evidence details for framing nodes
- unavailable prompt nodes render as unavailable/unknown without fake prompt text

Suggested implementation options:
- extend `SelectionTarget` with graph node / graph edge variants, or
- add a dedicated graph inspector model and adapt the Exploration inspector to consume both

### Milestone 4 — Cover the graph seams with tests

Add tests for the modules that currently carry the most risk.

Required coverage:
- `backend/analytics/graph/augment-repo-context.ts`
- `backend/analytics/graph/commands.ts`
- `src/api/graph.ts`
- framing UI behavior in `src/components/exploration/exploration-framing.tsx`
- any new graph selection/inspector logic

Scenarios to cover:
- ambient instruction source gets added with `available_ambient` provenance
- augmentation failure does not corrupt the replay-observed graph
- malformed graph payload is rejected in renderer API parsing
- framing UI visually distinguishes observed / ambient / unavailable states

### Milestone 5 — Restore repo-wide typecheck health

Fix the current typecheck failures before further graph expansion.

Current failures observed in:
- `backend/analytics/exploration/derive-exploration.ts`
- `backend/analytics/exploration/repo-context.ts`

Requirements:
- `bun run typecheck` passes repo-wide
- any adjacent cleanup needed for shared replay typing should be done in the right module, not papered over with broad casts
- remove dead/unused type declarations where practical

Tests to add first:
- none required if this is strictly typing cleanup, but preserve behavior with existing tests and add regression tests if any runtime logic changes

### Milestone 6 — Reduce dual-model drift

Move Exploration closer to graph-first consumption.

Requirements:
- document the intended source-of-truth path explicitly in code comments and/or module naming
- avoid keeping parallel business logic in both `ExplorationPayload` and graph IR if one can be derived from the other
- if a full migration is too large, add a clearly named adapter/projection layer rather than ad hoc dual fetching in the route

Tests to add first:
- if an adapter is introduced, test that the same graph input projects to the expected Exploration UI shape
- route-level loading tests should prove the page handles graph availability and fallback intentionally

## Concrete handoff checklist

Pass the next agent this exact ordered list:

1. **Make graph IDs canonical**
   - extract shared path normalization + node ID helper
   - replace duplicated inline ID generation in graph derivation and augmentation
   - add tests that prove observed and ambient references merge to one node identity

2. **Fix graph cache freshness**
   - add a simple invalidation policy
   - ensure augmentation refresh is observable without restart
   - add cache behavior tests

3. **Wire framing into selection/inspector**
   - extend selection model for graph-native entities or add a dedicated graph inspector path
   - allow clicking framing items
   - show availability/confidence/evidence in inspector
   - add UI tests

4. **Add missing graph seam tests**
   - repo augmentation tests
   - command/API validation tests
   - framing component tests

5. **Get repo-wide typecheck green**
   - fix exploration typing regressions
   - rerun `bun run typecheck`

6. **Reduce model drift**
   - stop treating graph IR as just a sidecar for framing
   - introduce a clean adapter or migrate Exploration toward graph-first rendering

7. **Optional tightening**
   - revisit hidden-dir scan rules to allow likely ambient instruction locations such as `.github/`

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

1. Read:
   - `docs/specs/2026-04-11-session-graph-ir-and-framing.md`
   - this fix plan
2. Add failing tests for graph identity and cache freshness.
3. Extract shared graph ID/path helper.
4. Update graph derivation and augmentation to use it.
5. Add failing UI tests for framing selection and provenance display.
6. Extend selection/inspector model to support graph-native entities.
7. Add tests for augmentation, command, and API seams.
8. Fix repo-wide typecheck failures in older exploration modules.
9. Re-run validation.
10. Document outcomes and any remaining debt in this file.

## Validation and acceptance

This fix pass is complete when all of the following are true:

1. Graph node/path identity is generated through one shared helper.
2. Replay-derived and ambient-augmented references to the same file/doc resolve to the same graph identity.
3. Session graph freshness is bounded by a documented invalidation policy.
4. Framing nodes are selectable and inspectable in the Exploration UI.
5. Inspector can show graph-native provenance details for framing-related selections.
6. Tests exist for augmentation, command/API validation, and framing UI behavior.
7. `bun run typecheck` passes.
8. Relevant tests pass.
9. Manual verification on at least one real session confirms framing interactions are believable.

## Idempotence and recovery

- Shared ID helper extraction is safe to re-run as long as tests pin the canonical format.
- If full graph-first UI migration is too large, land a clean graph-to-exploration adapter first and document it clearly.
- If cache invalidation gets complicated, prefer a short TTL plus explicit provenance timestamps over hidden complexity.
- If framing selection broadens the inspector too much, split into graph-specific and exploration-specific inspector sections rather than mixing incompatible models.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `contracts/graph/*` | Shared graph IR contract; should remain the long-term truth model. |
| `backend/analytics/graph/derive-session-graph.ts` | Replay-derived graph construction. |
| `backend/analytics/graph/augment-repo-context.ts` | Ambient repo instruction/context augmentation. |
| `backend/analytics/graph/graph-cache.ts` | Freshness and memoization boundary. |
| `backend/analytics/graph/commands.ts` | Backend transport entry point for graph retrieval. |
| `src/api/graph.ts` | Renderer-side Zod validation and API boundary. |
| `src/components/exploration/exploration-framing.tsx` | Current framing UI surface. |
| `src/components/exploration/exploration-view.tsx` | Selection plumbing and split-view composition. |
| `src/components/exploration/exploration-inspector.tsx` | Provenance/detail surface that needs graph-native support. |
| `src/pages/session-detail-exploration.tsx` | Current dual-fetch route that should move toward a cleaner source-of-truth boundary. |
