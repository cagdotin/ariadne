# Exploration Graph Visualization Upgrade — turn Graph mode into a real path diagram

Status: Draft
Date: 2026-04-13
Execution plan: [[docs/exec-plans/pending/2026-04-13-exploration-graph-visualization-upgrade.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
- [[docs/specs/2026-04-13-exploration-temporal-history.md]]
- [[docs/specs/2026-04-13-exploration-path-insight-graph.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-path-insight-graph.md]]

## 1. Problem statement

Exploration now has a dedicated Graph mode in the middle pane, but visually it is still not functioning like a graph.

In the current implementation, Graph mode is effectively:
- a grouped list of nodes
- separated by conceptual role buckets such as primary path and supporting contributors
- with small edge hints and labels
- but without a real sense of topology, flow, spatial relationship, or route geometry

That means users still do not get the main value they expect from a graph tab:
- seeing the path spatially
- understanding directionality at a glance
- following relationships with arrows/connectors
- perceiving the selected route as a shape instead of a list

This is especially visible in two important cases:

1. **Selected artifact**
   - users want to see how the agent arrived at the file/doc/output
   - the current list does not make the route legible enough visually

2. **Selected turn or prompt**
   - users want to see what path formed after this point in the session
   - the current list does not communicate chronology, branching, or convergence strongly enough

The route already has the right semantics. The next problem is visual expression.

The goal of this phase is to turn Graph mode into a **real selection-centered path diagram**.

That means:
- nodes positioned spatially, not just listed
- explicit connectors/arrows between them
- a deterministic, readable layout
- stronger visual separation between primary route, supporting contributors, structural references, and downstream effects
- a graph that still remains historically truthful and selection-first

## 2. Goals and non-goals

### 2.1 Goals
- Replace the current list-like Graph mode rendering with an actual graph visualization
- Keep Graph mode selection-first and explanation-first
- Preserve Map mode as the artifact-first overview surface
- Render explicit edges/arrows between nodes in Graph mode
- Make Graph mode visually answer:
  - how did we get here?
  - what did this cause?
  - what related explored files/docs matter?
- Use a deterministic layout that remains readable for the kinds of subgraphs Exploration shows
- Encode time/order in the layout where useful so the graph also feels like an investigation path
- Keep observed / ambient / inferred / structural context visually distinct
- Prefer an in-house renderer-first solution over introducing a heavy external graph dependency

### 2.2 Non-goals
- Replacing Map mode entirely
- Building a generic infinite graph canvas or whiteboard
- Showing the full session graph as a force-directed network by default
- Introducing a graph database or backend visualization service
- Adding symbol-level graph detail in this phase
- Solving all large-graph scalability problems at once

## 3. Current state

### 3.1 What is already true
- the middle pane already supports `Map` and `Graph`
- Graph mode already receives a selection-centered explanation subgraph
- Graph mode already distinguishes conceptual roles such as:
  - primary path
  - supporting contributors
  - structural references
  - downstream effects
- temporal-history semantics already exist and should remain the truth boundary

### 3.2 What is still missing
- nodes are not spatially laid out like a graph
- edges are not visually drawn as the primary organizational structure
- the route shape is not readable at a glance
- graph mode does not yet feel meaningfully different enough from a categorized list
- turn/prompt graph views do not yet communicate path formation or branching visually

## 4. Product framing

### 4.1 The job of Map mode
Map mode remains the right place for:
- overview
- inventory
- neighborhood scanning
- broad artifact context

### 4.2 The job of Graph mode
Graph mode should become the right place for:
- route explanation
- causal understanding
- influence understanding
- structural relationship understanding
- path shape and convergence/branching visibility

The user should come away feeling:
- **Map** tells me what is around here
- **Graph** shows me how this fits together

## 5. Visual strategy

### 5.1 Recommended layout family
Do **not** use a generic force-directed graph as the default.

Recommended direction:
- a **layered directional path diagram**
- rendered as a deterministic graph with explicit connectors
- closer to a story graph / DAG / investigation flow than to a network hairball

This is the best fit for Exploration because the route already has strong structure:
- prompts/turns start things
- tools/searches move investigation forward
- docs/files/outputs accumulate
- selected artifact views have natural upstream and downstream sides

### 5.2 Core layout principle
Use layout to answer the current question.

#### For selected artifact
Recommended default mental model:
- **left** = upstream causes / prompts / searches / supporting docs/files
- **center** = selected artifact / focal node
- **right** = downstream effects / edits / writes / influenced outputs
- **vertical ordering** = first-seen / step order where useful

#### For selected turn or prompt
Recommended default mental model:
- **left** = selected prompt/turn anchor
- **middle-left** = discovery/search/tool steps
- **middle** = docs/files explored
- **middle-right / right** = edited/written outputs and influenced nodes
- **vertical ordering** = temporal order or grouped first-seen order

This gives Graph mode both:
- directional meaning
- a timeline feel

### 5.3 Why a layered path diagram fits better than a network cloud
A layered diagram helps users answer:
- what started this?
- what came next?
- what mattered most?
- where did the path end?

A force-directed graph is much worse at these questions because it optimizes for generic topology, not investigation reading.

## 6. Detailed design

### 6.1 Graph mode should render actual geometry
Graph mode should use:
- positioned nodes
- explicit edges with arrowheads or directional cues
- visible route spine
- readable spacing and grouping

The current grouped list should be replaced by a graph canvas-like surface, even if implemented with ordinary HTML + SVG.

### 6.2 Rendering approach
Preferred implementation direction for v1:
- render nodes as ordinary React/HTML elements
- render edges behind them with SVG
- compute node positions in a pure renderer-side layout helper
- keep the layout deterministic and testable

This avoids introducing a heavy external library prematurely.

A good first renderer can be built with:
- a scrollable container
- absolutely positioned node cards
- an SVG overlay for connectors
- a layout view model that computes columns/rows and edge endpoints

### 6.3 Column / lane model for Graph mode
Graph mode should use semantic columns rather than force-directed free placement.

Recommended graph columns:

#### Artifact selection graph
1. upstream turns/prompts
2. discovery/tools
3. supporting docs/files
4. focal artifact
5. downstream effects
6. structural neighbors or secondary related artifacts when useful

#### Turn/prompt selection graph
1. prompt/turn anchor
2. discovery/tools
3. docs/files explored
4. outputs / downstream influenced artifacts
5. optional secondary structural references

These do not need to appear as labeled headers in every case, but the layout engine should think in these terms.

### 6.4 Edge rendering
Graph mode should draw real edges.

Recommended edge behavior:
- primary path edges = thickest / strongest / most saturated
- supporting contributor edges = thinner / secondary emphasis
- structural reference edges = distinct color and lighter visual treatment
- downstream-effect edges = directional and clearly different from upstream arrival edges
- ambient/inferred edges = dashed or muted

Good edge styles:
- orthogonal routed connectors for clarity, or
- soft bezier curves if they remain readable

Arrowheads or direction cues should be present on at least the most important edges.

### 6.5 Node treatment
Nodes should remain compact but more graph-like.

Recommended node design:
- icon + short label
- small badges for role or availability only when needed
- selected node clearly centered or visually dominant
- edited/written outputs visibly special
- structural-reference-only nodes slightly lighter than path nodes

Nodes should not all have identical weight.

### 6.6 Primary path emphasis
This is the most important visual requirement.

When a selection exists, the user should immediately see:
- the main route spine
- where the path starts
- where it converges
- where it ends

Supporting contributors should enrich the route, not compete with it.

### 6.7 Structural references
Structural references among already explored artifacts should appear as supportive context, not as equal-weight route edges.

Examples:
- `imports`
- `linked_to`
- `belongs_to` where useful

These should be visually distinct so the user can tell:
- the agent explicitly read this file
- and this file structurally references that file

without conflating “followed in exploration” with “exists structurally in repo context”.

### 6.8 Graph mode empty / low-detail state
When Graph mode has no meaningful selection, avoid rendering a low-value tangle.

Preferred behavior:
- either a very simplified session topology, or
- a clean instructional empty state inviting the user to select a turn/prompt/file/doc

It is better for Graph mode to be intentionally selection-first than to show a weak generic graph.

### 6.9 Graph mode and temporal history
Graph mode must remain compatible with temporal-history semantics.

That means:
- selected turn/prompt graph = built-so-far only
- selected artifact graph = arrival-path/historical contributor graph
- future artifacts must not leak into the graph view
- structural references only appear when their endpoints are valid in the current historical slice

### 6.10 Graph mode and inspector
The inspector should complement the graph, not carry all explanation.

The graph should show the shape.
The inspector should explain the claim.

Examples of graph-aligned summaries:
- “Primary route shown in bold; supporting contributors are amber.”
- “Structural references are cyan and do not imply explicit exploration steps.”
- “Downstream effects are shown to the right of the selected file.”

## 7. Interaction model

### 7.1 Preserve current interaction basics
Users should still be able to:
- click nodes
- switch focus modes
- switch between Map and Graph
- use the left narrative pane as the primary chronological control

### 7.2 Minimum interactions for Graph v1
Required:
- click node to select/focus it
- hover a node or edge to strengthen its local route
- switching selection reflows/highlights the graph deterministically

Optional if it stays simple:
- small “fit route” / “center selection” behavior
- show/hide structural references toggle if the graph becomes noisy

### 7.3 What not to do yet
Do not start with:
- arbitrary drag nodes
- infinite pan/zoom complexity unless clearly needed
- freehand canvas interactions
- dense toolbar controls

The first goal is readable explanation, not a graph editor.

## 8. Architecture and implementation constraints

### 8.1 Prefer custom renderer first
Do not add an external graph/canvas library by default.

Rationale:
- current needs are constrained and selection-first
- deterministic layout is more important than generic graph capability
- a lightweight in-house SVG + positioned-node renderer is likely enough

If a library is later considered, it should only happen after proving that the current graph semantics and layout model cannot be expressed cleanly in-house.

### 8.2 Use renderer-side pure layout helpers
The layout engine should live in pure helper code, not inside React rendering logic.

Recommended outputs:
- graph nodes with x/y or column/row positions
- graph edges with routed geometry metadata
- ranked groups / emphasis levels
- optional viewport sizing hints

### 8.3 Do not reopen backend semantics casually
This is a visualization upgrade, not a graph derivation rewrite.

Any backend or contract change should be treated as a separate decision, not a casual follow-on.

## 9. Testing strategy

### 9.1 Unit tests
Add tests for:
- deterministic layout assignment by selection type
- role-based placement of primary path, contributors, structural refs, and downstream effects
- edge routing metadata generation
- suppression of invalid or noisy nodes/edges in graph mode
- compatibility with temporal-history visibility constraints

### 9.2 Component tests
Add focused tests for:
- Graph mode rendering positioned nodes rather than simple list sections
- SVG or equivalent connector rendering
- switching Map ↔ Graph without losing selection
- selected artifact and selected turn producing distinct graph layouts
- structural reference styling distinct from observed path styling

### 9.3 Manual validation
Validate on real sessions that:
- Graph mode visually reads like a graph, not a list
- selected file/doc/output has a clear upstream and downstream shape
- selected prompt/turn has a clear path formation shape
- Graph mode is more useful than Map mode for path explanation
- users can understand the graph without relying exclusively on inspector prose

## 10. Implementation checklist
- [ ] Replace grouped-list Graph rendering with a real graph visualization surface
- [ ] Add a pure layout view model for selection-centered graph geometry
- [ ] Render nodes with positioned layout and SVG connectors/arrows
- [ ] Implement distinct visual treatment for primary path, supporting contributors, structural references, and downstream effects
- [ ] Encode temporal/history ordering in vertical or secondary placement where appropriate
- [ ] Keep Graph mode historically truthful under current temporal-history semantics
- [ ] Preserve Map as the default overview mode
- [ ] Add graph-aware inspector copy where helpful
- [ ] Add tests for layout, connector rendering, and mode behavior
- [ ] Validate on real sessions and document any follow-up work

## 11. Open questions

1. Should Graph mode use orthogonal connectors or curved connectors by default?
2. Should no-selection Graph mode show a very small session topology or only a selection prompt?
3. Should structural references be always visible when valid, or hidden behind a lightweight toggle if they create clutter?
4. Should Graph mode support modest zoom-to-fit in v1, or rely on scroll and fixed layout first?
5. If the graph surface grows tall, should the vertical axis remain purely temporal or allow grouped clustering that partially bends strict order for readability?
