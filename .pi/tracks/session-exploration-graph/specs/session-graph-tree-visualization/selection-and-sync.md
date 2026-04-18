# Selection and Sync

Status: Draft
Date: 2026-04-18
Parent spec: [[specs/session-graph-tree-visualization/spec.md]]

## 1. Purpose

This document defines the interaction contract between:
- the existing left Exploration path pane
- the rewritten middle-pane graph canvas
- the existing inspector

The main requirement is **two-way binding**.

## 2. Single source of truth

`src/components/exploration/exploration-view.tsx` already owns shared selection state through `selected_node_id`.

The rewrite should preserve that architecture.

That means:
- the left pane should keep setting shared selection
- the graph canvas should set the same shared selection
- the inspector should continue to read from the same shared selection

No graph-local selection store should become the product truth.

## 3. Left-to-graph behavior

When the user selects from the left pane:
- the graph should highlight the matching node
- the graph should reveal the relevant branch/path clearly
- if the node is outside the current viewport, the graph should pan or scroll enough to make the selected node visible

This applies to:
- turn selection
- action/tool selection
- artifact selection when the left pane exposes the artifact through an action row

## 4. Graph-to-left behavior

When the user selects a node in the graph:
- the same node becomes the shared selection
- the left pane reflects that selection
- the inspector updates using its existing selection flow

### 4.1 Required left-pane response

Because the left pane is turn-based rather than a freeform node list, graph-originated selection must also do the following when needed:
- expand the owning turn if the selected node lives inside a collapsed turn
- scroll the left pane so the relevant turn/action is visible
- preserve a stable visual highlight for the selected item or its nearest owning row

### 4.2 Artifact selection mapping

Some graph nodes map to left-pane action rows rather than top-level rows.

Examples:
- a `tool_call` or `search_query` should reveal its action row
- a `source_file` or `doc_file` should reveal the action row that first or most directly points at it within the owning turn

The left pane does not need to become a duplicate global node index. It only needs enough reverse mapping to keep the selection synchronized and understandable.

## 5. Inspector contract

The existing inspector remains the only detail pane for the graph selection.

Therefore the graph rewrite should **not** add:
- a graph-local transcript panel
- a branch summary sidecar inside the middle pane
- a second inspector competing with `ExplorationInspectorV2`

If graph-mode-specific summaries are useful, they should be expressed through the existing inspector, not through a new panel.

## 6. Mode switching behavior

Ariadne should continue to support `Map` and `Graph` in the middle pane.

Switching between them should:
- preserve selection
- preserve the existing inspector content
- avoid resetting the left pane's expanded/collapsed state unless necessary

## 7. Interaction scope

### Required for first ship
- click/tap node to select
- synchronized selection across left pane, graph, and inspector
- enough automatic centering/scrolling to keep the active node visible

### Explicitly not required for first ship
- qgto-style keyboard walking shortcuts
- a graph-local status bar
- a graph-local transcript scroll model
- branch-management actions

## 8. Acceptance criteria

This interaction layer is complete when:

1. A left-pane selection visibly updates the graph canvas.
2. A graph-node selection visibly updates the left pane.
3. Graph-node selection can expand and scroll the left pane to the owning turn/action.
4. The existing inspector remains the only selection detail surface.
5. Switching `Map` ↔ `Graph` does not lose the current selection.
