# Milestone 1 — Full-session graph projection and layout default

Status: Draft
Date: 2026-04-18
Parent spec: [[specs/session-graph-tree-visualization/spec.md]]
Execution plan: [[exec-plans/active/2026-04-18-session-graph-tree-visualization.md]]
Related:
- [[specs/session-graph-tree-visualization/graph-mode-canvas.md]]
- [[specs/session-graph-tree-visualization/selection-and-sync.md]]
- [[artifacts/session-graph-structure-reference.md]]

## 1. Problem statement

Milestone 1 is the point where Ariadne stops treating Exploration `Graph` mode as a selection-centered explanation diagram and starts treating it as a **full-session topology surface**.

The immediate problem is not inspector behavior or left-pane reverse sync yet. The immediate problem is that `Graph` mode still derives from `compute_insight_subgraph()` and therefore only explains a selection-local slice.

Before Graph mode can be replaced in product code, Ariadne needs a renderer-side model that can project the full session from `SessionGraphPayload` into a deterministic, readable tree/graph layout for the middle pane.

## 2. Milestone outcome

After this milestone:
- Ariadne has a dedicated full-session graph projection for Graph mode.
- The projection no longer depends on `InsightSubgraph` as Graph mode's primary data model.
- At least one default orientation has been validated as readable for real session topology in the current middle pane.
- The resulting model is ready to power the in-product Graph mode replacement in Milestone 2.

This milestone is primarily about **truthful topology projection and layout readability**.

## 3. Scope and boundaries

### 3.1 In scope
- A renderer-side projection from `SessionGraphPayload` into a full-session tree/graph view model.
- A deterministic visible-parent rule for nodes that may have multiple incoming graph edges.
- Stable ordering rules for prompts, turns, tools, and artifact siblings.
- A first-pass layout that makes branch depth and fan-out legible.
- Validation of one first-ship default orientation.
- Narrowing the visible node/edge set to the session exploration topology needed for first ship.

### 3.2 Out of scope
- Left-pane expansion/scroll synchronization from graph-originated selection.
- Inspector changes beyond whatever is needed to avoid breaking current behavior.
- Orientation toggles as a user-facing feature.
- Full rendering of non-tree structural edges such as `imports`, `linked_to`, and `adjacent_unexplored`.
- Graph-local transcript, legend bar, status chrome, or branch-management interactions.

## 4. Projection rules for first ship

### 4.1 Source of truth
The projection must derive from `SessionGraphPayload`.

It must not use `InsightSubgraph` as the main graph model for Graph mode.

### 4.2 Base visible node families
The first projection should prioritize these node kinds:
- `user_prompt`
- `assistant_turn`
- `tool_call`
- `search_query`
- `source_file`
- `doc_file`
- `agents_doc`
- selected or explicitly included `instruction_source` nodes when framing is shown

### 4.3 Hidden or compressed content
The projection should suppress or collapse by default:
- `session`
- `system_prompt`
- `developer_prompt`
- most `runtime_context` nodes unless a framing treatment explicitly includes them

### 4.4 Edge families used for the base tree
The first-shipping topology should be built from:
- `prompted`
- `invoked_tool`
- `read`
- `edited`
- `wrote`
- `constrained_by` when framing context is shown
- `framed_by` only for framing nodes that are intentionally visible

### 4.5 Deferred graph content
These should stay out of the base projection unless prototype validation shows they remain readable with near-zero extra complexity:
- `imports`
- `linked_to`
- `belongs_to`
- `adjacent_unexplored`
- any other non-tree structural cross-link

## 5. Deterministic tree projection

The graph IR is not guaranteed to already be a pure tree. Some artifacts may be reached multiple times, and some nodes may have multiple meaningful incoming edges.

Milestone 1 therefore needs a projection rule that produces a readable base tree without lying about the session.

### 5.1 Primary parent rule
Each visible node should receive one deterministic primary parent in the projected tree.

That parent should be chosen using the strongest exploration-causal relationship available for the base view, preferring the session spine over weaker structural context.

Practical preference order for first ship:
1. turn/tool causality (`prompted`, `invoked_tool`, `read`, `edited`, `wrote`)
2. framing causality (`constrained_by`, selected `framed_by` cases)
3. ignore or defer other edge families for the base tree

### 5.2 Ordering rule
Sibling order should be stable and derived from replay order rather than ad hoc label sorting.

Preferred ordering sources:
- prompt/turn order from `turn_index`
- tool order from `tool_index`
- artifact order from first-seen replay order within the owning tool/turn path

### 5.3 Repeated artifacts
If the same file or doc is touched multiple times in the session, the projection should remain understandable without turning the base view into a hairball.

For this milestone, the projection may choose one of these acceptable first-ship treatments:
- show the artifact once at its primary first-causal position and use selection/highlighting to reveal later relevance, or
- show repeated appearances only if the duplication remains readable in realistic sessions

The important requirement is that the base full-session silhouette stays legible.

## 6. Layout intent

### 6.1 What the layout must communicate
The chosen layout should make it easy to read:
- overall session depth
- branch forks
- long linear stretches
- where files/docs accumulate
- where edited/written artifacts appear

### 6.2 Orientation decision standard
Milestone 1 only needs one strong default orientation.

The chosen orientation should be the one that best fits Ariadne's current middle pane while preserving branch readability on real sessions. The decision should be based on prototype evaluation, not on copying the reference app.

### 6.3 Layout quality bar
The layout is good enough for Milestone 1 when:
- sibling ordering is stable between renders
- branches do not overlap into unreadable tangles
- a user can visually distinguish turn spine, tool fan-out, and artifact leaves
- the graph already reads as a full-session topology rather than a categorized list

## 7. Renderer architecture constraints

Milestone 1 should stay renderer-side and lightweight.

Preferred implementation direction:
- pure projection helpers in `src/lib/`
- pure layout helpers in `src/lib/`
- custom SVG or SVG-plus-positioned-elements rendering
- no heavy graph dependency unless the custom approach clearly fails during prototype validation

The implementation should also preserve the existing route contract:
- `MiddlePaneMode` remains `"map" | "graph"`
- shared selection continues to live in `ExplorationView`

## 8. Validation criteria for this milestone

Milestone 1 is complete when all of the following are true:

1. Graph mode has a dedicated full-session projection input that no longer depends on `compute_insight_subgraph()`.
2. The projection uses stable ordering derived from replay structure.
3. The prototype shows visible forks and overall topology on at least one realistic session.
4. One default orientation is chosen for first ship.
5. The prototype suppresses or defers structural cross-links that make the topology harder to read.
6. The resulting model is ready to be wired into `src/components/exploration/exploration-graph.tsx` for the Milestone 2 product replacement.

## 9. Implementation notes for the next step

The next implementation session should likely start in these files:
- `src/components/exploration/exploration-view.tsx`
- `src/components/exploration/exploration-graph.tsx`
- `src/lib/exploration-insight-graph-view-model.ts` (as the old dependency to retire from Graph mode)
- `src/lib/exploration-graph-layout.ts` (likely to replace or supersede)
- new full-session projection/layout helpers under `src/lib/`

The main design decision to resolve in code is not whether Ariadne wants a full-session graph. That is already decided. The remaining implementation decision is how to project the graph IR into a readable first-ship tree while preserving truthful session structure.
