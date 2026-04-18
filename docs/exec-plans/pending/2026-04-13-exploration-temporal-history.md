# Add temporal history semantics to Exploration: built-so-far snapshots and arrival-path views

Status: In Progress
Owner: Follow-up implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-temporal-history.md]]
Related artifacts:
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

Exploration is now graph-first, artifact-first, and materially clearer than it was earlier in the project. The remaining weakness is historical truthfulness.

Right now, the map still tends to present the session’s final explored artifact set, even when the user is focused on an earlier turn or on understanding how a single artifact was reached. That creates hindsight leakage.

This phase fixes that by making the map time-aware in two important ways:

1. **Turn/prompt focus becomes cumulative historical state**
   - when the user selects a turn or prompt, the map should show what had been explored by that point
   - future files/docs should disappear
   - the selected turn’s additions should be emphasized

2. **Artifact focus becomes arrival-path reconstruction**
   - when the user selects a file/doc/output, the map should shift toward explaining how the agent arrived there
   - contributing prompts/searches/docs/files should be included
   - first-seen timing should become part of the explanation

This is the temporal investigation layer that should exist before any future full replay / scrubber UI.

## Current state

What is already true:
- Exploration is graph-first
- pane rebalance shipped: left pane owns narrative; map is artifact-first
- focus modes exist and work
- graph nodes already carry enough ordering metadata to derive temporal order for observed activity:
  - `turn_index` on prompts/turns/tools
  - `tool_index` on tools/searches
- first-seen timing for artifacts can be derived from incoming observed tool edges

What is still missing:
- no built-so-far historical cutoff when a turn/prompt is selected
- no dedicated arrival-path historical slice for selected artifacts
- no explicit renderer-side temporal model shared across map and inspector behavior

## Decision Log

- Decision: preserve the current full-session artifact map when nothing is selected.
  Rationale: the broad session overview is still useful and should remain the default baseline.
  Date/Author: 2026-04-13 / planning session

- Decision: selected turn/prompt should switch the map into a cumulative built-so-far historical state.
  Rationale: this answers “what had the agent explored by this point?” without leaking future artifacts backward.
  Date/Author: 2026-04-13 / planning session

- Decision: selected artifact should switch the map into an arrival-path explanation state.
  Rationale: the highest-value artifact question is “how did the agent get here?”, not “show me the final graph with this node highlighted”.
  Date/Author: 2026-04-13 / planning session

- Decision: derive temporal order in renderer-side pure helpers first rather than extending graph contracts immediately.
  Rationale: current graph metadata is already sufficient to prove the semantics before promoting them into contracts.
  Date/Author: 2026-04-13 / planning session

- Decision: combined Milestones 2 and 3 into a single integration pass since both use the same VisibilityOptions.temporally_visible_node_ids filter.
  Rationale: the map filtering mechanism is identical — only the set computation differs (cutoff vs contributors).
  Date/Author: 2026-04-13 / implementation

- Decision: adjacent unexplored nodes derive their temporal order from their explored anchor's first-seen order.
  Rationale: this ensures adjacent context only appears once its anchor is visible, preventing temporal leakage.
  Date/Author: 2026-04-13 / implementation

- Surprise: Infinity - Infinity = NaN in JavaScript breaks naive subtraction-based comparison. Fixed with explicit equality check.
  Date/Author: 2026-04-13 / implementation

## Progress

- [x] (2026-04-13) Milestone 0: Confirm boundaries and identify the renderer-side temporal seams.
  - Confirmed: existing graph metadata (turn_index, tool_index, incoming tool edges) is sufficient
  - New helper module: `src/lib/exploration-temporal-view-model.ts`
- [x] (2026-04-13) Milestone 1: Derive stable first-seen order and temporal cutoff helpers.
  - TemporalOrder type, get_node_temporal_order(), get_selection_cutoff(), compute_temporally_visible_nodes()
  - 29 unit tests covering ordering, cutoff, visibility, adjacent nodes
- [x] (2026-04-13) Milestone 2: Implement built-so-far map behavior for selected turns/prompts.
  - Added temporally_visible_node_ids to VisibilityOptions
  - Wired through exploration-view.tsx → exploration-map.tsx
  - Temporal lens label shown in map header ("Built to Turn N")
- [x] (2026-04-13) Milestone 3: Implement arrival-path map behavior for selected artifacts.
  - compute_arrival_contributors() derives upstream contributor set
  - Artifact selection triggers arrival-path lens with filtered map
  - Map header shows "Arrival path to <filename>"
- [x] (2026-04-13) Milestone 4: Update inspector/path summaries to reflect historical interpretation.
  - Temporal context banner in inspector header
  - compute_temporal_narrative() for first-seen and built-so-far labels
  - Temporal narrative displayed alongside existing narrative summary
- [ ] (2026-04-13) Milestone 5: Validate on real sessions and document the future playback runway.
  - typecheck: passing
  - tests: 908 passing (was 901, added 36 new)
  - lint: no new errors (pre-existing 41 errors unrelated to this work)
  - manual validation: pending real session testing

## Plan of work

Implementation must follow TDD.

For each milestone:
1. add or update tests proving the intended behavior,
2. implement the smallest change that makes those tests pass,
3. run targeted validation,
4. run broader validation before moving on.

### Milestone 0 — Confirm boundaries and temporal seams

Keep this as a graph-first renderer pass.

Required outcomes:
- confirm that current graph metadata is sufficient for the initial temporal model
- identify the main helper seam(s) for temporal derivation
- avoid casually broadening into full playback controls or backend contract changes

Recommended seams:
- `src/lib/exploration-graph-view-model.ts`
- or a new helper such as `src/lib/exploration-temporal-view-model.ts`
- inspector summary helpers where first-seen / arrival summaries belong

Tests to add first:
- none required

### Milestone 1 — Derive first-seen order and cutoff helpers

Create a stable renderer-side temporal ordering model.

Required outcomes:
- derive comparable order keys for prompts, turns, tools, and artifacts
- derive first-seen order for artifacts from observed incoming tool edges
- derive selected cutoff order for:
  - selected prompt
  - selected turn
  - selected action/tool if practical in this phase
- define temporal visibility helpers usable by map and inspector logic

Recommended concepts:
- `TemporalOrder` or equivalent comparable key
- `get_node_first_seen_order(...)`
- `get_selection_cutoff_order(...)`
- `compute_temporally_visible_node_ids(...)`

Tests to add first:
- prompt/turn/tool ordering tests
- artifact first-seen derivation tests
- tie/ambiguity behavior tests where needed

### Milestone 2 — Built-so-far behavior for selected turns/prompts

Turn and prompt selection should produce a cumulative historical snapshot.

Required outcomes:
- when no selection exists, preserve current full-session artifact-first behavior
- when a turn/prompt is selected, filter the map to artifacts visible by the selected cutoff
- emphasize artifacts first introduced/edited/written in that selected turn
- do not show later files/docs not yet explored by that point
- keep context nodes gated by already-visible explored anchors

Recommended implementation direction:
- build temporal cutoff into map-node and map-edge visibility helpers
- preserve current artifact-first rules on top of the temporal filter
- avoid turning turn selection into a delta-only view; it should stay cumulative

Tests to add first:
- selected early turn excludes later artifacts
- selected prompt matches owning-turn cutoff behavior
- unselected state still shows the full session map
- adjacent unexplored nodes do not appear before their visible explored anchor

### Milestone 3 — Arrival-path behavior for selected artifacts

Artifact selection should answer “how did we get here?”

Required outcomes:
- selecting a file/doc/output recasts the visible map around historical arrival explanation
- upstream contributors are chosen from historically relevant prompts/searches/docs/files/tools
- unrelated later session artifacts are suppressed
- first-seen timing for contributors can be surfaced in summaries/inspector
- Path / Influence / Neighborhood remain meaningful within this arrival-path slice

Recommended implementation direction:
- derive an arrival contributor set from upstream traversals plus historical ordering
- prefer a reduced explanation-first subset when the full upstream graph would be too noisy
- include minimal narrative scaffolding only when needed to explain arrival

Tests to add first:
- selected edited file yields a narrower arrival-focused visible set than unselected session view
- upstream doc/search/prompt contributors are included when connected
- unrelated later artifacts are excluded
- different focus modes still operate within the arrival slice coherently

### Milestone 4 — Update summaries and active-state explanation

Users should understand what kind of historical slice they are seeing.

Required outcomes:
- inspector names the current historical interpretation clearly
- selected turn/prompt can show summary text like “Built so far by end of Turn N”
- selected artifact can show summary text like “Arrival path to X” and “First seen in Turn N”
- path pane and/or top controls can expose the active historical lens if helpful

Recommended additions:
- selection-state chip or label when useful
- first-seen turn summaries for artifacts
- compact explanation of why future artifacts are hidden in turn/prompt historical state

Tests to add first:
- summary helper tests for built-so-far and arrival labels
- component tests for visible historical-state labeling when selections change

### Milestone 5 — Real-session validation and future-playback notes

Confirm that the route feels more historically truthful and more useful.

Required outcomes:
- validate on at least two real sessions
- confirm that early turns no longer leak later artifacts
- confirm that selected artifacts show believable arrival history
- document what remains future work for full playback / scrubber support

Manual validation checklist:
- early prompt/turn → only already-explored artifacts visible
- selected edited file → believable upstream arrival story
- selected doc → shows contributing/downstream history appropriately
- clearing selection → returns to full session artifact view

## Parallelization strategy

This work can split once the temporal helper contract is agreed.

### Workstream A — temporal view-model helpers
- order derivation
- first-seen computation
- cutoff computation
- temporal visibility helpers
- arrival contributor extraction

### Workstream B — map integration
- built-so-far map filtering
- arrival-path visible set
- temporal connector visibility
- focus-mode interaction under temporal slices

### Workstream C — summaries and selection UX
- built-so-far labels
- arrival labels
- first-seen summaries
- minor controls/path-pane alignment

### Workstream D — validation and documentation
- real-session checks
- update spec/plan outcomes
- capture next-phase playback work honestly

Dependency order:
- Workstream A must establish semantics first.
- Workstreams B and C can proceed in parallel once helper outputs are stable.
- Workstream D should run after feature behavior settles.

## Concrete handoff checklist

Pass the next agent this exact ordered list:

1. **Stay renderer-first and graph-first**
   - do not reopen backend truth/model work casually
   - derive temporal semantics from existing graph metadata first

2. **Add a temporal ordering model**
   - prompts/turns/tools already have turn/tool ordering
   - derive first-seen order for files/docs/outputs

3. **Implement built-so-far turn/prompt snapshots**
   - unselected = full session map
   - selected turn/prompt = cumulative explored state through that point
   - future artifacts must disappear

4. **Implement artifact arrival-path views**
   - selected artifact = how did we get here?
   - include prompts/searches/docs/files/tools only when they materially explain arrival
   - suppress unrelated later artifacts

5. **Improve summaries**
   - built-so-far labels
   - arrival-path labels
   - first-seen timing summaries

6. **Validate on real sessions**
   - confirm historical truthfulness improved
   - document future playback runway, but do not build the full scrubber yet

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Suggested implementation sequence
```bash
# 1. Add pure helper tests first
bun run test <new-temporal-view-model-tests>

# 2. Add map/selection behavior tests
bun run test <map-historical-slice-tests>

# 3. Add summary/label tests
bun run test <history-summary-tests>

# 4. Revalidate broadly
bun run typecheck
bun run test
bun run lint
```

### Real-session validation targets
Use known Ariadne sessions that already exercise multi-turn exploration behavior, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

Do not mutate these files.

## Validation and acceptance

This phase is complete when all of the following are true:

1. Unselected Exploration still shows the full session artifact-first map.
2. Selected turn/prompt yields a cumulative built-so-far historical snapshot.
3. Later artifacts are excluded from that historical snapshot.
4. Selected artifact yields an arrival-path historical slice.
5. First-seen timing is available where needed for explanation.
6. Adjacent unexplored context respects temporal anchor visibility.
7. Focus modes remain coherent within temporal slices.
8. `bun run typecheck` passes.
9. `bun run test` passes.
10. Manual validation is documented.

## Idempotence and recovery

- If action-level cutoff is too noisy, land turn/prompt cutoff first and defer finer-grained action stepping.
- If full arrival traversal is too broad, prefer a reduced explanation-first contributor set and document the limit.
- If temporal filtering fights current focus-mode behavior, treat temporal visibility as the outer boundary and focus modes as emphasis within that slice.
- If deriving first-seen order in multiple places becomes messy, consolidate it into one pure helper module before expanding UI behavior.

## What likely comes after this plan

Once this temporal-history layer lands, the next logical step becomes clearer and safer:
- lightweight playback / stepper controls
- jump-to-first-edit / jump-to-first-arrival interactions
- replay frontier and pivot markers

Those should build on this temporal model rather than precede it.

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `SessionGraphPayload` | Remains the source of truth; enough ordering metadata already exists for initial temporal derivation. |
| `backend/analytics/graph/derive-session-graph.ts` | Confirms current ordering metadata: `turn_index`, `tool_index`; should ideally remain unchanged in this phase. |
| `src/lib/exploration-graph-view-model.ts` | Current home for map visibility, selection subgraphs, connectors, and focus semantics; likely needs temporal integration or delegation. |
| new temporal helper module (if added) | Best place for derived first-seen and cutoff logic. |
| `src/components/exploration/exploration-map.tsx` | Main target for built-so-far and arrival-path visible-set behavior. |
| `src/components/exploration/exploration-view.tsx` | Selection-driven orchestration and historical-state wiring. |
| `src/components/exploration/exploration-inspector-v2.tsx` | Best place to explain built-so-far vs arrival-path state and first-seen timing. |
| `src/components/exploration/exploration-path.tsx` | May need minor alignment so turn/prompt selection reads naturally with the new map semantics. |
