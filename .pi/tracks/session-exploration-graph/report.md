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

## Risks or follow-ups

- The main technical risk is keeping the full-session graph readable in the existing middle pane without reintroducing a second transcript/detail surface.
- The first implementation intentionally defers non-tree structural cross-links; real-session validation may show where repeated artifact touches need a richer treatment than single-parent projection.
- The new viewport/canvas layer fixes the old document-like interaction model, but dense sessions still fit down to very small overview scales (`~0.08` on a recent 240-node real session). Density-sensitive rendering is now the main follow-up risk.
- The current prompt-forest presentation is improved by camera behavior, but the session-level grouping question is still open; multi-turn sessions can still read as stacked prompt roots.
- The new reverse-sync path uses first-match action mapping for repeated artifact selections; the real-session validation pass showed the mapping stays consistent with the chosen tree parent, but UX should be re-validated after additional canvas polish.
- `bun run typecheck` passes.
- Targeted graph/path/viewport tests pass after the edge-visibility fix.

## Milestones

- Milestone 0 complete: planning + track-doc refactor.
- Milestone 1 in progress: full-session projection/layout and Graph-mode replacement landed in code; core validation is now complete and remaining work is density/viewport follow-up.
- Milestone 2 in progress: graph-to-left expansion/scroll synchronization is implemented in code; core validation is now complete and remaining work is any reverse-mapping adjustment discovered during the canvas phase.
- Milestone 3 in progress: the first viewport/canvas slice is implemented in code, and the next work is density-sensitive rendering plus session-level grouping follow-up.
