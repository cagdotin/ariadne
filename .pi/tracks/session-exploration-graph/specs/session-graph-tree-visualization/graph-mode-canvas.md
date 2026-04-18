# Graph Mode Canvas

Status: Draft
Date: 2026-04-18
Parent spec: [[specs/session-graph-tree-visualization/spec.md]]

## 1. Purpose

This document defines what the rewritten Exploration `Graph` mode owns.

It covers:
- the projection from `SessionGraphPayload` into a full-session tree/graph view
- which graph elements are visible, collapsed, or deferred
- layout and rendering constraints for the middle-pane canvas
- what the implementation should borrow from the reference images versus what it should ignore

It does **not** define a separate detail panel or graph-specific chrome.

## 2. Canvas scope

The new `Graph` mode owns only the middle pane.

It should:
- render a full-session topology view
- make branches and fan-out legible
- support node selection
- visually connect to the existing left pane and inspector through shared selection

It should not:
- reproduce the left narrative pane inside the graph
- add a graph-local transcript panel
- introduce a large control surface copied from the reference app

## 3. Projection from SessionGraphPayload

### 3.1 Source of truth

The renderer projects from `SessionGraphPayload`, not from the older selection-centered `InsightSubgraph`.

### 3.2 Base edges for the first tree renderer

The first renderer should use the session's exploration spine and other strongly causal edges:
- `prompted`
- `invoked_tool`
- `read`
- `edited`
- `wrote`
- `constrained_by` when framing/instruction nodes are visibly included
- `framed_by` only for framing nodes that are intentionally shown

### 3.3 Deferred edges

These should be treated as follow-up work unless a prototype shows they are cheap and readable:
- `imports`
- `linked_to`
- `belongs_to`
- `adjacent_unexplored`
- other non-tree structural edges

The base shipping experience should first make the primary session topology clear.

## 4. Visible versus suppressed graph content

### 4.1 Always-hidden or collapsed-by-default nodes

These nodes are not useful as repeated visual clutter in the first full-session tree surface:
- `session` root node — may exist structurally but does not need a visible card/chip
- `system_prompt` and `developer_prompt` placeholders — already represented in framing context and not visually valuable in the main graph

### 4.2 Visible session spine nodes

These are the likely core visible node families for first ship:
- `user_prompt`
- `assistant_turn`
- `tool_call`
- `search_query`
- `source_file`
- `doc_file`
- `agents_doc`
- `instruction_source` when graph-visible framing context is enabled

### 4.3 Framing visibility rule

Framing should not overwhelm the main topology.

Preferred default:
- keep most framing detail in the existing left pane
- show only the framing nodes that materially shape the topology view
- treat framing as a small pinned cluster or compressed branch, not a second competing tree

## 5. Layout requirements

### 5.1 What matters

The layout must make these things obvious:
- overall session depth
- where branches fork
- which paths stay linear
- which artifacts sit at the leaves or convergence points

### 5.2 What does not need to be over-specified in docs

The spec intentionally does not lock down:
- exact pixel sizes
- exact gap constants
- exact orientation toggle behavior
- exact node shape/color pairings

Those belong to implementation, theme reuse, and iterative UI review.

### 5.3 First-principles layout rules

Regardless of orientation, the renderer should keep these invariants:
- a deterministic primary parent for each visible node
- stable sibling ordering based on replay order and tool order
- branch forks rendered as readable fan-out, not overlapping hairballs
- the selected node and selected path visibly legible without changing data truth

### 5.4 Orientation

The reference material shows both vertical and horizontal layouts.

For Ariadne, first ship only needs **one strong default orientation**. If an orientation toggle is added later, it should be treated as polish rather than the core feature.

## 6. Rendering constraints

### 6.1 Rendering approach

Preferred implementation direction:
- pure renderer-side projection/model helpers
- a custom SVG or SVG-plus-positioned-elements renderer
- no heavy graph library unless the in-house path clearly fails to deliver readability

### 6.2 Styling source of truth

The implementation should use Ariadne's existing theme and component tokens.

This spec deliberately avoids color prescriptions. The reference screenshots communicate density and emphasis, not palette.

### 6.3 Node density and labeling

The graph should privilege topology over verbose labels.

Preferred behavior:
- compact node glyphs/cards
- short labels or tooltips when needed
- readable branch structure at a glance
- details deferred to the existing inspector and left pane

## 7. Performance boundary

The intended first-ship experience should be comfortable on real sessions in the current product range, including sessions with roughly 100+ nodes.

If performance or readability become an issue, the first fallback should be:
- simplify or suppress secondary content
- keep the topology truthful
- avoid adding a second explanatory panel just to compensate

## 8. Reference interpretation rules

### Use the reference material for
- branch density and silhouette
- the feeling of a navigable full-session topology
- how selection should read against a larger graph
- how forks should remain understandable at multiple depths

### Do not copy from the reference material
- exact colors
- exact legend treatment
- keyboard hints
- separate branch transcript panel
- timestamp presentation
- branch management actions such as checkout/branch
