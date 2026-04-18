# Improve Exploration clarity, question-answering, and topology readability

Status: In Progress (M0–M5 complete, M6 pending manual validation)
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
Related artifacts:
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-visualization-rewrite.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

The Exploration route is now graph-first and visually much stronger than before, but it still leaves some explanatory work to the user.

The next step is to make the route answer questions faster and more clearly.

This pass focuses on:
- stronger route continuity in the context map
- a real Neighborhood mode
- curated question-oriented actions
- better selection summaries
- stronger noise reduction for larger sessions

After this work:
- users should need fewer clicks and less interpretation to answer the core exploration questions
- the map should make the active route more obvious
- local context should be easier to inspect without overwhelming the view
- the route should feel more like a guided investigation tool than a general visualization surface

Verification target:
- a user can click a file, prompt, or doc and immediately use the UI to ask the next natural question
- the map makes the active route more explicit
- the view remains readable even as session size grows

## Current state

What is already true:
- Exploration is graph-first
- Path and Influence modes exist and are distinct
- ambient context can be hidden
- framing, path view, map, and inspector are all in place
- manual review of the visualization rewrite found the route to be in good shape overall

What still needs improvement:
- selected-route continuity in the map can still be stronger
- there is no Neighborhood mode yet
- high-value questions are still not exposed as first-class actions
- some analysis tasks still require manually composing mode + selection + interpretation
- large sessions can still carry too much visual context at once

## Decision Log

- Decision: the next step should optimize for clarity and question-answering, not add new backend semantics.
  Rationale: semantic truth and graph-first routing are already in place; the product need is faster comprehension.
  Date/Author: 2026-04-13 / planning session

- Decision: Neighborhood mode is the next most natural focus mode after Path and Influence.
  Rationale: users also need a local-context lens to answer “what was near this?” and “what was not explored?”.
  Date/Author: 2026-04-13 / planning session

- Decision: curated actions are preferable to freeform query UI in this phase.
  Rationale: the important questions are already known and can be answered through trustworthy, click-driven affordances.
  Date/Author: 2026-04-13 / planning session

- Decision: Neighborhood mode uses all edge kinds with 1-hop depth limit (no mode-specific edge filtering).
  Rationale: local context should show every relationship type at the immediate level. Mode-specific filtering would make it another version of Path/Influence. One-hop keeps it focused.
  Date/Author: 2026-04-13 / implementation

- Decision: Route connectors use primary/secondary emphasis rather than hiding non-selected edges entirely.
  Rationale: keeping secondary edges visible preserves context while still making the active route visually dominant.
  Date/Author: 2026-04-13 / implementation

- Decision: Question actions are rendered in the inspector (not the top strip or inline).
  Rationale: actions are selection-context-dependent, so placing them near the selected node's detail pane is most natural.
  Date/Author: 2026-04-13 / implementation

- Decision: Narrative summaries are compact single-sentence descriptions placed above evidence.
  Rationale: users scanning the inspector should get the "short story" before diving into provenance details.
  Date/Author: 2026-04-13 / implementation

## Surprises & Discoveries

- FocusMode already declared "neighborhood" in the type union but the compute_selection_subgraph function fell through to path_edge_kinds. The fix was straightforward: add an early-return branch for neighborhood mode.
- VisibilityOptions needed a `highlighted_node_ids` field to support `only_selected_subgraph` correctly — the filter needs to know which nodes are in the selection to filter by them.
- The `compute_edited_path_ids` helper traces upstream from edited files to find the minimal set of turn→tool→file nodes, keeping the "only edited path" filter tight.

## Progress

- [x] (2026-04-13) Milestone 0: Confirm the scope boundary and fold in any lightweight cleanup.
- [x] (2026-04-13) Milestone 1: Strengthen map route continuity and connector visibility.
- [x] (2026-04-13) Milestone 2: Implement real Neighborhood mode.
- [x] (2026-04-13) Milestone 3: Add curated question-oriented actions.
- [x] (2026-04-13) Milestone 4: Improve filtering and noise reduction.
- [x] (2026-04-13) Milestone 5: Strengthen summaries and inspector guidance.
- [ ] (2026-04-13) Milestone 6: Validate on real sessions and document what remains for future work.

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests that prove the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Confirm scope boundary and fold in lightweight cleanup

Keep this pass tightly focused.

Required outcomes:
- confirm in code comments and plan notes that this phase is renderer/UX work, not backend semantics work
- avoid reopening graph-truth or graph-first migration scope
- identify any temporary compatibility helpers that should stay untouched versus those that can be simplified during this pass

Tests to add first:
- none required

### Milestone 1 — Strengthen route continuity in the map

Improve how clearly the active path reads in the context map.

Required outcomes:
- selected/visible subgraph has clearer visual continuity
- connector or connector-like route cues make “this led to this” more legible
- connectors do not overwhelm the map with equal-strength visual noise
- observed / inferred / ambient / adjacent truth distinctions stay visible

Recommended implementation direction:
- emphasize connectors primarily for the active selection subgraph
- keep weaker context edges faint or optional
- avoid showing all edges at equal weight

Tests to add first:
- view-model tests for visible connector derivation / route emphasis
- component tests for selected path being visually stronger than unrelated context

### Milestone 2 — Implement Neighborhood mode

Add a real local-context lens alongside Path and Influence.

Required outcomes:
- Neighborhood mode is behaviorally distinct
- selecting a node in Neighborhood mode emphasizes one-hop local context and nearby unexplored nodes
- broader session route context is reduced enough that the local neighborhood becomes legible

Best targets for Neighborhood mode:
- files
- docs
- instruction sources
- edited outputs

Tests to add first:
- pure helper tests proving Neighborhood mode yields a different visible subgraph/emphasis than Path and Influence
- component tests showing nearby unexplored context becomes more legible in Neighborhood mode

### Milestone 3 — Curated question-oriented actions

Expose the product’s best-known questions directly in the UI.

Required outcomes:
- selection-aware action chips/buttons appear where they help most
- actions apply meaningful combinations of mode, filters, and selection focus
- the actions reduce the need for users to infer how to operate the visualization

Minimum suggested actions:

#### For a selected turn/prompt
- Show everything explored after this prompt
- Show only files eventually edited
- Show docs explored in this turn

#### For a selected file
- Show how the agent arrived here
- Show upstream docs/instructions
- Show adjacent unexplored files

#### For a selected doc/instruction source
- Show what this influenced
- Show downstream edits
- Show explicit-only effects

Tests to add first:
- action handlers/view-model tests proving the actions change the visualization state meaningfully
- component tests proving the right actions appear for the right selection kinds

### Milestone 4 — Filtering and noise reduction

Improve readability for larger sessions.

Required outcomes:
- filters or toggles reduce clutter without breaking trust
- common clutter sources become easier to suppress
- selection remains coherent when filters are changed

Recommended filters/toggles:
- ambient on/off (existing; preserve and validate)
- inferred on/off
- unexplored neighbors on/off
- only selected subgraph
- only edited path if feasible

Tests to add first:
- helper tests for filter combinations
- component tests for visibility changes and selection coherence

### Milestone 5 — Better summaries and inspector guidance

The route should summarize what matters more quickly.

Required outcomes:
- stronger selection-level summaries
- shorter narrative summaries when possible
- clearer calls to action for what the user may want to inspect next

Examples:
- selected file: first seen, upstream influences, nearby unexplored count
- selected prompt: actions/files/docs/edits count
- selected doc: observed vs ambient, downstream influenced files/edits

Tests to add first:
- summary helper tests
- component tests for selected-turn/file/doc summary rendering

### Milestone 6 — Real-session validation and follow-up notes

Validate that the route is actually easier to use, not just richer in controls.

Required outcomes:
- validate on at least two real sessions
- verify the core questions are faster to answer
- document what remains intentionally future work

Manual validation checklist:
- edited file → clear arrival path
- prompt/turn → clear downstream exploration
- doc/instruction source → clear downstream influence
- Neighborhood mode → clearly local, not just another version of Path/Influence
- larger-session readability improved with filters/toggles

## Parallelization strategy

This work can be decomposed after the view-model boundary is confirmed.

### Workstream A — graph-native helpers
- neighborhood extraction
- connector visibility / route emphasis
- filter logic
- question action reducers
- summary derivation

### Workstream B — context map refinement
- connector rendering
- selection emphasis
- Neighborhood mode rendering behavior
- visual hierarchy polish

### Workstream C — controls and interaction design
- question actions
- filter controls
- focus-mode expansion
- top-strip and inspector integration

### Workstream D — validation and documentation
- real-session checks
- update plan/spec outcomes
- capture remaining future work honestly

Dependency order:
- Workstream A should define the helper semantics first.
- Workstreams B and C can proceed in parallel once helper contracts are stable.
- Workstream D should run after feature behavior settles.

## Concrete handoff checklist

Pass the next agent this exact ordered list:

1. **Do not reopen backend truth/model work**
   - stay graph-first
   - keep this as a renderer/UX clarity pass

2. **Make the active route more obvious in the map**
   - add connector or route-continuity cues
   - keep truth hierarchy intact

3. **Implement Neighborhood mode**
   - make it behaviorally distinct from Path and Influence
   - optimize it for local context and unexplored adjacency

4. **Add curated question actions**
   - turn/prompt actions
   - file actions
   - doc/instruction actions

5. **Improve filters and readability**
   - inferred toggle
   - unexplored toggle
   - selected-subgraph / edited-path filters if feasible

6. **Improve summaries**
   - stronger inspector and top-strip summaries
   - less interpretation burden

7. **Validate on real sessions**
   - confirm the route is faster to understand
   - document future work honestly

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add pure helper tests first
bun run test <new-neighborhood-and-actions-tests>

# 2. Add map refinement/component tests
bun run test <map-clarity-tests>

# 3. Add controls/filter/summary tests
bun run test <controls-and-summary-tests>

# 4. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use known Ariadne sessions that already exercise framing and exploration behavior, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This clarity pass is complete when all of the following are true:

1. The map shows active-route continuity more clearly.
2. Neighborhood mode exists and is meaningfully distinct from Path and Influence.
3. Curated question actions exist and make common analysis tasks easier.
4. Filters/toggles reduce clutter without breaking trust or selection coherence.
5. Summaries help users answer questions faster.
6. The route remains graph-first and truthful.
7. `bun run typecheck` passes.
8. `bun run test` passes.
9. Manual validation is documented.

## Idempotence and recovery

- If connector rendering becomes too noisy, keep the connector logic limited to selected subgraphs first.
- If Neighborhood mode grows too broad, start with one-hop local context only and defer deeper local traversal.
- If question actions risk cluttering the UI, start with a smaller curated set tied to the most common selection kinds.
- If filter count gets too high, prefer one or two high-value toggles over a large but confusing control set.

## What likely comes after this plan

Once this pass lands, the next plausible steps are:
- replay stepping / scrubber
- richer connector/canvas polish
- lightweight symbol-awareness later
- larger-session scaling improvements

Those should build on this clarity pass rather than replace it.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `SessionGraphPayload` and graph-native renderer helpers | Remain the source of truth and derivation seam. |
| `src/components/exploration/exploration-map.tsx` | Main target for route continuity and Neighborhood mode improvements. |
| `src/components/exploration/exploration-controls.tsx` | Natural place for focus modes, filters, and curated actions. |
| `src/components/exploration/exploration-inspector-v2.tsx` | Main target for stronger summaries and next-step guidance. |
| `src/components/exploration/exploration-path.tsx` | May need minor alignment with curated prompt/turn actions. |
| New/updated renderer-side helper modules | Best place for question actions, neighborhood extraction, and filter logic. |
