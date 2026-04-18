# Replace Exploration Graph mode with a full-session tree/graph canvas

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. This plan conforms to `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

Spec set:
- `specs/session-graph-tree-visualization/spec.md`
- `specs/session-graph-tree-visualization/graph-mode-canvas.md`
- `specs/session-graph-tree-visualization/selection-and-sync.md`
- `specs/session-graph-tree-visualization/milestones.md`

## Purpose / Big picture

Ariadne should replace the current selection-centered Exploration `Graph` mode with a full-session tree/graph visualization in the middle pane.

After this work, a user should be able to:
- switch to `Graph` mode and see the overall session exploration topology
- click in the left pane and watch the graph select the same node/path
- click in the graph and have the left pane and inspector sync to that node
- explore the graph without a duplicate transcript/detail panel inside the middle pane

## Progress

- [x] (2026-04-18 11:31 CEST) Explored the track, current Exploration implementation, graph IR, and historical specs.
- [x] (2026-04-18 11:31 CEST) Refactored the track so the root is the documentation root; moved `docs/specs` → `specs`, `docs/exec-plans` → `exec-plans`, and `docs/reports` → `reports`.
- [x] (2026-04-18 11:31 CEST) Copied the current Ariadne walkthrough/graph screenshots into the track and rewrote the tree-visualization spec as a focused spec set.
- [x] (2026-04-18 12:33 CEST) Prototype the full-session graph projection and choose a first-ship default orientation (top-down tree with left-to-right depth growth inside the current middle pane).
- [x] (2026-04-18 12:33 CEST) Replace `src/components/exploration/exploration-graph.tsx` with the new full-session graph renderer while preserving the existing `Map` / `Graph` mode structure.
- [x] (2026-04-18 13:12 CEST) Add two-way binding behavior so graph-originated selection expands/scrolls the left pane to the owning turn/action.
- [x] (2026-04-18 13:44 CEST) Validate on real sessions and document the current correctness and density findings.
- [x] (2026-04-18 13:49 CEST) Plan the viewported actual-canvas-oriented graph surface that should follow the SVG/DOM stepping-stone renderer.
- [x] (2026-04-18 15:28 CEST) Implement the first Milestone 3 slice: add viewport math/hook, convert Graph mode to a viewported canvas-oriented surface, and preserve shared selection sync.
- [x] (2026-04-18 15:41 CEST) Re-run targeted tests and real-session validation for the viewport slice; record results and remaining density follow-ups.
- [x] (2026-04-18 14:01 CEST) Fix the zoomed-edge visibility regression so canvas edges remain visible under Ariadne's OKLCH theme tokens.
- [x] (2026-04-18 14:01 CEST) Plan the next Milestone 3 follow-up as a two-step sequence: density-sensitive zoom-band rendering first, then session-grouping evaluation on top of the improved overview.
- [x] (2026-04-18 14:08 CEST) Implement the density-sensitive zoom-band renderer so overview, mid-zoom, and detail states no longer all render with the same node chrome and label policy.
- [x] (2026-04-18 14:08 CEST) Add targeted renderer-policy tests and re-run graph/path/viewport validation after the density pass.
- [x] (2026-04-18 14:08 CEST) Run a focused real-session tuning pass, raise the overview boundary for ambiguous medium sessions, and document the remaining session-grouping judgment.

## Surprises & Discoveries

- Observation: The current product architecture already centralizes selection in `src/components/exploration/exploration-view.tsx` via `selected_node_id`, so the new graph mode can reuse existing selection wiring instead of inventing a second state model.
  Evidence: `ExplorationView` passes `selected_node_id` and `set_selected_node_id` into the left pane, middle pane, and inspector.

- Observation: The current `Graph` mode is derived from `compute_insight_subgraph()` and `compute_graph_layout()`, which are selection-centered helpers rather than full-session topology helpers.
  Evidence: `src/components/exploration/exploration-graph.tsx` consumes `InsightSubgraph`; `src/lib/exploration-graph-layout.ts` lays out a reduced explanation graph, not the full session.

- Observation: The left pane is turn-based and action-based, so graph-to-left synchronization will need expansion/scroll behavior rather than a simple one-to-one node list highlight.
  Evidence: `src/components/exploration/exploration-path.tsx` renders `PathTurnRow` and `PathActionRow`, with collapsed turn state local to the component.

- Observation: A single-parent projection is enough to ship a readable first-pass full-session graph, but repeated artifact touches naturally collapse onto their earliest causal parent.
  Evidence: The new renderer-side projection in `src/lib/exploration-session-graph-view-model.ts` deterministically picks one parent for each artifact and the tests lock that behavior in.

- Observation: Reverse-sync in the left pane can be implemented without moving expansion state into `ExplorationView`; local turn expansion remains viable if the path component derives an owning row from shared selection and self-expands/scrolls when required.
  Evidence: `src/components/exploration/exploration-path.tsx` now derives a `path_selection_target`, expands the owning turn for action selections, and scrolls the resolved turn/action row into view.

- Observation: The current renderer is structurally correct on recent real sessions, but dense sessions already exceed the comfort zone of a static scroll sheet.
  Evidence: The real-session validation pass in `reports/2026-04-18-real-session-validation.md` found a recent implementation session with 211 projected nodes / 202 edges and a computed surface of `976 × 8186`, plus another dense session at `976 × 4244`.

- Observation: A pure viewport math layer plus a hybrid canvas renderer is a safe incremental bridge away from persistent per-node DOM without changing the graph IR or selection architecture.
  Evidence: `src/lib/exploration-graph-viewport.ts` now owns fit/pan/zoom/reveal math, `src/components/exploration/use-graph-viewport.ts` owns camera state, and `src/components/exploration/exploration-graph.tsx` now draws bulk topology on `<canvas>` while keeping selection in `ExplorationView`.

- Observation: Real-session layouts still collapse to very small overview scales once the graph is camera-framed, which confirms that density-sensitive rendering is the next readability problem.
  Evidence: The viewport validation rerun in `reports/2026-04-18-canvas-viewport-validation.md` found fit scales of `0.08` on a recent 240-node session and roughly `0.14–0.18` on several 100+ node sessions, with zero selected-node reveal failures.

- Observation: Low-zoom density treatment and session-level grouping are coupled in the user experience, but they are not the same implementation step.
  Evidence: The graph remains hard to read at fit scale even before root grouping is considered; improving zoom-band rendering first preserves current graph truth while making it easier to judge whether an extra session-spine treatment is still necessary.

- Observation: A scale-aware renderer can simplify overview nodes and suppress artifact labels without changing layout bounds, hit-testing, or selection ownership.
  Evidence: `src/lib/exploration-graph-render-style.ts` now derives zoom bands, label policy, accent policy, and visual weight from viewport scale plus node kind/role, while `src/components/exploration/exploration-graph.tsx` still picks nodes against the same layout rectangles.

- Observation: The ambiguous fit-scale range for real sessions is wider than the first draft threshold suggested. Sessions around `0.21–0.27` still behave like overview topology rather than readable mid-zoom graphs.
  Evidence: The focused tuning pass in `reports/2026-04-18-density-tuning-validation.md` showed that these sessions produced many accent dots but no meaningful labels under the earlier boundary; moving them back into overview removed chrome clutter while preserving structure.

## Decision Log

- Decision: Rewrite `Graph` mode in place instead of introducing a third middle-pane mode such as `Tree`.
  Rationale: The product already has `Map` and `Graph`, and the user explicitly wants the current Graph surface rewritten from scratch rather than split into another mode.
  Date/Author: 2026-04-18 / pi

- Decision: Treat the qgto screenshots as design references only, not as a behavioral or chrome contract.
  Rationale: Ariadne already has a left narrative pane and inspector; copying the reference app's extra transcript panel, timestamps, legend, or keyboard bar would duplicate existing product surfaces.
  Date/Author: 2026-04-18 / pi

- Decision: Move track documentation to the track root and keep stable copies of the current UI screenshots inside the track.
  Rationale: The previous nested `docs/` structure was outdated for this feature track, and temp-path screenshots would otherwise be fragile for future implementation sessions.
  Date/Author: 2026-04-18 / pi

- Decision: Milestone 1 ships with a top-down tree layout that grows left-to-right by causal depth and keeps framing as a separate dashed branch.
  Rationale: That orientation fits Ariadne's current middle pane, makes prompt/turn/tool/artifact depth readable, and can be implemented with lightweight custom SVG layout helpers instead of a graph library.
  Date/Author: 2026-04-18 / pi

- Decision: Treat the current SVG + positioned-DOM renderer as a stepping stone and plan the next phase around a viewported actual-canvas-oriented graph surface.
  Rationale: Real-session validation showed the projection and selection model are sound, but dense sessions still become 4k–8kpx scroll sheets. The main remaining problem is camera/density behavior, not correctness.
  Date/Author: 2026-04-18 / pi

- Decision: The first Milestone 3 slice ships as a hybrid canvas renderer with a minimal DOM selected-node overlay rather than as another per-node DOM surface.
  Rationale: This moves the product onto an actual canvas-oriented rendering path immediately, keeps active selection affordances crisp, and avoids disturbing the existing shared-selection contract.
  Date/Author: 2026-04-18 / pi

- Decision: Selected-node reveal is conditional. The camera should only move when the active node falls outside a padded viewport, not on every selection change.
  Rationale: Left-pane selection and graph clicks should preserve spatial continuity when the user is already looking at the relevant neighborhood.
  Date/Author: 2026-04-18 / pi

- Decision: Sequence the remaining Milestone 3 work as density-sensitive zoom-band rendering first, then session-level grouping evaluation.
  Rationale: Fit-scale readability is the immediate product problem. A session spine or grouped-root treatment is easier to judge once overview rendering is no longer dominated by equally weighted card chrome.
  Date/Author: 2026-04-18 / pi

## Outcomes & Retrospective

Current outcome:
- planning and track-doc refactor are complete
- Milestone 1 projection/layout helpers and Graph-mode replacement are implemented in code
- Graph mode now renders a full-session topology surface from `SessionGraphPayload` instead of depending on `compute_insight_subgraph()`
- Milestone 2 reverse-sync wiring is implemented in code for turn/action rows and framing rows
- the first Milestone 3 slice is now implemented: Graph mode has a viewport/camera model, pan/zoom/fit/reveal behavior, and a canvas-oriented bulk renderer with a minimal DOM active-node overlay
- a real-session validation rerun confirmed that the viewport math behaves correctly on sampled Ariadne sessions and that the graph now behaves like a bounded camera surface rather than only a static sheet
- the next density pass is now implemented in code: overview, mid-zoom, and detail states use different node chrome, label visibility, accent behavior, and edge emphasis while preserving the same graph truth and shared-selection contract

Remaining work:
- re-run interactive in-app review to confirm the tuned overview/mid/detail boundaries feel right during actual pan/zoom use, not only in offline fit-scale analysis
- evaluate whether the current prompt-forest presentation now warrants a subtle session-spine or grouped-root treatment, and keep it presentation-only if pursued
- capture any repeated-artifact, framing, or density-polish follow-up work
- re-run interactive app validation after any additional camera/grouping polish

## Context and orientation

Relevant current files:
- `src/components/exploration/exploration-view.tsx` — shared state owner for selection and middle-pane mode
- `src/components/exploration/exploration-path.tsx` — left narrative pane that must remain the chronological control surface
- `src/components/exploration/exploration-graph.tsx` — current graph renderer to replace
- `src/components/exploration/exploration-inspector-v2.tsx` — existing detail pane to preserve
- `src/lib/exploration-path-view-model.ts` — turn/action derivation used by the left pane
- `src/lib/exploration-insight-graph-view-model.ts` — current selection-centered graph derivation that should no longer define Graph mode's primary data model
- `src/lib/exploration-graph-layout.ts` — current selection-centered layout helper
- `contracts/graph/types.ts` — canonical graph IR contract
- `backend/analytics/graph/derive-session-graph.ts` — graph derivation from replay entries
- `artifacts/session-graph-structure-reference.md` — durable explanation of graph node/edge meanings

Reference images kept in the track:
- `specs/session-graph-tree-visualization/references/ariadne-current-walkthrough-reference.png`
- `specs/session-graph-tree-visualization/references/ariadne-current-graph-reference.png`
- qgto reference images in the same directory

## Plan of work

1. Build a full-session graph projection helper that chooses a deterministic tree parent for each visible node and outputs a renderable topology for the middle pane.
2. Prototype at least one default orientation against a real session so the team can choose the clearest first-ship layout.
3. Replace the current `ExplorationGraph` implementation so `MiddlePaneMode = "map" | "graph"` remains intact but `graph` now renders the new topology surface.
4. Extend shared-selection behavior so graph-originated selection can expand and scroll the left pane to the owning turn/action.
5. Validate on real sessions, then document any deferred polish items in the plan/specs/track notes.

## Concrete steps

Run from repository root.

1. Inspect the existing graph and path files before editing:
   - `read src/components/exploration/exploration-view.tsx`
   - `read src/components/exploration/exploration-path.tsx`
   - `read src/components/exploration/exploration-graph.tsx`
   - `read src/lib/exploration-path-view-model.ts`
   - `read contracts/graph/types.ts`

2. Search for current graph-mode dependencies:
   - `rg -n "compute_insight_subgraph|compute_graph_layout|MiddlePaneMode" src/components src/lib`
   Expected result: current Graph mode depends on the selection-centered insight helpers.

3. Implement the new projection/layout helpers and renderer.

4. Add tests for the new projection/layout and any synchronization helpers.

5. Validate behavior on real sessions and note observed issues in this plan before pausing.
6. Plan the viewport/canvas follow-up once real-session validation identifies the next bottleneck.

## Validation and acceptance

Code-level validation:
- run the relevant test suite for new view-model/layout helpers
- run `bun run typecheck`
- for Milestone 2, run the targeted path/graph unit tests covering reverse row mapping and layout/projection behavior
- note that the repo-wide `bun test` run currently fails in unrelated pre-existing backend/qmd/provider-limit areas, so milestone verification should use the targeted graph/path tests until those failures are addressed

Behavior validation in the app / on real sessions:
- derive recent Ariadne sessions from `~/.pi/agent/sessions` for the current repo path and verify projection/layout/reverse-sync invariants still hold
- open `/sessions/:id/exploration` when doing interactive review
- switch to `Graph`
- verify the middle pane shows full-session topology rather than the old reduced explanation graph
- click a left-pane turn/action and verify the graph selection updates
- click a graph node and verify the left pane expands/scrolls to the owning turn/action and the inspector updates
- switch `Map` ↔ `Graph` and verify selection persists
- record whether dense sessions still read as a tall scroll sheet rather than a navigable graph surface

Acceptance bar:
- no duplicate transcript/detail panel exists inside the graph surface
- Ariadne theme tokens are reused rather than a hardcoded reference palette
- the graph reads as a full-session topology view, not the previous selection-only diagram

## Idempotence and recovery

- The planning/docs changes are already safe and can be rerun or rewritten without affecting product code.
- During implementation, keep the old graph helpers available until the new renderer is wired and validated.
- If the new full-session renderer becomes too noisy, keep the new projection helper and temporarily narrow visible node families rather than reverting to the old selection-centered product behavior.

## Artifacts and notes

Planning and implementation artifacts created/updated in this session:
- `README.md`
- `specs/README.md`
- `specs/session-graph-tree-visualization/spec.md`
- `specs/session-graph-tree-visualization/graph-mode-canvas.md`
- `specs/session-graph-tree-visualization/selection-and-sync.md`
- `specs/session-graph-tree-visualization/milestones.md`
- `specs/session-graph-tree-visualization/milestone-1-full-session-projection.md`
- `specs/session-graph-tree-visualization/milestone-3-canvas-viewport-and-density.md`
- `reports/2026-04-18-real-session-validation.md`
- `reports/2026-04-18-canvas-viewport-validation.md`
- `exec-plans/active/2026-04-18-session-graph-tree-visualization.md`
- `src/lib/exploration-session-graph-view-model.ts`
- `src/lib/exploration-session-graph-layout.ts`
- `src/lib/exploration-path-view-model.ts`
- `src/lib/exploration-graph-viewport.ts`
- `src/components/exploration/exploration-graph.tsx`
- `src/components/exploration/use-graph-viewport.ts`
- `src/components/exploration/exploration-view.tsx`
- `src/components/exploration/exploration-path.tsx`
- `src/components/exploration/exploration-framing.tsx`
- `tests/unit/lib/exploration-session-graph-view-model.test.ts`
- `tests/unit/lib/exploration-session-graph-layout.test.ts`
- `tests/unit/lib/exploration-path-view-model.test.ts`
- `tests/unit/lib/exploration-graph-viewport.test.ts`
- screenshot copies under `specs/session-graph-tree-visualization/references/`

## Interfaces and dependencies

Required completion interfaces:
- `SessionGraphPayload` remains the graph source of truth.
- `MiddlePaneMode` should still support `"map" | "graph"`; the meaning of `graph` changes, not the route-level mode count.
- `selected_node_id` in `ExplorationView` remains the shared selection contract.
- The left pane must expose enough programmatic control to expand/scroll to a selected graph node's owning turn/action.
