# Milestones

Status: Draft
Date: 2026-04-18
Parent spec: [[specs/session-graph-tree-visualization/spec.md]]
Execution plan: [[exec-plans/active/2026-04-18-session-graph-tree-visualization.md]]

## Milestone 0 — Track documentation refactor and planning

### Outcome
The track becomes self-contained at the root level, with stable reference images and a rewritten spec set that matches the current product direction.

### Exit criteria
- track docs no longer require a nested `docs/` directory
- current Ariadne screenshots are copied into the track
- the old single spec is replaced by the new focused spec set
- an active execution plan exists for implementation

## Milestone 1 — Full-session graph projection and layout prototype

### Outcome
A renderer-side graph/tree projection exists for `SessionGraphPayload`, and the team has validated at least one readable default orientation for the middle pane.

### Exit criteria
- the implementation no longer relies on `compute_insight_subgraph()` for Graph mode's primary data model
- a pure graph projection/layout helper exists for the new mode
- the prototype renders realistic session topology with visible forks and stable ordering
- the current selection-centered graph renderer is no longer the target design

## Milestone 2 — Graph mode replacement and shared selection integration

### Outcome
Exploration `Graph` mode is replaced in the product and stays synchronized with the existing left pane and inspector.

### Exit criteria
- middle-pane `Graph` mode renders the new full-session graph/tree surface
- clicking in the left pane selects the graph
- clicking in the graph selects the left pane and inspector
- graph selection can reveal collapsed owning turns in the left pane
- no graph-local transcript/detail panel was introduced

## Milestone 3 — Viewported canvas graph surface

### Outcome
The rewritten graph becomes a true navigable graph surface for real sessions rather than a tall scroll sheet, while staying synchronized with the left pane and inspector.

### Exit criteria
- Graph mode has an explicit viewport model with pan/zoom behavior
- selection visibility/centering behavior feels stable on real sessions
- the renderer no longer depends on one persistent DOM node per graph node as its primary rendering strategy
- styling uses Ariadne's theme and existing visual language
- branch density remains readable on real sessions in the target range
- follow-up decisions are documented for any deferred items such as session-spine treatment, minimap experiments, orientation toggles, or structural cross-links

## Deferred unless proven necessary

These are intentionally outside the first committed shipping slice:
- qgto-style keyboard navigation shortcuts
- graph-local legend/status bar/transcript surfaces
- fixed color recipes copied from references
- structural cross-link rendering for every non-tree edge
- minimap or advanced viewport chrome as a required first-ship feature
