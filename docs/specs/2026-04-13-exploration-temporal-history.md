# Exploration Temporal History — cumulative state and arrival-path views

Status: Draft
Date: 2026-04-13
Execution plan: [[docs/exec-plans/pending/2026-04-13-exploration-temporal-history.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-clarity-pass.md]]

## 1. Problem statement

Ariadne’s Exploration route is now in a much better place than the original artifact browser:
- the route is graph-first
- the map is artifact-first by default
- the left pane owns the narrative spine
- the inspector explains provenance and influence
- the pane rebalance reduced duplication between story and map

That is the right shape. But the current map still has an important hindsight problem.

Today, once a session is loaded, the map can still show the user the session’s eventual explored artifact universe even when the user is focused on an earlier turn or an earlier piece of evidence. That means the map can leak future knowledge backward.

This weakens one of the most important questions Exploration should answer:
- what had the agent actually explored **by this point**?

It also limits another key question:
- how did the agent arrive at this file, doc, or output?

The next step is to make the Exploration route more historically truthful and more investigation-oriented.

This phase introduces two complementary behaviors:

1. **Cumulative state for turn/prompt focus**
   - when nothing is selected, keep the full session artifact map
   - when a turn or prompt is selected, show the explored artifact set built **up to that point**, plus emphasis on what that turn/prompt added

2. **Arrival-path view for artifact focus**
   - when a file, doc, or output is selected, show the historical path and hierarchy of how the agent came to read/edit/write that node
   - include the turns, prompts, discovery steps, docs, and other explored artifacts that materially contributed to arrival
   - show when the contributing artifacts were first seen

This is the temporal-history layer the current Exploration route is still missing.

## 2. Product framing

### 2.1 What this phase is
This phase is a **temporal and historical slicing layer** for Exploration.

It adds:
- cumulative “built so far” map behavior for selected turns/prompts
- arrival/history slicing for selected artifacts
- derived first-seen ordering for explored artifacts
- stronger time-aware interpretation of the existing graph-first session view

### 2.2 What this phase is not
This phase is not:
- another graph semantics rewrite
- a graph database phase
- a symbol-level graph phase
- a full replay animation engine
- a multi-session comparison phase

### 2.3 Relationship to the previously discussed next step
The previously discussed next step after the clarity pass was to make Exploration better at showing **how investigation unfolded over time**.

This spec is the right first implementation step toward that direction.

It does **not** require a full scrubber or animated playback yet. Instead, it gives Exploration the historical semantics needed for a later playback layer:
- a meaningful notion of “what was visible by this point”
- a meaningful notion of “how this selected node was reached”
- a renderer-side temporal ordering model derived from the graph

In other words:
> this phase establishes the temporal investigation model before a future full playback UI.

## 3. Current state

### 3.1 What is already true
- `/sessions/:id/exploration` is graph-first and consumes `SessionGraphPayload`
- the map is artifact-first by default after pane rebalance
- the left pane owns framing, turns, and narrative flow
- the route already supports Path / Influence / Neighborhood
- the route already distinguishes observed / ambient / inferred / unavailable state
- current graph nodes carry enough ordering metadata to derive historical sequence for most observed activity:
  - `user_prompt` nodes have `metadata.turn_index`
  - `assistant_turn` nodes have `metadata.turn_index`
  - `tool_call` / `search_query` nodes have `metadata.turn_index` and `metadata.tool_index`
- artifact first-seen timing can be derived from the earliest observed incoming tool edge

### 3.2 What is still missing
- artifact nodes do not currently present a user-facing notion of “visible by this point”
- selecting an early turn can still expose later explored artifacts in the map
- selecting a file/doc/output does not yet fully recast the map around “how we got here”
- the route still tends to present the final session graph more than a historical snapshot

## 4. Goals and non-goals

### 4.1 Goals
- Keep the unselected map as the full session artifact view
- When a turn or prompt is selected, show a **cumulative explored state** up to that point
- When an artifact is selected, show an **arrival-path history view** centered on how that artifact was reached
- Derive a stable temporal ordering in renderer-side helpers from existing graph metadata
- Surface first-seen timing for contributing artifacts and steps where it helps explain arrival
- Keep current focus modes useful while making temporal behavior more truthful
- Prepare the route for a future playback / stepping layer without requiring that full feature now

### 4.2 Non-goals
- Adding a universal persisted `sequence` field to graph contracts in this phase unless absolutely required
- Full animated replay or scrubber controls in this phase
- Reopening backend derivation unless a tiny contract improvement is clearly worth it
- Reverting the artifact-first map model from the pane rebalance

## 5. User questions this phase must answer better

### Highest priority
1. **At this turn, what had the agent explored so far?**
2. **What did this turn/prompt add to the explored working set?**
3. **How did the agent arrive at this file/doc/output?**
4. **Which prompts, searches, docs, and files contributed to that arrival?**
5. **When was each contributing artifact first explored?**

### Important supporting question
6. **What part of the current view is historical state versus future session knowledge?**

The UI should make that distinction clear by behavior, not just by explanation text.

## 6. Core concepts

### 6.1 Full session view
Used when no selection is active.

The map shows:
- the full explored artifact set for the session
- adjacent unexplored context subject to current visibility toggles
- current artifact-first layout rules

This remains useful for overall session understanding and should be preserved.

### 6.2 Built-so-far view
Used when a turn or prompt is selected.

The map shows:
- only artifacts first explored at or before the selected turn/prompt boundary
- emphasis on the artifacts and actions added by the selected turn/prompt
- optional minimal narrative scaffolding needed to connect those additions
- no later artifacts that had not yet been explored at that point

This is a cumulative snapshot, not a per-turn delta-only view.

### 6.3 Arrival-path view
Used when an artifact node is selected.

The map shows:
- the selected artifact
- the strongest upstream path and hierarchy that explains how the agent came to it
- the prompts/turns/searches/docs/files that materially contributed to reaching it
- first-seen timing for those contributors where useful
- downstream edits/writes if they are part of the selected question, but arrival remains primary

This view should answer:
> how did we get here?

not:
> what does the whole session graph contain?

### 6.4 Derived first-seen order
This phase introduces a renderer-side derived order model.

The graph does not currently have one universal `sequence` field on every node. Instead, this phase should derive a comparable order key using existing metadata.

Recommended conceptual shape:
- `turn_index`
- `tool_index`
- derived artifact `first_seen` from earliest incoming observed tool edge

Examples:
- a selected turn can define a cutoff at the end of that turn
- a selected prompt can define the same cutoff as its owning turn
- a selected artifact can derive its first-seen point and upstream contributing sequence

## 7. Detailed behavior

### 7.1 Default unselected state
When no selection is active:
- keep the current artifact-first full-session map behavior
- do not hide artifacts based on temporal cutoffs
- preserve current focus-mode and filtering behavior where sensible

This gives the user the broadest session overview.

### 7.2 Selected turn or prompt
When a turn or prompt is selected:
- compute a temporal cutoff at the end of that selected turn
- show only artifacts whose first-seen order is `<= cutoff`
- emphasize the artifacts first introduced or modified in that turn
- suppress artifacts first seen in later turns
- preserve nearby context only for already-visible explored artifacts
- do not leak future discovered files/docs into this snapshot

The user should be able to read the map as:
> by the end of this turn, this is what the agent had explored.

### 7.3 Selected action within a turn
If the route later supports action-level selection more strongly, the same model should extend naturally:
- compute a finer cutoff at that action’s tool order
- show only what had been explored by that step

This action-level historical slice is desirable if the current UI state already makes action selection meaningful, but it is secondary to turn/prompt correctness in this phase.

### 7.4 Selected file/doc/output
When an artifact is selected:
- the map should shift into arrival-path interpretation
- show the selected artifact plus upstream contributing chain(s)
- include prompt/turn/search/doc/file scaffolding only when it materially explains arrival
- show contributors in a historically ordered way where possible
- surface first-seen timing in the inspector and, when helpful, compactly in the map
- avoid showing unrelated later session artifacts simply because they exist in the final graph

This should work especially well for:
- edited files
- written outputs
- docs that influenced edits
- source files that were read before edits elsewhere

### 7.5 Adjacent unexplored context under temporal slicing
Adjacent unexplored nodes should not appear before their explored anchor becomes visible.

Recommended rule:
- an adjacent unexplored node may only appear once at least one of its explored adjacent anchors is already visible in the current temporal slice

This keeps context believable and avoids implying earlier awareness than the session supports.

### 7.6 Focus modes under temporal history
Path / Influence / Neighborhood should remain meaningful, but the temporal slice becomes the outer boundary.

#### Path
- for a selected turn/prompt, show cumulative build-up through that point with path emphasis on what the selected turn added
- for a selected artifact, emphasize the historical route to that artifact

#### Influence
- for a selected turn/prompt, still respect the temporal cutoff; do not pull in future artifacts
- for a selected artifact, emphasize upstream docs/instructions/files that influenced arrival

#### Neighborhood
- for a selected turn/prompt, show local artifact context only among already-visible artifacts
- for a selected artifact, show local neighborhood around the arrival-time-visible artifact set, not the final session neighborhood if that would leak future knowledge

## 8. UX direction

### 8.1 The map becomes more snapshot-like
The map should feel less like “the whole session graph with a highlight” and more like:
- a historical snapshot for turns/prompts
- an arrival reconstruction for artifacts

### 8.2 The inspector should explicitly name the active historical interpretation
Examples:
- “Built so far by end of Turn 6”
- “Arrival path to `commands.ts`”
- “First seen in Turn 4 after 2 searches and 1 doc read”

### 8.3 The left pane remains the narrative spine
This phase should not undo the pane rebalance.

The left pane still owns:
- framing
- turn chronology
- prompt text
- action sequence

The map becomes more historically truthful relative to that narrative spine.

### 8.4 Lightweight future-facing controls are acceptable
If useful, this phase may add a lightweight control or chip indicating the current historical lens, for example:
- `Full session`
- `Built to Turn 6`
- `Arrival path`

But this should remain simple. A full replay scrubber belongs to a later phase.

## 9. Architecture and implementation constraints

### 9.1 Prefer renderer-side derivation first
Implement the temporal model in pure renderer-side helpers if possible.

Preferred seams:
- `src/lib/exploration-graph-view-model.ts`
- a new helper such as `src/lib/exploration-temporal-view-model.ts`
- inspector/path summary helpers

### 9.2 Do not casually expand graph contracts
The current graph already carries enough ordering information to derive the needed behavior.

A contract addition should only happen if renderer-side derivation proves too brittle or too expensive.

### 9.3 Temporal derivation should be explicit and testable
Recommended derived concepts:
- node first-seen order
- selected cutoff order
- temporally visible node IDs
- arrival-path contributor set
- temporally visible connectors

These should live in pure helpers with focused tests.

## 10. Testing strategy

### 10.1 Unit tests
Add tests for:
- deriving first-seen order for files/docs from incoming tool edges
- deriving selected cutoff order for prompts/turns/tools
- built-so-far visibility excluding future artifacts
- arrival-path contributor extraction for selected artifacts
- temporal handling of adjacent unexplored nodes
- focus-mode behavior respecting temporal boundaries

### 10.2 Component tests
Add focused tests for:
- selected turn showing fewer artifacts than full unselected session map when later artifacts exist
- selected prompt behaving like its owning turn’s cumulative cutoff
- selected edited file showing arrival-path context instead of the broad final-session map
- inspector rendering first-seen / built-so-far / arrival labels correctly

### 10.3 Manual validation
Validate on real sessions that:
- early turns no longer leak later files/docs into the map
- selected edited files clearly show believable arrival history
- docs and discovery steps appear when they genuinely contributed to arrival
- the route still feels coherent and useful when selection is cleared back to full session view

## 11. Acceptance criteria

This phase is complete when all of the following are true:

1. Unselected Exploration still shows the full session artifact-first map.
2. Selecting a turn or prompt shows a cumulative built-so-far artifact state through that point.
3. Later files/docs are not shown in that historical turn/prompt state.
4. Selecting an artifact shows a believable arrival-path view centered on how that artifact was reached.
5. The route can explain when key contributing artifacts were first seen.
6. Adjacent unexplored context does not leak earlier than its explored anchor.
7. Path / Influence / Neighborhood remain useful while respecting the temporal slice.
8. Implementation remains graph-first and primarily renderer-side.
9. Tests and manual validation confirm the new behavior.

## 12. Open questions

1. Should turn selection cut off at the end of the turn or optionally at the currently selected action within that turn when action selection exists?
2. In arrival-path view, should downstream effects be hidden by default and only shown through an explicit action?
3. Should the UI expose a simple “return to full session” affordance when the user is in a historical slice, even if clearing selection already does that?
4. If a node has multiple equally plausible upstream arrival chains, should the map show all strong contributors or prefer a reduced explanation-first subset?
5. Should derived first-seen order remain renderer-only for now, or later be promoted into graph metadata once the semantics prove stable?
