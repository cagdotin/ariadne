# Milestone 3 — Canvas viewport and density plan

Status: Draft
Date: 2026-04-18
Parent spec: [[specs/session-graph-tree-visualization/spec.md]]
Related:
- [[specs/session-graph-tree-visualization/graph-mode-canvas.md]]
- [[specs/session-graph-tree-visualization/selection-and-sync.md]]
- [[reports/2026-04-18-real-session-validation.md]]
- [[exec-plans/active/2026-04-18-session-graph-tree-visualization.md]]

## 1. Why this milestone exists

Milestone 1 and Milestone 2 established the new graph mode's truth model:
- Graph mode now projects from `SessionGraphPayload`
- shared selection stays in `ExplorationView`
- graph-originated selection can reveal the owning left-pane row

The real-session validation pass showed that this foundation is structurally sound, but it also exposed the next bottleneck:

- dense real sessions already produce graph sheets that are several thousand pixels tall
- the current SVG + positioned-DOM renderer reads as a long scroll surface rather than a navigable graph camera
- hiding the `session` root turns multi-turn sessions into a stack of prompt roots, which is truthful but visually fragmented

So the next milestone is no longer about graph correctness. It is about **viewport behavior, density handling, and renderer architecture**.

## 2. Goals

- Move Graph mode toward an **actual canvas-style graph surface** that behaves like a navigable viewport instead of a tall document.
- Keep the current projection/layout helpers reusable so the renderer can change without redoing the graph model.
- Add camera behavior appropriate for topology exploration:
  - pan
  - zoom
  - fit/center behavior for selection
- Preserve the current product contract:
  - left pane remains the narrative surface
  - inspector remains the detail surface
  - `selected_node_id` in `ExplorationView` remains the shared selection source of truth
- Make dense sessions comfortable enough that the graph still communicates overall structure instead of only local detail.

## 3. Non-goals

- Redesigning the backend graph IR.
- Replacing the left pane or inspector.
- Adding qgto-style transcript chrome, keyboard bar, or legend panel as a required part of this milestone.
- Rendering every deferred structural edge family (`imports`, `linked_to`, `belongs_to`, etc.) before the base viewport is usable.
- Committing to a minimap or orientation toggle for first ship of the canvas phase.

## 4. Real-session constraints that now matter

The validation report establishes the following product-level constraints:

1. **Density is already real.**
   Recent Ariadne sessions reached 128–211 projected nodes and 4244–8186px layout heights with the current layout constants.

2. **Correctness is no longer the main risk.**
   Reverse-sync mapping and selection-path layout generation held up on sampled real sessions.

3. **The current surface is document-like.**
   Scroll-only navigation is acceptable for the current stepping-stone renderer, but it is not the intended end-state for the graph experience.

4. **Forest presentation needs stronger session-level framing.**
   Multi-turn sessions currently appear as multiple prompt roots plus a framing root. That is logically valid, but the canvas phase should make the session read as one navigable whole.

## 5. Renderer direction

### 5.1 Architectural direction

The renderer should evolve in layers rather than via a rewrite that throws away Milestone 1 work.

Keep these pieces as renderer-agnostic inputs:
- `project_session_graph_tree(...)`
- `compute_session_graph_layout(...)` or its successor layout model
- left-pane reverse-sync mapping in `resolve_path_selection_target(...)`

Add a new viewport/render layer on top.

### 5.2 What “actual canvas” means here

This milestone should plan for a **literal canvas-backed topology surface**, but not at the expense of the current selection architecture.

The preferred implementation direction is a **hybrid actual-canvas renderer**:
- draw the bulk graph topology on `<canvas>`
- keep shared selection in React state
- use a thin DOM layer only where it materially improves accessibility or active-state presentation

The important boundary is:
- Graph mode should no longer depend on **one persistent DOM node per graph node** as its primary rendering strategy.

### 5.3 Why hybrid is the safest first step

A full canvas renderer improves density and viewport control, but a small DOM overlay remains useful for:
- selected-node affordances
- tooltips or transient labels if needed
- preserving a path to accessibility without rebuilding the whole product around canvas semantics

This milestone does not require that every label, focus ring, and affordance be canvas-only on day one.

## 6. Viewport model

The canvas phase should introduce an explicit viewport model in graph/world coordinates.

### 6.1 Required viewport capabilities

- pan by dragging the graph surface
- zoom by wheel/trackpad
- preserve zoom center under the cursor when practical
- fit the graph to the available pane on initial load or graph changes
- center or reveal the selected node when graph selection changes and the node would otherwise be lost offscreen

### 6.2 Viewport invariants

- selection state remains external to the viewport
- the viewport transforms rendered positions, not graph truth
- pan/zoom must not change which node is selected
- selection highlighting must remain stable while camera state changes

### 6.3 Interaction reuse opportunity

The traces view already contains a small but relevant precedent for viewport interaction patterns:
- wheel-based panning under zoom
- drag-based zoom selection

Those files are not a direct graph implementation template, but they are useful local references for how Ariadne already handles camera-like interaction in React:
- `src/components/traces/traces-view.tsx`
- `src/components/traces/hooks/use-timeline-zoom.ts`

## 7. Layout implications

The current tree layout remains a valid first-pass topology model, but the canvas milestone should explicitly evaluate two presentation upgrades:

### 7.1 Session-level grouping

The canvas view should make a multi-turn session read as a single session structure rather than as unrelated root trees.

Candidate strategies:
- an implicit vertical session spine that visually groups prompt roots without reintroducing the hidden `session` node as a prominent card
- a grouped root lane for turns/prompts
- a layout adjustment that reduces excessive vertical root separation

This is a presentation decision, not a graph-IR change.

### 7.2 Density-sensitive rendering

The renderer should not treat all nodes as equally heavyweight cards at all zoom levels.

Expected direction:
- compact glyph-like rendering at lower zoom
- clearer labels/cards when zoomed in or when selected
- topology first, labels second

The current DOM card treatment can remain the visual reference for close-range node styling, but not necessarily for every zoom level.

### 7.3 Recommended sequencing for the next slice

Low-zoom density treatment and session-level grouping are related, but they should not be treated as the same task.

Recommended order:
1. **Density-sensitive zoom-band rendering first**
2. **Session-level grouping evaluation second**

Rationale:
- the current product-level failure at fit scale is that dense sessions still collapse into a low-information sheet of equally weighted cards
- that problem remains even if prompt roots are visually grouped better
- judging whether a session spine is still necessary becomes easier once the overview rendering is no longer dominated by card chrome

The next implementation slice should therefore keep the current graph truth and layout semantics intact while making the renderer scale-aware.

Expected first-pass zoom bands:
- **overview** — nodes render as compact pills/glyphs; labels are suppressed except for the selected node and selected path
- **mid zoom** — prompts, turns, and selected/path nodes can carry truncated labels; artifacts stay visually lighter
- **detail** — current card-like treatment remains the reference

Invariants for that slice:
- no graph-IR changes
- no new middle-pane mode
- no graph-local transcript or inspector surface
- no clustering/collapse behavior that changes node identity or selection semantics
- hit-testing and selected-node reveal continue to operate on the same layout bounds

Only after that pass should the team evaluate whether multi-turn sessions still need an additional presentational grouping treatment such as a subtle session spine, grouped root rail, or root-lane background.

## 8. Selection and sync requirements for the canvas phase

The current two-way binding remains mandatory.

The canvas milestone must preserve:
- left pane → graph selection highlight
- graph → left pane expansion/scroll sync
- graph → inspector sync

It should add or improve:
- selected-node reveal/centering within the viewport
- stable active-path emphasis under pan/zoom
- clear distinction between active node and merely visible neighborhood

## 9. Testing and validation strategy

### 9.1 Unit-level

Add tests for any new viewport helpers, including:
- world-to-screen and screen-to-world transforms
- fit-to-bounds calculations
- reveal-selected-node behavior
- hit-testing or node picking logic if implemented outside the component

### 9.2 Real-session validation

Validation should continue to use actual Ariadne sessions from `~/.pi/agent/sessions` for the current repo path.

The next manual validation bar should include:
- a dense implementation session around the 200-node range
- a smaller planning/exploration session
- selection from left pane into graph with camera reveal
- selection from graph back into the left pane and inspector
- zoom/pan behavior that still feels stable while selection changes

## 10. Implementation checklist

- [x] Introduce a graph viewport model for pan/zoom/fit/reveal behavior.
- [x] Decide the first actual-canvas rendering split: hybrid canvas + minimal DOM overlay for the active selected node.
- [x] Prototype canvas hit-testing and node selection without moving shared selection ownership out of `ExplorationView`.
- [x] Re-run real-session validation on dense sessions and document whether the canvas phase resolves the current 4k–8kpx scroll-sheet problem.
- [x] Add scale-aware zoom-band rendering so overview, mid-zoom, and detail states do not all use the same visual weight.
- [x] Re-validate dense and small real sessions at fit scale after the density pass and tune thresholds for selected-path emphasis, label visibility, and node chrome.
- [ ] Validate whether the current forest of prompt roots still needs an implicit session spine or grouped-root treatment after the density pass.

## 11. Open questions

1. Which zoom thresholds best separate overview, mid-zoom, and detail states on real sessions without making labels flicker too aggressively?
2. At overview scale, should prompt roots keep labels, or should text be reserved strictly for selected/path nodes?
3. After density-aware rendering lands, what is the lightest session-level grouping treatment that improves the whole-session read without introducing fake causality?
