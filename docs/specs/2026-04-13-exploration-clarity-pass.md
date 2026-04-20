# Exploration Clarity Pass

Status: In Progress
Date: 2026-04-13
Execution plan: [[docs/exec-plans/pending/2026-04-13-exploration-clarity-pass.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/exec-plans/pending/2026-04-13-session-graph-first-migration.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-visualization-rewrite.md]]

## 1. Problem statement

Ariadne’s Exploration route has crossed the most important architectural threshold:
- the route is graph-first
- framing is modeled truthfully
- the visualization has been rewritten into a path-first exploration workspace
- users can already inspect prompts, tools, docs, files, and framing context in one place

That is a strong base. But the current experience still asks users to do too much interpretation on their own.

Today the route can show the right information, but it does not yet always make the answer obvious quickly enough. In particular:
- the selected path is not always visually explicit enough in the map itself
- users still need to infer some high-value questions from general-purpose interactions
- larger sessions can still feel visually dense or cognitively expensive to parse
- the route explains provenance well, but it can still do more to explain **the short story** behind a selection
- context is available, but it is not yet sliced aggressively enough for the exact question the user is asking

The next problem is therefore **not backend truth** and **not a semantic graph redesign**.

The next problem is **clarity**.

This phase should make the Exploration route better at helping users answer its core questions with minimal effort:
- how did the agent arrive at this edited file?
- what happened after this prompt?
- which docs or instructions influenced this path?
- what was directly explored versus merely nearby context?

The aim is to turn the current Exploration route from a good graph-based observability surface into a more deliberate **question-answering investigation tool**.

## 2. Product framing

### 2.1 What this phase is
This phase is an **Exploration UX refinement pass** focused on:
- topology clarity
- guided question answering
- noise reduction
- faster comprehension

### 2.2 What this phase is not
This phase is not:
- another graph-truth phase
- a graph database phase
- a symbol-graph phase
- a replay stepping phase
- a multi-session comparison phase
- a full graph-canvas reinvention

Those may come later. This phase is about making the current graph-first Exploration route easier and faster to use.

### 2.3 Core product principle
The Exploration route should help the user answer a question in **one or two interactions**, not after manually interpreting a dense map.

That means the UI should do more of the explanatory work directly.

## 3. Current state

### What is already true
- `/sessions/:id/exploration` is graph-first.
- `SessionGraphPayload` is the semantic source of truth.
- the route already supports:
  - framing
  - path view
  - context map
  - inspector
  - Path / Influence focus modes
  - ambient visibility toggle
- observed / ambient / inferred / unavailable states are already modeled and visually distinguished.
- the visualization rewrite already moved the route away from a grouped artifact browser and toward a layered, path-first workspace.

### What is still missing
- the map still relies heavily on grouping, highlighting, and inspector explanation; route continuity is not always visually explicit enough
- the user still needs to know *how* to interrogate the graph instead of being guided by the product
- the route does not yet expose the most valuable questions as first-class interactions
- path, influence, and local context are present, but local context is not yet expressed as a dedicated **Neighborhood** mode
- visual density can still get high on larger sessions, especially when contextual nodes accumulate

## 4. Goals and non-goals

### 4.1 Goals
- Make the selected exploration route more visually obvious in the context map
- Add explicit **Neighborhood** mode alongside the existing Path and Influence modes
- Introduce curated question-oriented actions that help users ask the right thing from the current selection
- Improve the inspector and summaries so they communicate the short story, not only raw provenance
- Add filtering/noise-reduction controls for common clutter sources
- Preserve the graph-first architecture and truthfulness rules established earlier
- Keep the route usable on large-ish sessions by emphasizing relevant subgraphs and reducing background noise

### 4.2 Non-goals
- Replacing the current layout with a radically different navigation model
- Reopening graph contracts unless a tiny, justified contract addition is required
- Full event playback / scrubber in this phase
- Freeform natural-language querying
- Force-directed full-canvas graph exploration as the default mode
- Symbol-level graph or code intelligence expansion

## 5. User questions this phase must improve

### Highest priority
1. **How did the agent arrive at this edited file?**
2. **After this prompt, what did the agent explore?**
3. **Which docs or instructions influenced this path?**
4. **What was directly explored versus merely adjacent?**

### Important supporting question
5. **What should I look at next to understand this investigation?**

This fifth question is what curated actions and summaries should help with.

## 6. UX direction

### 6.1 Guiding idea
The current visualization is already a path-first workspace. This phase should make it more explicitly a **guided investigation surface**.

That means:
- stronger route continuity in the map
- selection-aware question shortcuts
- more aggressive context deemphasis when the user has asked a specific question
- clearer summaries of what the current selection means

### 6.2 Main improvements

#### A. Make topology and continuity clearer
The user should be able to visually follow a path without depending entirely on the inspector.

The best way to improve this now is:
- add connectors or connector-like route continuity cues in the context map
- emphasize the selected route more strongly than background context
- let context remain visible but secondary

#### B. Make question-asking explicit
The product already knows the most valuable questions. The UI should expose them directly.

Examples:
- on a selected turn: “show everything explored after this prompt”
- on a selected file: “show how the agent arrived here”
- on a selected doc/instruction source: “show what this influenced”
- on a selected file: “show nearby unexplored context”

These should be click-driven preset actions, not NL prompting.

#### C. Make local context a first-class lens
The current Path and Influence modes are not enough for all analysis tasks.

A dedicated **Neighborhood** mode should answer:
- what was structurally near this node?
- what adjacent files/docs were one hop away?
- what nearby context did the agent not explore?

#### D. Improve summary quality
The inspector should not only show evidence and relationships. It should also summarize the investigation in a compact, high-signal way.

## 7. Detailed design

### 7.1 Controls and focus modes
The top controls should evolve into a stronger analysis strip.

Required focus modes:
- **Path** — chronology-first
- **Influence** — cause/effect-first
- **Neighborhood** — local context-first

Path should remain the default mode.

The difference between these modes must remain real and behaviorally meaningful.

### 7.2 Neighborhood mode
Neighborhood mode should:
- center the selected node or turn anchor
- emphasize one-hop structural neighbors and direct graph adjacencies
- make unexplored context easier to inspect
- reduce broader route emphasis unless it directly supports local understanding

Neighborhood mode is especially useful when selecting:
- an edited file
- a doc
- an instruction source
- a central explored code file

It should feel like the answer to:
> “what was around this?”

not:
> “what happened over the whole session?”

### 7.3 Connectors / route continuity
The context map should gain more explicit route continuity.

Recommended implementation direction:
- show connectors most strongly for the selected/visible subgraph
- avoid drawing every possible edge at equal strength
- preserve the visual hierarchy:
  - observed = strongest
  - influence/path-selected = emphasized
  - inferred = lighter
  - ambient = dashed/subdued
  - adjacent unexplored = faint/dotted/subordinate

The point is not decorative edges. The point is to make “this led to this” legible in the map itself.

### 7.4 Curated question actions
The UI should expose first-class actions based on the current selection.

#### For a selected turn/prompt
Suggested actions:
- Show everything explored after this prompt
- Show only files eventually edited
- Show docs explored in this turn
- Show only this turn’s subgraph

#### For a selected file
Suggested actions:
- Show how the agent arrived here
- Show upstream docs/instructions
- Show adjacent unexplored files
- Show downstream edits/writes

#### For a selected doc / instruction source
Suggested actions:
- Show what this influenced
- Show downstream reads
- Show downstream edits
- Show explicit-only effects

These can initially be implemented as buttons/chips that apply existing mode + filter + selection combinations.

### 7.5 Filtering and noise reduction
The route should add or strengthen filters for common clutter sources.

Recommended filters/toggles:
- ambient on/off
- inferred on/off
- unexplored neighbors on/off
- only selected subgraph
- only edited path
- docs only / files only if practical and not too noisy

The goal is not to expose every possible filter dimension immediately. The goal is to reduce cognitive load for common analysis tasks.

### 7.6 Summary improvements
The top strip and inspector should better summarize the active question.

Recommended additions:

#### Session-level summary chips
- turns
- searches
- docs read
- files read
- edits
- framing sources
- unavailable framing slots

#### Selection-level summaries
- selected turn: counts by action type and outputs
- selected file: first seen, read/edit frequency, upstream influences, nearby unexplored count
- selected doc/instruction source: observed vs ambient, downstream influenced files, downstream influenced edits

#### Short-story summary sentences
When feasible, the inspector should show compact narrative summaries, for example:
- “Edited after 2 searches, 3 reads, and 1 doc consultation.”
- “This prompt led to 14 actions, 8 files explored, and 1 edit.”
- “This doc was explicitly read and influenced 4 downstream files.”

## 8. Visual grammar

### 8.1 Keep current truthfulness conventions
Observed / ambient / inferred / unavailable distinctions must remain intact.

### 8.2 Strengthen route hierarchy
The selected route should stand out more than it does today.

Recommended emphasis tools:
- stronger connector opacity/weight on the active route
- more aggressive fading of unrelated background nodes
- stronger visual emphasis on edited/written outputs
- tighter collapse or deemphasis of irrelevant prompt/turn anchors in focused states

### 8.3 Keep outputs visually special
Edited/written outputs should remain the clearest destinations in the map.

## 9. Architecture and implementation constraints

### 9.1 Stay graph-first
All new behavior should remain derived from `SessionGraphPayload`.

### 9.2 Prefer renderer-side pure helpers
Any new logic for:
- neighborhood extraction
- curated action application
- connector visibility
- summary derivation
- filters

should live in pure, renderer-side, testable helpers.

### 9.3 Do not deepen transitional layers unnecessarily
Avoid making the old graph-to-exploration compatibility layer more central again.

## 10. Testing strategy

### 10.1 Unit tests
Add tests for:
- Neighborhood mode selection/view-model behavior
- curated question action reducers / handlers
- connector visibility or route-emphasis derivation
- new summary derivations
- filter combinations on representative graph fixtures

### 10.2 Component tests
Add tests for:
- Neighborhood mode activation and expected emphasis
- question action buttons changing the view meaningfully
- ambient/inferred/unexplored toggles reducing visible context correctly
- selected edited file showing clearer arrival-path context

### 10.3 Manual validation
Validate on real sessions that:
- connectors improve clarity rather than add noise
- Neighborhood mode answers a distinct question from Path and Influence
- question actions reduce interaction effort
- large-session readability improves

## 11. Acceptance criteria

This clarity pass is complete when all of the following are true:

1. The context map more clearly shows route continuity for the active selection.
2. Neighborhood mode exists and is behaviorally distinct from Path and Influence.
3. The route exposes curated question-oriented actions for common analysis tasks.
4. The inspector and top strip provide stronger summaries with less interpretation burden.
5. Noise-reduction controls materially improve readability on larger sessions.
6. The route remains graph-first and truthful.
7. Tests cover the new view-model logic and key interactions.
8. Manual validation confirms improved readability and question-answering speed.

## 12. Open questions

- Should connectors be always visible for the selected subgraph only, or lightly visible for the broader visible graph too?
- Which curated actions belong in the top strip vs the inspector vs inline with the current selection?
- How many filters can be exposed before the controls themselves become clutter?
- Should “only selected subgraph” be a visible toggle or an implied behavior of certain actions/modes?
