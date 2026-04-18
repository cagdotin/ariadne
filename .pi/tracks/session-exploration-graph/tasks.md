# Tasks

## Current phase

- Phase 0 — planning and track-doc refactor for the session graph/tree visualization rewrite

## Current tasks

- [x] Refactor the track so the root is the documentation root.
- [x] Capture stable copies of the current Ariadne walkthrough and graph screenshots inside the track.
- [x] Rewrite the old single tree-visualization spec into a focused spec set and create an execution plan.
- [ ] Prototype the full-session graph projection and pick the first-ship default orientation.
- [ ] Replace the current Exploration `Graph` renderer with the new full-session tree/graph surface.
- [ ] Add graph-to-left expansion/scroll synchronization.
- [ ] Validate on real sessions and record deferred polish items.

## Open threads

- Decide which framing nodes, if any, should appear in the main graph by default.
- Decide whether structural cross-links (`imports`, `linked_to`) belong in first ship or a follow-up slice.
- Decide whether orientation switching is a first-ship affordance or a later polish item.

## Next steps

- Start Milestone 1 from `specs/session-graph-tree-visualization/milestones.md`.
- Prototype topology projection directly from `SessionGraphPayload` rather than `InsightSubgraph`.
- Use the new stable screenshots plus qgto references while reviewing prototype density.

## Done

- Explored the existing track, graph IR docs, Exploration renderer, and historical specs.
