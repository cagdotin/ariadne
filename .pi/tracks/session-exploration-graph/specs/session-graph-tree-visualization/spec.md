# Session Graph Tree Visualization

Status: Draft
Date: 2026-04-18
Execution plan: [[exec-plans/active/2026-04-18-session-graph-tree-visualization.md]]
Related:
- [[artifacts/session-graph-structure-reference.md]]
- [[specs/session-graph-tree-visualization/graph-mode-canvas.md]]
- [[specs/session-graph-tree-visualization/selection-and-sync.md]]
- [[specs/session-graph-tree-visualization/milestone-1-full-session-projection.md]]
- [[specs/session-graph-tree-visualization/milestones.md]]
- historical context: [[docs/specs/2026-04-13-exploration-graph-visualization-upgrade.md]]

## 1. Problem statement

Ariadne's current Exploration `Graph` mode is a **selection-centered explanation diagram**. It is useful for answering "how did we get here?" for one selected node, but it is not the feature we now want to ship.

The next feature is a **full-session graph/tree visualization** rendered inside the existing middle pane of the Exploration route.

The current qgto screenshots and video remain valuable, but only as **visual inspiration** for topology, density, and overall feel. They are not a product contract for Ariadne's UI chrome.

Ariadne already has:
- a left narrative pane with session framing, turns, and tool actions
- a shared selection model in `src/components/exploration/exploration-view.tsx`
- an existing inspector pane for provenance and summaries

So the new graph work should not copy the reference app's extra transcript panel, status bar, keyboard legend, timestamps, or explicit color palette.

## 2. Goals and non-goals

### 2.1 Goals
- Replace the current Exploration `Graph` mode in place rather than introducing a third middle-pane mode.
- Render the session as a full, navigable tree/graph derived from `SessionGraphPayload`.
- Keep the left pane as the primary narrative surface and the inspector as the primary detail surface.
- Support two-way binding:
  - selecting from the left pane updates the graph
  - selecting a graph node updates the left pane and the inspector
- Keep screenshot references local to this track so future implementing agents can inspect them.
- Let implementation reuse Ariadne's existing theme tokens and node-kind visual language rather than hardcoding colors in the spec.
- Preserve enough topology to see branch depth, fan-out, and overall session shape at a glance.

### 2.2 Non-goals
- Adding a new graph-local transcript or detail panel.
- Specifying panel widths, exact chrome, or reference-app shortcuts.
- Hardcoding colors, exact pixel constants, or a reference-app skin.
- Turning Ariadne into a writable branch manager or session editor.
- Committing to every feature visible in the reference material for the first implementation slice.

## 3. Current system context

### 3.1 Existing renderer architecture

The current Exploration route is composed from:
- `src/components/exploration/exploration-view.tsx`
- `src/components/exploration/exploration-path.tsx`
- `src/components/exploration/exploration-graph.tsx`
- `src/components/exploration/exploration-map.tsx`
- `src/components/exploration/exploration-inspector-v2.tsx`

Important current behavior:
- `ExplorationView` already owns shared `selected_node_id` state.
- The middle pane already switches between `map` and `graph` via `MiddlePaneMode = "map" | "graph"`.
- The left pane is graph-native and derives turns/actions from `SessionGraphPayload`.
- The inspector already reads directly from `SessionGraphPayload` and should stay the main selection detail surface.

### 3.2 Existing graph semantics

The graph IR is already defined and should remain the source of truth:
- `contracts/graph/types.ts`
- `backend/analytics/graph/derive-session-graph.ts`
- `artifacts/session-graph-structure-reference.md`

This feature is a renderer and planning rewrite, not a graph-IR redesign.

## 4. Core product decisions established by this rewrite

1. **Graph mode is rewritten in place.**
   Ariadne keeps `Map` and `Graph`; the current selection-centered graph renderer is replaced by the new full-session tree/graph renderer.

2. **The qgto material is inspiration, not a behavioral spec.**
   We keep the screenshots because they communicate the desired spatial feeling, branch density, and interaction tone. We do not inherit its panel structure, color system, timestamp treatment, or shortcut bar.

3. **Ariadne's left pane and inspector remain authoritative.**
   Graph mode only owns the middle-pane visualization surface.

4. **Two-way selection binding is a product requirement, not a nice-to-have.**
   The graph is not an isolated canvas. It must stay synchronized with the left pane and the inspector.

5. **Theme reuse is mandatory.**
   The spec should not prescribe colors. The implementation should use Ariadne's existing color tokens, component styling, and node-kind semantics.

## 5. Visual references

These references should remain in the track for implementers:

### Ariadne current-state references
- `references/ariadne-current-walkthrough-reference.png` — current naive walkthrough/path view to preserve as the baseline reference for the left pane relationship.
- `references/ariadne-current-graph-reference.png` — current Graph mode that will be rewritten from scratch.

### qgto inspiration references
- `references/vertical-layout-poster.jpg`
- `references/vertical-layout-start.jpg`
- `references/vertical-layout-navigating.jpg`
- `references/vertical-layout-zoomed-forks.jpg`
- `references/vertical-layout-with-forks.jpg`
- `references/horizontal-layout-overview.jpg`
- `references/horizontal-layout-with-selection.jpg`
- `references/horizontal-layout-detail.jpg`
- `references/horizontal-layout-deep-tree.jpg`

These images define the intended level of spatial clarity, not exact UI requirements.

## 6. Spec map

This work is broken into focused docs instead of one monolithic spec:

- `graph-mode-canvas.md` — what the new middle-pane graph owns, what it suppresses, how it projects the graph IR, and how it should render topology.
- `selection-and-sync.md` — how graph selection must bind to the left pane and existing inspector.
- `milestone-1-full-session-projection.md` — the first implementation slice for full-session projection, deterministic tree rules, and default-orientation validation.
- `milestones.md` — implementation slices, exit criteria, and deferred items.

## 7. Acceptance criteria

This rewrite is complete when all of the following are true:

1. `Graph` mode no longer renders the current selection-centered explanation diagram.
2. The middle pane can show the session's overall exploration topology in a single graph surface.
3. Selecting from the left pane visibly selects the matching node/path in the graph.
4. Selecting from the graph updates the left pane and the existing inspector.
5. The graph does not introduce a duplicate transcript/detail panel.
6. The implementation uses Ariadne's existing theme and styling system rather than a reference-app palette.
7. The track docs for this feature live at the track root, not under an extra `docs/` layer.

## 8. Open questions

1. Should first ship use a default top-down layout, a left-to-right layout, or whichever orientation best fits the current middle pane after prototyping?
2. Which framing nodes should appear in the graph by default versus stay collapsed into existing left-pane framing context?
3. Should non-tree structural edges such as `imports` and `linked_to` be deferred until the base tree renderer is stable?
