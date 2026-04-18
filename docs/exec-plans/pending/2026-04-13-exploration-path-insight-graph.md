# Add a Path & Insight Graph mode to Exploration for explicit route and relationship explanation

Status: Pending
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-path-insight-graph.md]]
Related artifacts:
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
- [[docs/specs/2026-04-13-exploration-temporal-history.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

Exploration now has a strong narrative pane, a useful artifact-first map, and historically truthful turn/prompt and arrival-path slicing. The remaining weakness is that the route still explains important relationships more than it visibly shows them.

This plan adds a second middle-pane visualization mode:
- **Map** for overview and scanning
- **Graph** for explicit route, relationship, and insight explanation

After this work, a user should be able to:
- keep using the current Map view for broad context
- switch to Graph view in the middle-pane header
- select a turn, prompt, doc, file, or output and see a reduced relationship graph with arrows/connectors
- understand the primary route, key supporting contributors, structural references among explored artifacts, and downstream effects more quickly

Verification target:
- for a selected file/doc/output, Graph view gives a clearer answer to “how did we get here?” than the current Map view alone
- for a selected prompt/turn, Graph view gives a clearer answer to “what path formed after this?”
- mode switching preserves selection and historical truthfulness

## Current state

What is already true:
- Exploration is graph-first
- pane rebalance shipped
- temporal-history semantics shipped
- Map view is a strong artifact-first overview surface
- inspector summaries and current focus modes already provide useful explanation

What still needs improvement:
- the route lacks a dedicated graph visualization mode in the middle pane
- the primary route is still not visually explicit enough on its own
- structural references among explored artifacts are not surfaced strongly enough
- users still depend too much on inspector prose to reconstruct the actual path

## Decision Log

- Decision: keep the current Map view and add Graph as a second explicit middle-pane mode rather than replacing Map entirely.
  Rationale: Map and Graph solve different jobs — scanning versus explanation.
  Date/Author: 2026-04-13 / planning session

- Decision: Graph mode should be selection-first rather than a full graph dump.
  Rationale: the product value is explanation of the current question, not generic topology browsing.
  Date/Author: 2026-04-13 / planning session

- Decision: Graph mode should rank content into primary path, supporting contributors, structural references, and downstream effects.
  Rationale: equal-weight graph rendering would reduce clarity and recreate the “hairball” problem.
  Date/Author: 2026-04-13 / planning session

- Decision: structural references among already explored artifacts are in scope when they materially explain the selected path.
  Rationale: users want to understand not only observed tool actions but also why the selected path makes sense in the explored code/doc context.
  Date/Author: 2026-04-13 / planning session

## Progress

- [x] (2026-04-13) Milestone 0: Confirm scope, UI boundaries, and current reusable helpers.
- [x] (2026-04-13) Milestone 1: Add renderer-side insight/relationship derivation helpers.
  - Created `src/lib/exploration-insight-graph-view-model.ts` with `compute_insight_subgraph` — derives selection-centered explanation subgraphs with role classification.
  - 17 unit tests in `tests/unit/lib/exploration-insight-graph-view-model.test.ts`.
- [x] (2026-04-13) Milestone 2: Implement middle-pane Map / Graph toggle and preserve state semantics.
  - Added `MiddlePaneMode` state ("map" | "graph") to `exploration-view.tsx`.
  - Shared `MiddlePaneModeToggle` component in both Map and Graph headers.
  - Selection, focus mode, temporal lens, and visibility toggles all preserved on mode switch.
- [x] (2026-04-13) Milestone 3: Implement Graph view rendering with explicit arrows/connectors.
  - Created `src/components/exploration/exploration-graph.tsx` with role-sectioned layout.
  - Nodes grouped by role (primary path, supporting, structural ref, downstream).
  - Visual grammar: color-coded edges, arrow indicators, edge kind labels.
  - Empty state invites selection when nothing is selected.
- [x] (2026-04-13) Milestone 4: Add ranking, summaries, and structural-reference insight behavior.
  - Added `compute_insight_summary` to `exploration-inspector-summaries.ts` — produces structured primary-path chain, supporting/structural/downstream labels.
  - 6 unit tests for insight summary derivation.
  - Inspector renders "Graph Insight" section when Graph mode is active.
- [ ] (2026-04-13) Milestone 5: Validate on real sessions and document follow-ups.

## Surprises & Discoveries

- Observation: A new dedicated `exploration-insight-graph-view-model.ts` was the right split — extending the existing view model would have created confusion between Map-mode and Graph-mode helpers.
  Evidence: The new module is 300 lines focused purely on insight derivation; the existing module remains unchanged.

- Observation: The graph component works well as a role-sectioned list with edge annotations rather than a canvas-based force-directed graph. This is simpler, more readable, and avoids the hairball problem.
  Evidence: Initial implementation uses grouped sections with arrow indicators. A future canvas rendering could extend this data model without changing the derivation layer.

## Outcomes & Retrospective

- Implementation complete for milestones 0–4. All checks pass: `bun run typecheck`, `bun run test` (931 tests), lint clean on new files.
- Real-session validation (Milestone 5) pending manual confirmation.

## Context and orientation

A novice implementing this should understand the current route shape first:

- `src/components/exploration/exploration-view.tsx`
  - top-level exploration composition and selection state wiring
- `src/components/exploration/exploration-map.tsx`
  - current artifact-first middle-pane visualization
- `src/components/exploration/exploration-path.tsx`
  - left narrative pane; already owns chronology
- `src/components/exploration/exploration-inspector-v2.tsx`
  - explanation surface; will need graph-aware summary updates
- `src/components/exploration/exploration-controls.tsx`
  - top controls strip; not the place for the new middle-pane visualization toggle unless implementation proves otherwise
- `src/lib/exploration-graph-view-model.ts`
  - current selection subgraph, lane, visibility, connector, and focus-mode logic
- temporal-history helpers or adjacent logic introduced by the prior phase
  - these must remain the historical truth boundary for Graph mode as well

The key architectural rule is:
- Graph mode is a **renderer-side interpretation** over the same graph-first payload
- it should reuse and extend existing selection and temporal semantics, not redefine them from scratch

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests proving the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Confirm scope and reusable seams

Required outcomes:
- confirm the new toggle lives in the middle-pane header and does not disrupt the left narrative pane
- identify which existing helpers can be reused for Graph mode
- decide whether to extend `src/lib/exploration-graph-view-model.ts` or introduce a new focused helper module such as `src/lib/exploration-insight-graph-view-model.ts`
- keep this phase renderer-first and avoid reopening backend semantics casually

Tests to add first:
- none required

### Milestone 1 — Add renderer-side insight / explanation subgraph helpers

Required outcomes:
- derive a reduced explanation subgraph for the current selection
- classify nodes/edges into at least:
  - primary path
  - supporting contributors
  - structural references
  - downstream effects
- ensure derivation respects current historical slice semantics
- include structural references only when both endpoints are valid in the current visible historical slice

Recommended helper outputs:
- visible graph nodes/edges for Graph mode
- node/edge role or emphasis classification
- ranked contributor summaries for inspector consumption

Tests to add first:
- selected file/doc/output explanation-subgraph tests
- selected prompt/turn downstream path tests
- structural-reference inclusion/exclusion tests
- primary-route vs secondary-contributor ranking tests

### Milestone 2 — Add middle-pane Map / Graph toggle

Required outcomes:
- middle-pane header gets an explicit visualization switch, e.g. `Map | Graph`
- switching modes preserves:
  - current selection
  - current focus mode
  - current temporal-history slice
  - current visibility toggles where applicable
- Map remains default on first load

Tests to add first:
- component tests for toggle rendering and mode switching
- state-preservation tests when switching between Map and Graph

### Milestone 3 — Implement Graph view rendering

Required outcomes:
- Graph mode renders explicit connectors/arrows as primary content
- layout is directional and readable
- selected-path explanation is visually clearer than Map mode for focused analysis
- Graph mode avoids full dense graph dumps and stays selection-first

Recommended implementation direction:
- use a constrained layered layout rather than force-directed free placement
- selected artifact may sit centered with upstream causes left and downstream effects right
- selected prompt/turn may anchor left with path flowing right
- supporting contributors should not compete equally with the route spine

Tests to add first:
- rendering tests for graph node/edge presence by selection type
- tests proving explicit connector rendering behavior
- tests proving suppression of unrelated graph content

### Milestone 4 — Ranking, summaries, and structural-reference insight

Required outcomes:
- inspector and/or graph-adjacent summary surface explains:
  - primary path
  - supporting contributors
  - structural references among explored artifacts
  - downstream effects where meaningful
- graph-mode summaries reduce interpretation burden further
- structural reference edges are visually distinguishable from observed exploration edges

Examples of desired summaries:
- “Primary path: Prompt → bash search → README.md → commands.ts → selected file.”
- “Supporting contributors: `PLAN.md`, `ipc-commands.ts`.”
- “Related explored references: `commands.ts` imports `session-types.ts`.”

Tests to add first:
- summary-helper tests
- component tests for graph-mode summary rendering
- visual-role tests for structural references versus observed edges

### Milestone 5 — Real-session validation and honest follow-up notes

Required outcomes:
- validate on at least two real sessions
- confirm Map remains the better overview surface
- confirm Graph is better for focused path explanation
- document what remains intentionally future work

Manual validation checklist:
- selected edited file → Graph clearly shows arrival path and key contributors
- selected prompt/turn → Graph clearly shows downstream path shape
- structural references among already explored files/docs are useful and not misleading
- switching back to Map returns to the familiar overview without losing context

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add pure helper tests first
bun run test <new-insight-graph-view-model-tests>

# 2. Add middle-pane mode-switch/component tests
bun run test <exploration-graph-mode-component-tests>

# 3. Add summary and role-classification tests
bun run test <insight-summary-tests>

# 4. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use known Ariadne sessions with multi-turn exploration and edits, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This phase is complete when all of the following are true:

1. The middle pane has explicit `Map` and `Graph` visualization modes.
2. Map remains the default overview/scanning surface.
3. Graph mode preserves selection and historical slice semantics.
4. Selected file/doc/output yields a reduced relationship graph that answers “how did we get here?” more clearly.
5. Selected prompt/turn yields a reduced downstream path graph that answers “what path formed after this?” more clearly.
6. Graph mode distinguishes primary path, supporting contributors, structural references, and downstream effects.
7. Structural references are only shown when they are valid and useful in the current historical slice.
8. `bun run typecheck` passes.
9. `bun run test` passes.
10. Real-session manual validation is documented.

## Idempotence and recovery

- If Graph mode without selection becomes too noisy, prefer a helpful low-detail state over a full session graph dump.
- If primary-path ranking is ambiguous, degrade to a simpler “related contributors” grouping rather than overstating certainty.
- If structural references add too much clutter, keep them secondary or gate them behind a lightweight reveal rather than removing Graph mode entirely.
- If extending the existing view-model file creates confusion, split new logic into a dedicated insight-graph helper module before expanding further.

## Artifacts and notes

- Spec: `docs/specs/2026-04-13-exploration-path-insight-graph.md`
- This plan should be updated with validation notes and real-session observations during implementation.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `SessionGraphPayload` | Remains the source of truth for all Graph-mode derivation. |
| `src/components/exploration/exploration-view.tsx` | Owns selection state and middle-pane composition; likely place to hold the Map/Graph mode state. |
| `src/components/exploration/exploration-map.tsx` | Existing Map mode; should stay intact while Graph mode is added alongside it. |
| new Graph-mode component (likely) | Best place for explicit relationship rendering without overloading the current Map component. |
| `src/lib/exploration-graph-view-model.ts` and/or new insight helper module | Derives explanation subgraphs, ranking, and structural-reference visibility. |
| temporal-history helper logic | Graph mode must remain historically truthful and share the same visible-slice boundary. |
| `src/components/exploration/exploration-inspector-v2.tsx` | Needs graph-aware summary improvements aligned with visible route structure. |
