# Tasks

## Current phase

- Phase 1 — graph readability polish plus causal-lineage follow-up on top of the new full-session Graph surface

## Current tasks

- [x] Refactor the track so the root is the documentation root.
- [x] Capture stable copies of the current Ariadne walkthrough and graph screenshots inside the track.
- [x] Rewrite the old single tree-visualization spec into a focused spec set and create an execution plan.
- [x] Prototype the full-session graph projection and pick the first-ship default orientation.
- [x] Replace the current Exploration `Graph` renderer with the new full-session tree/graph surface.
- [x] Add graph-to-left expansion/scroll synchronization.
- [x] Validate the current full-session graph surface on real sessions and record density/readability findings.
- [ ] Re-run focused interactive review for the current density/grouping thresholds and record any remaining presentation-only follow-ups.
- [x] Implement same-turn discovery lineage and inferred causal influence on top of the current graph surface.
- [ ] Validate the new grouped-column Graph projection plus same-turn search/file → action → artifact lineage on real sessions in-app and document any broaden/defer decisions.

## Open threads

- Decide which framing nodes, if any, should appear in the main graph by default.
- Decide whether structural cross-links (`imports`, `linked_to`) belong in first ship or a follow-up slice.
- Decide whether the current prompt-forest presentation still needs a subtle session-spine/grouped-root treatment after the density pass.
- Decide whether influence inference should stop at same-turn search/file contributors for first ship or broaden immediately into instruction-source contributors.
- Decide how grouped semantic action nodes should interact with inspector/detail copy when a graph node represents multiple raw tool calls.

## Next steps

- Run focused in-app validation for the new grouped search/action/file columns and record any ambiguous-case or presentation follow-ups.
- Re-run interactive in-app review for the tuned overview / mid-zoom / detail thresholds.
- Use the new lineage work to judge whether Path, Influence, and inspector wording need additional follow-up beyond the graph parentage change.

## Done

- Explored the existing track, graph IR docs, Exploration renderer, and historical specs.
