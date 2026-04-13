# Rewrite Exploration visualization as a path-emphasized layered graph

Status: Done
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
Related artifacts:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/exec-plans/pending/2026-04-13-session-graph-first-migration.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

The Exploration route is now graph-first, but its visualization is still transitional. The current right pane is primarily a grouped artifact browser, and the overall route still makes users work too hard to reconstruct the agent’s investigation.

This rewrite should make Exploration feel like a **path-first investigation viewer with a context map**.

After this work:
- the left pane reads as a clear exploration path, not just a generic timeline list
- the right pane reads as a graph-aware context map, not just grouped artifact pills
- the default view visually prioritizes the actual observed exploration path
- selected prompts, files, docs, and framing nodes clearly answer the important user questions
- the route becomes a stable foundation for future topology improvements without reopening backend semantics

Verification target:
- a user can click an edited file and immediately see how the agent got there
- a user can click a prompt/turn and immediately see what followed from it
- a user can distinguish observed, ambient, inferred, and unavailable context at a glance
- the visualization is readable without opening raw replay or interpreting a dense graph by hand

## Is there a separate cleanup task needed first?

**No separate blocking task is required before this rewrite.**

Graph-first migration has already established the right semantic source of truth. Any remaining cleanup needed for this phase should be folded into the implementation itself, especially:
- keeping documentation status honest once this lands
- pruning any temporary compatibility assumptions that the rewrite no longer needs
- adding renderer-side graph-native view-model helpers rather than expanding old adapter logic

## Progress

- [x] (2026-04-13) Milestone 0: Confirm the visualization boundary and fold in any minor cleanup.
- [x] (2026-04-13) Milestone 1: Introduce graph-native renderer view models for layout, focus, and highlighting.
- [x] (2026-04-13) Milestone 2: Rewrite the left pane into a clearer exploration path view.
- [x] (2026-04-13) Milestone 3: Replace the grouped artifact browser with a path-emphasized layered context map.
- [x] (2026-04-13) Milestone 4: Add top-strip controls, summary signals, and focus modes.
- [x] (2026-04-13) Milestone 5: Strengthen inspector summaries and graph-aware explanations.
- [x] (2026-04-13) Milestone 6: Validate with real sessions, record UX findings, and leave the route ready for future topology enhancements.

## Current state

What is now true:
- Exploration loads graph-first from `SessionGraphPayload`
- framing is visible and inspectable
- route-level graph truth is stable and the sole data source
- left pane is a graph-native path view with turn summaries, action kind icons, revisit markers, and edit-adjacent highlights
- right pane is a layered context map with semantic lanes (framing, prompts, discovery, docs, files, outputs, context)
- inspector is graph-native with full arrival path tracing (turn → tool → file) and context-dependent summaries
- controls strip shows session summary chips and focus mode toggle (Path, Influence)
- Path mode follows temporal/invocation edges; Influence mode follows causal/structural edges — tested as distinct
- selection drives mode-aware BFS-based upstream/downstream highlighting across both panes
- observed/ambient/inferred/unavailable styling is visually distinct
- compatibility adapter (`graph-to-exploration-adapter.ts`) is no longer in the rendering path
- route page no longer projects through ExplorationPayload

What is intentionally deferred:
- Neighborhood focus mode (code is structured for adding it via `FocusMode` union + edge set)
- SVG edge connectors in context map (lanes-only layout ships first)
- replay stepping/scrubbing (future enhancement, no architectural blockers)
- symbol-level graph visualization (future phase)
- multi-session comparison UI (future phase)

## Decision Log

- Decision: the visualization rewrite should optimize for user understanding of the investigation path, not for maximizing graph complexity.
  Rationale: the main user questions are causal and chronological, not “show me the repo graph.”
  Date/Author: 2026-04-13 / planning session

- Decision: the rewrite should use a hybrid model: layered directional layout plus path emphasis.
  Rationale: directional lanes improve readability, while path emphasis makes the observed story dominant.
  Date/Author: 2026-04-13 / planning session

- Decision: no large force-directed graph library is required for the first rewrite slice.
  Rationale: readability and trust matter more than maximal graph freedom in the first visual rewrite.
  Date/Author: 2026-04-13 / planning session

- Decision: graph-native renderer-side view models are preferred over deepening dependence on the compatibility adapter.
  Rationale: the route is already graph-first; the rewrite should lean into that rather than extending transitional abstractions.
  Date/Author: 2026-04-13 / planning session

- Decision: route page no longer projects through ExplorationPayload adapter.
  Rationale: all new components consume SessionGraphPayload directly via graph-native view models. Adapter remains available but is out of the rendering path.
  Date/Author: 2026-04-13 / implementation

- Decision: context map uses div-based lane layout rather than SVG edges in the first slice.
  Rationale: lanes provide the primary readability benefit; SVG connectors can be added later without rearchitecting.
  Date/Author: 2026-04-13 / implementation

- Decision: selection highlighting uses BFS-based upstream/downstream traversal of the full graph.
  Rationale: provides accurate causal path highlighting for "how did the agent arrive here?" without needing pre-computed path indexes.
  Date/Author: 2026-04-13 / implementation

- Decision: Path and Influence modes use different edge-kind filter sets for BFS traversal.
  Rationale: Path follows temporal/invocation edges (prompted, invoked_tool, read, edited, wrote, searched_for, discovered). Influence follows causal/structural edges (constrained_by, influenced_by, framed_by, linked_to, imports, belongs_to, read, edited, wrote, invoked_tool, adjacent_unexplored). Same selection in both modes produces provably different subgraphs.
  Date/Author: 2026-04-13 / implementation

- Decision: inspector "How it was reached" shows full arrival paths (user_prompt → turn → tool → file) rather than just immediate edges.
  Rationale: user feedback showed immediate edges (tool_call → file) were insufficient — the user prompt that triggered the investigation is the most important context for understanding arrival.
  Date/Author: 2026-04-13 / implementation, based on user validation feedback

## Real-session validation

### Sessions validated
- Manual validation performed by user on real Ariadne development sessions (2026-04-13)

### Findings
1. **Selected prompt → downstream exploration**: works as expected. Selecting a turn highlights downstream tools and files in both panes.
2. **Selected edited file → arrival path**: fixed during validation. Inspector now shows full path: which user prompt triggered the turn that invoked the tool that read/edited the file.
3. **Ambient on/off behavior**: works as expected. Toggling ambient hides/shows ambient context nodes.
4. **Framing and unavailable prompt honesty**: works as expected. System prompt correctly shown as "Unavailable", ambient instruction sources correctly shown as "Ambient".
5. **Path vs Influence distinction**: implemented and tested. Selecting the same file in Path mode shows only the temporal invocation chain; in Influence mode shows additional structural context (adjacent unexplored files, framing relationships).

### Issues found and fixed
- Inspector "How it was reached" only showed immediate parent edges (tool_call → file read), not the full path (user_prompt → turn → tool_call → file). Fixed by adding `compute_arrival_paths()` which traces the full chain.
- Path and Influence modes were using identical BFS traversal. Fixed by implementing mode-aware edge filtering with distinct edge-kind sets.

## Terms used in this plan

- **Path-first**: the route prioritizes the actual explored sequence and causal chain over abstract topology.
- **Layered graph**: nodes are arranged in semantic lanes rather than a freeform force simulation.
- **Context map**: the right pane’s graph-aware visual neighborhood for selected exploration state.
- **Focus mode**: a rendering emphasis mode such as Path, Influence, or Neighborhood.
- **Graph-native view model**: a renderer-side pure derivation from `SessionGraphPayload` used only for presentation.

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or extend tests that prove the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Confirm visualization boundary and fold in minor cleanup

Before changing the UI, confirm the renderer architecture for the rewrite.

Required outcomes:
- document in code comments where graph-native presentation logic lives
- decide which current components are being evolved vs replaced
- ensure we are not reintroducing a competing semantic model
- fold in any small bookkeeping cleanup that helps the next phase stay honest

Recommended boundaries:
- `SessionGraphPayload` remains the semantic source of truth
- new renderer helpers derive visualization-specific state from graph
- compatibility adapter remains narrow and transitional where still needed

Tests to add first:
- none required; this is architecture/bookkeeping confirmation

### Milestone 1 — Graph-native view-model layer

Add pure renderer-side helpers that derive what the visualization needs from graph.

Required outcomes:
- lane assignment for node families
- visible node/edge sets for the default mode
- highlight subgraph derivation for selections
- summary derivation for turns/files/docs/instruction sources
- styling-state derivation for observed / ambient / inferred / unavailable

Recommended new modules:
- `src/lib/exploration-graph-view-model.ts`
- `src/lib/exploration-graph-layout.ts`
- `src/lib/exploration-graph-selection.ts`

Tests to add first:
- lane assignment produces stable semantic columns
- selected edit/file highlights correct upstream/downstream subgraph
- observed vs ambient vs inferred vs unavailable styling state is derived correctly
- focus-mode filtering/emphasis works deterministically on graph fixtures

### Milestone 2 — Rewrite the left pane as an exploration path

Refactor the current timeline into a clearer path view.

Required outcomes:
- turns remain the main grouping unit
- each turn presents a readable sequence of actions
- event kinds are more legible at a glance
- revisits and edit-adjacent events stand out
- the pane better answers “what happened after this prompt?”

Recommended improvements:
- clearer turn headers with compact per-turn summaries
- visible path connectors or stepped grouping inside each turn
- stronger visual distinction for searches, doc reads, file reads, edits/writes, failed/opaque actions
- more intentional selection affordances than the current double-click/context-menu pattern

Tests to add first:
- selecting a turn highlights the downstream sequence clearly
- selecting an event still drives selection state correctly
- turn summaries display expected counts from graph-derived data

### Milestone 3 — Replace the grouped artifact browser with a layered context map

This is the core rewrite.

Required outcomes:
- the right pane is no longer a grouped pill list pretending to be a graph
- nodes are arranged in semantic lanes/columns
- edges are drawn between related nodes
- observed path is visually emphasized over secondary context
- adjacent unexplored nodes are visible but clearly subordinate

Recommended lane order:
1. framing/instructions
2. prompt/turn anchors
3. discovery/search
4. docs/files explored
5. edited/written outputs
6. muted adjacent context

Implementation options:
- SVG-based lane graph
- custom div-based layout with SVG/absolute connectors
- lightweight layout helper only if it preserves determinism and readability

Do not default to a force-directed layout.

Tests to add first:
- rendered map contains lane/group structure for representative graph fixtures
- selected edited file highlights upstream path
- selected prompt highlights downstream touched nodes
- unexplored neighbors render as visually distinct context nodes

### Milestone 4 — Controls, summaries, and focus modes

Add the top-strip interaction layer that turns the route from a raw visual into a useful tool.

Required outcomes:
- top-strip summary chips for session-level orientation
- focus mode control with at least:
  - `Path`
  - optionally `Influence`
  - optionally `Neighborhood`
- optional visibility toggles for inferred / ambient / adjacent context if needed for readability

Minimum viable requirement:
- Path mode ships and is clearly the default

Preferred if feasible:
- Influence mode also ships in this phase

Tests to add first:
- focus mode switches emphasis without changing underlying truth
- summary counts reflect the graph-derived state correctly
- toggles hide/show secondary context without breaking selection consistency

### Milestone 5 — Strengthen inspector explanations and summaries

The inspector must become more useful alongside the new visuals.

Required outcomes:
- selected turn shows downstream summary counts
- selected file shows first-seen and upstream influence summary
- selected doc/instruction source shows downstream influence summary
- graph-native selections remain provenance-rich and trustworthy

Recommended additions:
- “How it was reached” summary for selected outputs/files
- “What followed from this” summary for selected turn/prompt/doc
- explicit availability/confidence callouts remain visible

Tests to add first:
- selected turn shows correct graph-derived counts
- selected file/doc/instruction source shows expected upstream/downstream summaries
- unavailable nodes remain honest and do not invent influence

### Milestone 6 — Real-session validation and visualization-rewrite seam

Use the rewrite to leave the route ready for later enhancement, not just to ship prettier UI.

Required outcomes:
- validate on at least two real sessions
- confirm path mode is readable without replay inspection
- confirm selected edited files produce believable arrival paths
- document what future visualization improvements can build on directly
- note any transitional compatibility layers still remaining after the rewrite

Questions to answer in the outcomes notes:
- does the current rewrite already satisfy the main user questions?
- what remains for future improvements: replay stepping, deeper topology, symbol awareness, richer graph layouts?

Tests to add first:
- none beyond automated regression suite; this milestone is primarily manual verification and documentation

## Parallelization strategy

This rewrite can be decomposed once the view-model boundary is set.

### Workstream A — graph-native view models and summary logic
- lane assignment
- selection subgraph derivation
- summary derivation
- focus-mode logic
- unit tests

### Workstream B — path pane rewrite
- left-pane event presentation
- turn summaries
- path connectors / sequence rendering
- interaction refinements

### Workstream C — context map rewrite
- right-pane layered map
- node/edge rendering
- selection emphasis
- styling for observed/ambient/inferred/unexplored

### Workstream D — inspector + controls integration
- top-strip controls
- focus mode UI
- inspector summaries
- component tests and real-session validation support

Dependency order:
- Workstream A should land or at least lock helper contracts first.
- Workstreams B and C can proceed in parallel once the view-model shape is agreed.
- Workstream D can begin in parallel if it depends only on a stable summary/selection shape.

## Concrete handoff checklist

Pass the next agent this exact ordered list:

1. **Do not reopen backend truth work**
   - keep `SessionGraphPayload` as the source of truth
   - keep new visualization logic renderer-side and graph-native

2. **Create graph-native view models first**
   - lane assignment
   - visible node/edge derivation
   - focus mode and selection emphasis helpers
   - summary derivation

3. **Rewrite the left pane into a clearer path view**
   - better sequence readability
   - better per-turn summaries
   - better event differentiation

4. **Replace the grouped artifact browser**
   - build a layered context map
   - make observed path dominant
   - make adjacent context subordinate

5. **Add top controls and summary chips**
   - Path mode minimum
   - Influence / Neighborhood if feasible

6. **Upgrade the inspector**
   - stronger “how it was reached” and “what followed from this” summaries
   - keep provenance and availability explicit

7. **Validate on real sessions**
   - at least two sessions
   - record what is still future work

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add pure view-model tests first
bun run test <new-graph-view-model-tests>

# 2. Rewrite path pane with component tests
bun run test <path-pane-tests>

# 3. Replace context map with component tests
bun run test <context-map-tests>

# 4. Add inspector/controls tests
bun run test <inspector-and-controls-tests>

# 5. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use known Ariadne sessions that already contain framing and repo exploration behavior, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This rewrite is complete when all of the following are true:

1. The right pane is graph-aware and no longer just grouped artifact pills.
2. The default mode is a readable path-emphasized layered visualization.
3. Clicking an edited file clearly shows how the agent arrived there.
4. Clicking a prompt/turn clearly shows what followed from it.
5. Observed, ambient, inferred, and unavailable states are visually distinct.
6. One-hop unexplored context remains available but visually subordinate.
7. The inspector provides meaningful summaries beyond raw provenance lists.
8. The route remains graph-first and does not introduce a competing truth model.
9. `bun run typecheck` passes.
10. `bun run test` passes.
11. Manual validation on real sessions is documented.

## Idempotence and recovery

- If the full context-map rewrite is too large for one slice, land graph-native view models and the path-pane rewrite first, then swap out the right pane in a second slice.
- If focus modes become too much for the first implementation, ship Path mode only but structure helpers so other modes can be added without semantic rewrites.
- If lane rendering proves awkward with the first component structure, keep the graph-native view models and swap renderer technology without changing the derived semantics.
- If the compatibility adapter becomes unnecessary during the rewrite, simplify aggressively rather than preserving it for its own sake.

## What comes after this plan

Once this rewrite lands, future work can build on a much stronger surface:
- replay stepping / scrubber
- richer graph canvas behaviors if needed
- lightweight symbol-aware overlays later
- multi-session comparison later

Those later phases should not need to solve the current readability problem again.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `SessionGraphPayload` and `contracts/graph/*` | Semantic source of truth for the route. |
| `src/pages/session-detail-exploration.tsx` | Route entry point that should remain graph-first throughout the rewrite. |
| `src/components/exploration/exploration-view.tsx` | Main composition layer for path pane, context map, controls, and inspector. |
| `src/components/exploration/exploration-timeline.tsx` | Current left pane to evolve or replace. |
| `src/components/exploration/exploration-graph.tsx` | Current grouped artifact browser to replace. |
| `src/components/exploration/exploration-inspector.tsx` | Existing inspector to strengthen with graph-aware summaries. |
| `src/components/exploration/exploration-framing.tsx` | Existing framing strip likely retained and integrated more tightly with the new map. |
| `src/lib/graph-to-exploration-adapter.ts` | Transitional compatibility layer that should not become the long-term renderer architecture. |
| New renderer-side graph view-model helpers | Critical seam for keeping presentation logic testable and isolated. |
