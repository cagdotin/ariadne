# Upgrade Exploration Graph mode from grouped list to real path diagram

Status: Pending
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-graph-visualization-upgrade.md]]
Related artifacts:
- [[docs/specs/2026-04-13-exploration-path-insight-graph.md]]
- [[docs/specs/2026-04-13-exploration-temporal-history.md]]
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

Exploration already has a Graph mode, but the current rendering is still list-like. It groups nodes by role and shows edge hints, but it does not yet provide the visual value users expect from a graph.

This plan upgrades Graph mode into a real path diagram.

After this work, a user should be able to:
- switch the middle pane from Map to Graph
- see positioned nodes connected by visible arrows/connectors
- understand the main route, supporting contributors, structural references, and downstream effects spatially
- read selected file/doc/output graphs as “how did we get here?”
- read selected turn/prompt graphs as “what path formed after this?”

Verification target:
- Graph mode should feel visually distinct from Map and clearly no longer be “just a list of items”
- Graph mode should improve immediate readability of path shape on real sessions

## Current state

What is already true:
- Map / Graph middle-pane toggle exists
- selection-centered explanation subgraphs already exist
- temporal-history semantics already exist and should remain the truth boundary
- Graph mode already distinguishes roles conceptually

What still needs improvement:
- nodes are rendered as grouped rows rather than graph geometry
- connectors/arrows are not the primary organizing structure
- the selected route is not visually legible enough as a shape

## Decision Log

- Decision: keep Map mode as the default overview surface and upgrade Graph mode rather than replacing Map.
  Rationale: overview and explanation remain distinct jobs.
  Date/Author: 2026-04-13 / planning session

- Decision: build Graph v1 with a custom renderer-first approach using positioned nodes and SVG connectors rather than introducing a heavy external library immediately.
  Rationale: the required graph is constrained, selection-first, and deterministic; a custom renderer should be sufficient and easier to align with product semantics.
  Date/Author: 2026-04-13 / planning session

- Decision: use a layered directional layout instead of a force-directed network.
  Rationale: Exploration is about path explanation and investigation flow, not generic topology discovery.
  Date/Author: 2026-04-13 / planning session

## Progress

- [x] (2026-04-13) Milestone 0: Confirm visual scope and renderer boundaries.
  - Custom renderer approach: HTML/React node cards + SVG connectors + pure layout helper.
  - New module: `src/lib/exploration-graph-layout.ts`.
  - Existing `exploration-graph.tsx` rewritten in place.
- [x] (2026-04-13) Milestone 1: Add a pure layout view model for Graph mode geometry.
  - Created `src/lib/exploration-graph-layout.ts` with `compute_graph_layout`.
  - Topological column assignment via Kahn's algorithm (longest-path depth).
  - Row assignment via role priority + kind depth + stable ID sort.
  - Edge routing with bezier control points exiting right→entering left.
  - 15 unit tests in `tests/unit/lib/exploration-graph-layout.test.ts`.
- [x] (2026-04-13) Milestone 2: Replace grouped-list Graph rendering with positioned nodes and SVG connectors.
  - Rewrote `src/components/exploration/exploration-graph.tsx`.
  - Scrollable container with absolutely positioned node cards.
  - SVG overlay with bezier-curved connectors and arrowhead markers.
  - Empty state preserved for no-selection.
- [x] (2026-04-13) Milestone 3: Encode primary/supporting/structural/downstream visual hierarchy.
  - Primary path: solid stroke, strongest weight, primary color.
  - Supporting: dashed amber, secondary weight.
  - Structural refs: dotted cyan, thinnest weight, 50% opacity.
  - Downstream: solid orange with directional arrows.
  - Focal node: ring-2 + shadow for emphasis.
  - Structural ref nodes: reduced opacity.
  - SVG arrowhead markers per role with matching colors.
  - Legend in header with inline SVG line samples.
- [x] (2026-04-13) Milestone 4: Align inspector copy and refine interaction states.
  - Inspector already shows Graph Insight section (from prior phase).
  - Node hover: ring highlight + z-index raise.
  - Node click: selects and re-centers the insight subgraph.
- [ ] (2026-04-13) Milestone 5: Validate on real sessions and document follow-ups.

## Surprises & Discoveries

- Observation: Kahn's algorithm with longest-path depth produces the right left-to-right flow without needing any special-casing for turn vs artifact selection — the topological structure of the insight subgraph naturally places upstream causes left and downstream effects right.
  Evidence: All 15 layout tests pass without selection-type-specific branching in column assignment.

- Observation: Bezier curves with 40%-of-dx control offset read cleanly even when edges span multiple columns or when source/target are in the same column (vertical edges become gentle S-curves).
  Evidence: Layout tests confirm left-to-right flow for >50% of primary path edges.

- Observation: The layout is 100% deterministic — same InsightSubgraph always produces the same GraphLayout. This is critical for avoiding visual jitter when the user clicks around.
  Evidence: Determinism test passes.

## Outcomes & Retrospective

- Implementation complete for milestones 0–4. All checks pass: `bun run typecheck`, `bun run test` (946 tests), lint clean on new files.
- Real-session validation (Milestone 5) pending manual confirmation.
- Future follow-ups to consider:
  - Zoom-to-fit or center-on-focal behavior for large graphs.
  - Edge labels on hover for edge kind visibility.
  - Animated transitions when selection changes.
  - Canvas-based rendering if performance becomes an issue with many nodes.

## Context and orientation

Important current files/modules:

- `src/components/exploration/exploration-view.tsx`
  - owns selection state and chooses Map vs Graph mode
- `src/components/exploration/exploration-graph.tsx`
  - current Graph rendering; this is the main visual replacement target
- `src/lib/exploration-insight-graph-view-model.ts`
  - current explanation-subgraph derivation; should remain the semantic basis for Graph mode
- temporal-history helpers used by the route
  - Graph mode must stay historically truthful and selection-aware
- `src/components/exploration/exploration-inspector-v2.tsx`
  - may need copy adjustments so inspector language matches the new graph visual grammar

Current weakness to keep in mind:
- the data model is not the problem
- the rendering and layout are the problem

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests proving the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Confirm visual scope and renderer boundaries

Required outcomes:
- confirm that this is a visualization upgrade only, not a graph-semantics rewrite
- identify whether to extend the existing `exploration-graph.tsx` directly or split out a dedicated graph-canvas subcomponent
- confirm a custom renderer approach for v1:
  - HTML/React node cards
  - SVG connectors
  - pure layout helper

Tests to add first:
- none required

### Milestone 1 — Add pure layout view model

Required outcomes:
- create a pure helper that takes the current insight subgraph and returns graph geometry
- geometry should include at least:
  - positioned nodes (column/row or x/y)
  - routed edges or edge endpoint metadata
  - role/emphasis metadata for rendering
- layout should differ meaningfully by selection type:
  - selected artifact
  - selected turn/prompt
- temporal ordering should be used where helpful for vertical placement

Recommended helper shape:
- `src/lib/exploration-graph-layout.ts` or similar
- output should remain deterministic and fully unit testable

Tests to add first:
- selected artifact layout tests
- selected turn/prompt layout tests
- deterministic ordering/placement tests
- edge-geometry metadata tests

### Milestone 2 — Replace grouped-list rendering with positioned nodes + connectors

Required outcomes:
- `exploration-graph.tsx` (or a child component) renders a real graph surface
- nodes are positioned spatially
- connectors/arrows are visibly drawn between nodes
- Graph mode is no longer organized as stacked role sections
- the graph remains scrollable and readable without requiring heavy pan/zoom tooling initially

Recommended implementation direction:
- absolutely positioned node cards
- SVG overlay behind or above nodes for connectors
- directional arrows at least for primary path and important effect edges

Tests to add first:
- component tests for SVG connector presence
- component tests proving positioned graph rendering rather than grouped list sections
- mode-switch preservation tests if refactors touch state wiring

### Milestone 3 — Encode visual hierarchy

Required outcomes:
- primary path is strongest visually
- supporting contributors are visibly secondary
- structural references are clearly distinct from observed route edges
- downstream effects are directionally understandable
- ambient/inferred context remains visually truthful and subordinate

Recommended visual grammar:
- primary path = strongest line weight / strongest node emphasis
- supporting = secondary color/weight
- structural refs = distinct color and lighter emphasis
- downstream = distinct directional style

Tests to add first:
- role-style/rendering tests
- structural-reference styling distinction tests
- focal-node emphasis tests

### Milestone 4 — Align summaries and interactions

Required outcomes:
- inspector copy and summaries align with the new graph visual grammar
- hover or focus interactions strengthen the local route where feasible
- graph remains understandable even when the inspector is closed or secondary

Examples:
- “Primary route shown in bold.”
- “Structural references are supportive context, not explicit exploration steps.”
- “Downstream effects appear to the right of the focal artifact.”

Tests to add first:
- summary/copy tests where appropriate
- interaction tests for node selection and hover highlighting if implemented

### Milestone 5 — Real-session validation and honest follow-up notes

Required outcomes:
- validate on at least two real sessions
- confirm Graph mode now visibly reads like a graph
- confirm selected file/doc/output graphs are more explanatory than before
- document what remains future work

Manual validation checklist:
- selected file/doc/output → clear upstream/downstream shape
- selected turn/prompt → clear path-formation shape
- Graph mode visibly differs from Map and from the old list-like graph
- no misleading future-leak or over-claiming relationships introduced

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add pure layout tests first
bun run test <new-graph-layout-tests>

# 2. Add graph-rendering component tests
bun run test <graph-rendering-tests>

# 3. Add interaction/style distinction tests
bun run test <graph-visual-hierarchy-tests>

# 4. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use known Ariadne sessions with meaningful exploration paths and edits, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This phase is complete when all of the following are true:

1. Graph mode renders positioned nodes and visible connectors/arrows.
2. Graph mode is visually distinct from both Map mode and the previous list-like graph.
3. Selected artifact graphs show a readable upstream/downstream explanation shape.
4. Selected turn/prompt graphs show a readable path-formation shape.
5. Primary path, supporting contributors, structural references, and downstream effects are visually distinguishable.
6. Temporal-history truthfulness is preserved.
7. `bun run typecheck` passes.
8. `bun run test` passes.
9. Real-session manual validation is documented.

## Idempotence and recovery

- If the first connector strategy becomes too noisy, start by rendering only primary path and strongest secondary connectors, then add more selectively.
- If the layout gets unstable, fall back to column/row semantics rather than free placement.
- If no-selection Graph mode remains low-value, prefer an honest empty/instructional state over forcing a weak session graph.
- If the renderer becomes too tangled, split geometry computation, SVG edge rendering, and node-card rendering into separate units before adding more polish.

## Artifacts and notes

- Spec: `docs/specs/2026-04-13-exploration-graph-visualization-upgrade.md`
- This plan should collect screenshots or short notes during validation showing before/after readability improvements.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `SessionGraphPayload` | Source of truth; unchanged in this phase. |
| `src/lib/exploration-insight-graph-view-model.ts` | Semantic graph input for the visual renderer; should remain the basis for layout. |
| new graph-layout helper module | Best place for deterministic geometry and edge-routing data. |
| `src/components/exploration/exploration-graph.tsx` | Main target for replacing grouped-list rendering. |
| optional new graph-canvas subcomponents | Useful if geometry, SVG edges, and node cards need separation for clarity. |
| temporal-history helpers | Preserve historical truth boundaries in Graph mode. |
| `src/components/exploration/exploration-inspector-v2.tsx` | Should align copy and summaries with the new visual grammar. |
