# Report

## Current state

- Planning and documentation for the session graph/tree visualization rewrite are in place.
- The track has been refactored so its root is the documentation root.
- Stable copies of the current Ariadne walkthrough/graph screenshots now live inside the track alongside the qgto inspiration images.
- Milestone 1 is implemented: Graph mode now uses a full-session projection/layout path instead of the selection-centered insight graph.
- Milestone 2 core sync wiring is now in place: graph-originated selection can expand and scroll the left pane to the owning turn/action, and framing selection now highlights/expands the framing section.
- Milestone 3 has now started in product code: Graph mode uses an explicit viewport/camera layer plus a canvas-oriented renderer instead of a static SVG + positioned-DOM sheet.
- Shared selection still remains in `ExplorationView`, and graph → left pane → inspector synchronization is preserved.
- A real-session validation rerun has been completed for the viewport slice and is recorded in `reports/2026-04-18-canvas-viewport-validation.md`.
- Discovery-lineage Milestone 1 is now implemented in graph derivation: same-turn search tool calls can correlate to `toolResult` output and emit `discovered` plus action-targeted `influenced_by` edges when the surfaced artifact match is exact or uniquely resolvable.
- Discovery-lineage Milestone 2 is now implemented in the projection/explanation layer: full-session tree projection, Graph-mode insight paths, and inspector path summaries now prefer `turn -> search -> action -> artifact` when the inferred same-turn search lineage is strong enough.
- Real-session follow-up on `e8c0c10f-6599-4e15-bcdc-8ba1b279857d` exposed that exact-hit-only influence was still too weak, so the backend now also scores same-turn search-query term affinity, post-search artifact references, and same-artifact follow-up to choose a better immediate cause for later actions.
- Graph mode is now moving beyond strict single-parent tree rendering: the canvas uses a grouped columnar projection that keeps prompts/turns, searches, actions, and files in stable columns while collapsing repeated semantic nodes such as repeated `write path/to/file.ts` or repeated file nodes across the session.
- Grouped-column edge routing now uses dedicated inter-column lanes plus bridge rails for skipped-column edges, so lines no longer run through the search/action/file node bodies when a turn connects directly to a later column.

## Changes made

- Moved track planning material out of the nested `docs/` subtree into root-level `specs/`, `exec-plans/`, and `reports/`.
- Added `README.md` as the track-level documentation map.
- Rewrote the tree-visualization work into a focused spec set plus an active execution plan.
- Updated tasks, findings, decisions, and references to match the new structure and direction.
- Added `specs/session-graph-tree-visualization/milestone-1-full-session-projection.md` to define the first implementation slice.
- Implemented renderer-side full-session projection and layout helpers under `src/lib/`.
- Replaced the middle-pane `ExplorationGraph` input model so Graph mode renders full-session topology from `SessionGraphPayload` with shared selection highlighting.
- Added unit tests for the new projection/layout helpers.
- Validated the current projection/layout/reverse-sync path against recent real Ariadne sessions and recorded the results in `reports/2026-04-18-real-session-validation.md`.
- Added `specs/session-graph-tree-visualization/milestone-3-canvas-viewport-and-density.md` to plan the next renderer phase.
- Added pure viewport math helpers in `src/lib/exploration-graph-viewport.ts` for fit, pan, zoom, transform conversion, and selected-node reveal.
- Added `src/components/exploration/use-graph-viewport.ts` to keep camera state separate from graph truth and selection truth.
- Reworked `src/components/exploration/exploration-graph.tsx` into a viewported graph surface that draws the bulk graph on `<canvas>` and uses only a minimal DOM overlay for the active selection affordance.
- Added targeted viewport tests in `tests/unit/lib/exploration-graph-viewport.test.ts`.
- Re-ran real-session validation for the viewport slice and documented fit-scale / reveal results in `reports/2026-04-18-canvas-viewport-validation.md`.
- Fixed a renderer regression where session edges became effectively invisible while zooming because the canvas theme adapter wrapped Ariadne's OKLCH theme tokens in invalid `hsl(...)` strings; the graph renderer now uses valid theme colors directly and slightly strengthens session edge strokes at higher zoom.
- Updated the Milestone 3 planning artifacts to sequence the remaining work as density-sensitive zoom-band rendering first, then session-level grouping evaluation.
- Implemented the density-sensitive zoom-band pass: Graph mode now varies node chrome, label visibility, accent visibility, and edge emphasis across overview, mid-zoom, and detail states without changing graph truth or selection semantics.
- Added `src/lib/exploration-graph-render-style.ts` plus targeted tests to keep zoom-band thresholds and label/accent policy explicit and tunable.
- Ran a focused real-session tuning pass and recorded the threshold/fit-scale assessment in `reports/2026-04-18-density-tuning-validation.md`.
- Added `reports/2026-04-18-session-graph-structure-evaluation.md` to capture a structural review of the current graph IR versus the current full-session Graph-mode projection.
- Appended a follow-on spec inside that report for same-turn discovery lineage and inferred causal influence, then created `exec-plans/active/2026-04-18-session-graph-discovery-lineage.md` to sequence the implementation work.
- Implemented the first discovery-lineage code slice in `backend/analytics/graph/derive-session-graph.ts`: same-turn `toolCall` ↔ `toolResult` correlation, search-result text extraction, path/basename matching, and inferred `discovered` / `influenced_by` edges with targeted backend tests.
- Updated `src/lib/exploration-session-graph-view-model.ts` so inferred same-turn `influenced_by` edges can become the visible parent for later tool nodes before `invoked_tool` fallback.
- Updated `src/lib/exploration-insight-graph-view-model.ts` so artifact, turn, and tool selections can surface upstream search lineage as the primary path while keeping `discovered` edges as supporting explanation context.
- Added or extended targeted tests in `tests/unit/lib/exploration-session-graph-view-model.test.ts`, `tests/unit/lib/exploration-insight-graph-view-model.test.ts`, and `tests/unit/lib/exploration-inspector-summaries.test.ts` to lock the new parentage and primary-path behavior.
- Broadened `backend/analytics/graph/derive-session-graph.ts` again after real-session validation so action attribution is no longer exact-search-hit-only: it now combines explicit search hits, specific search-query term affinity, post-search file-reference evidence from earlier reads, and same-artifact follow-up while still withholding tied medium-confidence candidates.
- Added targeted backend tests for search-topic batches, file-to-file reference influence, same-artifact read→edit follow-up, and tied-query ambiguity suppression.
- Verified against session `e8c0c10f-6599-4e15-bcdc-8ba1b279857d` that the `rg "exploration-session-graph|ExplorationGraph|viewport|graph" ...` search now parents the three following reads in the derived tree instead of leaving them as turn-level siblings.
- Fixed a validation trap in `backend/analytics/session-cache.ts`: session resync now clears replay-derived graph and legacy exploration caches, so reloading after `Sync` no longer serves stale pre-change graph topology from backend memory.
- Fixed a Graph-mode runtime regression in `src/lib/exploration-session-graph-layout.ts`: helper logic for artifact sink placement now defines `is_artifact_node` locally instead of crashing at runtime.

## Risks or follow-ups

- The main technical risk is keeping the full-session graph readable in the existing middle pane without reintroducing a second transcript/detail surface.
- The first implementation intentionally defers non-tree structural cross-links; real-session validation may show where repeated artifact touches need a richer treatment than single-parent projection.
- The current density pass is intentionally heuristic; threshold tuning improved after the focused real-session pass, but interactive in-app review should still confirm the tuned overview/mid/detail boundaries.
- The current prompt-forest presentation is improved by camera and density behavior, but the session-level grouping question is still open; multi-turn sessions can still read as stacked prompt roots.
- The new reverse-sync path uses first-match action mapping for repeated artifact selections; the real-session validation pass showed the mapping stays consistent with the chosen tree parent, but UX should be re-validated after additional canvas polish.
- A new structural review found that the current graph IR is mostly sound as a provenance model, but the current full-session Graph mode likely overexposes scaffolding nodes such as `assistant_turn` and file-touching `tool_call` nodes as peer-visible topology. The main follow-up question is now projection strategy, not only density tuning.
- The newest planned follow-up is same-turn discovery lineage: real Graph-mode sessions currently flatten searches and later reads into siblings, so the next semantic slice should determine when `search_query -> tool_call` and `search_query -> artifact` edges can be inferred honestly enough to change visible parentage.
- The backend now emits broader same-turn lineage edges, and the projection/insight surfaces prefer those edges when they are same-turn, visible, and medium/high confidence; in-app canvas validation is still needed before expanding beyond same-turn search/file contributors into instruction-source primaries.
- Current in-app validation still has a presentation caveat: at fit/overview zoom the old tree layout could visually collapse extra depth. The new grouped-column projection reduces that issue by pinning prompts, turns, searches, actions, and files into stable columns, but it still needs real-session tuning for row ordering and grouped-selection clarity.
- `bun run typecheck` passes.
- Targeted graph/path/viewport/renderer-policy tests pass after the density pass.

## Milestones

- Milestone 0 complete: planning + track-doc refactor.
- Milestone 1 in progress: full-session projection/layout and Graph-mode replacement landed in code; core validation is now complete and remaining work is density/viewport follow-up.
- Milestone 2 in progress: graph-to-left expansion/scroll synchronization is implemented in code; core validation is now complete and remaining work is any reverse-mapping adjustment discovered during the canvas phase.
- Milestone 3 in progress: viewport/canvas and the first density-sensitive rendering pass are implemented in code, and the next work is real-session threshold tuning plus session-level grouping follow-up.
