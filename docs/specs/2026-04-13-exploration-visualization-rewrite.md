# Exploration Visualization Rewrite

Status: Done
Date: 2026-04-13
Execution plan: [[docs/exec-plans/pending/2026-04-13-exploration-visualization-rewrite.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/exec-plans/pending/2026-04-13-session-graph-first-migration.md]]

## 1. Problem statement

Ariadne’s Exploration route now has the right semantic direction: it is graph-first, provenance-aware, and honest about observed vs ambient vs inferred vs unavailable context. But the current visualization still behaves like a transitional UI.

Today’s Exploration surface is useful, but it still has important limitations:
- the right-hand “graph” is primarily a grouped artifact browser rather than a topology view
- chronology and topology are split, but not yet integrated into one coherent exploration story
- the most valuable user questions still require too much interpretation by the viewer
- observed session path and surrounding repo context are visible, but not visually prioritized enough
- all explored artifacts of the same broad type read too similarly, which weakens causal clarity

The goal of this rewrite is **not** to make the UI look more graph-like for its own sake.

The goal is to make the Exploration route clearly answer:
- what shaped the session before tool use began
- what happened after a given prompt
- how the agent arrived at a specific file or edit
- which docs or instructions influenced the path
- what the agent explored directly vs what was only nearby context

This rewrite should therefore be framed as building a **path-first investigation viewer with a context map**, not a generic graph canvas.

## 2. Product framing

### 2.1 Core product idea
The Exploration route should feel like:
- a readable reconstruction of the agent’s investigation
- a causal explanation surface
- a trustworthy map of explored and adjacent code/doc context

It should not feel like:
- a force-directed hairball
- a static asset inventory
- a repo-intelligence product detached from session behavior

### 2.2 Primary user questions
The rewrite must optimize for the following user questions in this priority order:

1. **How did the agent arrive at this edited file?**
2. **After this prompt, what did the agent explore?**
3. **Which docs or instructions influenced this path?**
4. **What was directly explored vs merely adjacent?**
5. **What happened first, next, and last in this investigation?**

### 2.3 Design principle
The route should combine:
- **A layered directional structure** for readability
- **A path-emphasis strategy** for meaning

In short:
- use a directional/layout model similar to a flow map
- visually privilege the actual observed exploration path
- render inferred and adjacent context as secondary context, not co-equal truth

## 3. Goals and non-goals

### 3.1 Goals
- Rewrite the Exploration visualization so it is visually optimized for causal understanding, not just artifact listing
- Keep the current split-view product shape, but clarify the role of each pane:
  - left = narrative/path view
  - right = context map / topology view
  - inspector = provenance and explanation
- Make the right pane a **path-emphasized layered graph**, not a grouped list of artifacts
- Make selected prompts, files, docs, and framing nodes drive clear upstream/downstream highlighting
- Use the graph-first data model already in place; avoid introducing new competing semantic layers
- Preserve truthfulness around observed vs ambient vs inferred vs unavailable state
- Add compact, useful session and selection summaries so the graph is not doing all the explanatory work alone
- Support a follow-up evolution toward richer topology rendering without redoing product semantics again

### 3.2 Non-goals
- Building a generic graph IDE or full repository intelligence canvas
- Solving symbol-level graph visualization in this phase
- Adding a graph database or persistence layer
- Introducing a large force-directed graph library as the default experience just to look more “graphy”
- Reworking backend graph semantics except where a small contract addition is genuinely required to support truthful visualization
- Freeform natural-language querying in the visualization
- Multi-session comparison UI in this phase

## 4. System context

### Current state to build from
The following are already in place:
- graph-first session loading for `/sessions/:id/exploration`
- `SessionGraphPayload` as the route’s semantic source of truth
- framing nodes and framing inspector support
- graph-to-exploration adapter for compatibility with the current view
- selection + inspector patterns already established in the route

### Relevant existing modules
- `src/pages/session-detail-exploration.tsx` — graph-first route entry
- `src/components/exploration/exploration-view.tsx` — split-view composition
- `src/components/exploration/exploration-timeline.tsx` — current left-pane path rendering
- `src/components/exploration/exploration-graph.tsx` — current right-pane grouped artifact browser to be replaced
- `src/components/exploration/exploration-inspector.tsx` — existing inspector to keep and improve
- `src/components/exploration/exploration-framing.tsx` — current framing strip, likely retained
- `src/lib/graph-to-exploration-adapter.ts` — compatibility adapter currently feeding old Exploration view model

### Architectural direction
This phase should **not** reopen the graph-first migration.

Instead, it should treat graph-first as established and build a better renderer/UI on top of it.

If new renderer-side view models are needed, they should be:
- derived from `SessionGraphPayload`
- pure
- local to the renderer
- explicitly presentation-oriented rather than semantic source-of-truth types

## 5. UX model

### 5.1 High-level page model
The Exploration route should remain a three-part experience:

1. **Top framing + controls strip**
2. **Left path pane**
3. **Right context map pane**
4. **Inspector pane**

The layout can remain resizable and selection-driven, consistent with the existing route patterns.

### 5.2 Role of each surface

#### Framing strip
Explains what shaped the session before exploration:
- cwd
- model/provider changes
- thinking level changes
- explicit instruction sources
- ambient instruction sources
- unavailable system/developer prompt state

#### Path pane
Explains the investigation as a readable story:
- prompt/turn entry points
- discovery actions
- doc/file reads
- edits/writes
- revisits / branching exploration
- dead ends or opaque steps when present

#### Context map pane
Explains the explored neighborhood as a graph-like map:
- explored nodes
- one-hop adjacent context
- structural relationships
- docs-to-code influence context
- where selected path segments live in the repo neighborhood

#### Inspector
Explains why selected items exist and matter:
- provenance/evidence
- availability/confidence
- upstream influences
- downstream effects
- summary counts

## 6. Detailed design

### 6.1 Hybrid visualization strategy
The right-pane rewrite should combine two design choices:

#### A. Layered directional layout
The visualization should be laid out in semantic lanes or columns.

Recommended lane order:
1. **Framing / instructions**
2. **Prompts / turns**
3. **Discovery / search**
4. **Docs and files explored**
5. **Edited / written outputs**
6. **Muted adjacent context**

This provides the readability benefits of a flow diagram.

#### B. Path emphasis
Within that layout, the actual session traversal path should be the most visually dominant thing.

That means:
- observed replay path = brightest and thickest
- selected path = strongest emphasis
- inferred relationships = secondary
- ambient context = subdued but legible
- unexplored neighbors = faint and clearly context-only

This provides the explanatory benefits of a path viewer.

### 6.2 Default viewing mode
The default mode should be the hybrid above: **path-emphasized layered graph**.

This should be the first thing users see because it best answers:
- what happened
- how the agent got here
- what mattered

### 6.3 Optional focus modes
The visualization should support explicit focus modes, but they can be implemented progressively.

Recommended focus modes:

#### Path
- emphasizes chronology and the observed exploration route
- best for “what happened after this prompt?”

#### Influence
- emphasizes upstream/downstream cause around a selected node
- best for “how did the agent arrive at this file?” and “what did this doc influence?”

#### Neighborhood
- emphasizes one-hop repo context around the current selection
- best for “what was nearby but unexplored?”

V1 of the rewrite may ship with:
- Path mode as default
- Influence mode if feasible
- Neighborhood mode as a lightweight variation or later enhancement

### 6.4 Top strip and summary signals
A small control and summary strip should sit above the main split.

Recommended content:
- focus mode toggle: `Path | Influence | Neighborhood`
- summary chips such as:
  - turns
  - searches
  - docs read
  - files read
  - files edited
  - framing sources
  - ambient sources
  - unavailable framing slots
- optional toggle chips for:
  - show ambient context
  - show unexplored neighbors
  - show inferred edges

This makes the route more informative even before the user interacts deeply.

### 6.5 Path pane rewrite
The left pane should evolve from a simple grouped timeline into a more intentional **exploration path** view.

Recommended behaviors:
- group by turn
- keep each turn collapsible
- make the user prompt the visible anchor
- render downstream actions with clear sequence
- distinguish action kinds visually:
  - search / discovery
  - doc read
  - file read
  - edit/write
  - failed or opaque action
- visually mark revisits to the same file/doc
- visually mark actions that directly precede edits

Recommended interaction:
- click a turn → highlight all downstream activity for that turn
- click an event → highlight local path neighborhood and corresponding map nodes
- click an edit/write → highlight upstream reads/docs/searches in the map

The path pane should feel like the readable narrative spine of the route.

### 6.6 Context map rewrite
The current grouped artifact browser should be replaced by a graph-aware context map.

#### What it should show
- graph nodes placed in semantic lanes
- edges drawn between relevant nodes
- actual observed path visually emphasized
- one-hop adjacent context muted and optionally toggleable
- selected node’s causal path or neighborhood highlighted

#### What it should not try to do initially
- render the whole repo
- optimize for arbitrary pan-and-zoom exploration first
- become a visually dense freeform force graph

#### Rendering preference
Prefer a constrained, intentional rendering approach over a generic physics simulation.

Acceptable implementations include:
- SVG-based lane graph
- custom positioned React layout with drawn connectors
- lightweight graph layout helper with manual lane placement

Do **not** make a heavy graph library the default implementation unless it clearly helps preserve readability.

### 6.7 Visual grammar

#### Node families
Use shape + icon + color, not color alone.

Recommended treatment:
- **Framing / instruction nodes** — amber/gold family, subtle emphasis, pinned lane
- **Prompt / turn nodes** — rounded pill / chat-like treatment, purple or blue family
- **Discovery / search nodes** — terminal or search icon, blue/amber family
- **Doc nodes** — document icon, cyan family
- **Code file nodes** — file/code icon, green or slate family
- **Edited/written outputs** — stronger emphasis, accent glow or stronger border
- **Unavailable nodes** — hollow / ghosted / muted, clearly labeled as unavailable

#### Edge families
- **Observed replay** — solid, strongest opacity
- **Inferred temporal** — thinner, lower opacity
- **Ambient context** — dashed, secondary opacity
- **Adjacent unexplored** — faint dotted/dashed context
- **Selection-emphasized path** — thicker / brighter accent treatment

#### Selection styling
When something is selected:
- selected node remains fully saturated
- immediate upstream/downstream path stays visible and emphasized
- unrelated context fades
- ambient/inferred edges remain visible enough to explain context, but subordinate

### 6.8 Selection behaviors to optimize for

#### Select an edited file
Must clearly answer:
- what led here?

Desired response:
- highlight upstream searches
- highlight prior docs/files read
- highlight instruction/doc influences where present
- show the sequence in the path pane
- show why each upstream node/edge exists in the inspector

#### Select a prompt / turn
Must clearly answer:
- what happened after this?

Desired response:
- highlight downstream exploration within that turn
- show first-seen files/docs
- summarize counts in inspector

#### Select a doc / AGENTS.md / framing node
Must clearly answer:
- what did this influence?

Desired response:
- highlight downstream file reads or edits
- distinguish explicit vs ambient vs inferred influence
- show unavailable state honestly when applicable

### 6.9 Selection summaries
The inspector should gain stronger summary sections depending on selection.

Recommended additions:

#### For a selected turn
- files explored count
- docs explored count
- searches run count
- edits/writes count
- unresolved/opaque count

#### For a selected file
- first seen in turn
- how many related reads/edits/writes
- upstream docs/instructions
- whether it was explored or only adjacent

#### For a selected doc/instruction source
- observed vs ambient
- downstream files influenced
- downstream edits influenced if derivable

### 6.10 Replay stepping / scrubber
A simple replay stepper is desirable, but not required in the first slice.

If included, it should be modest and deterministic:
- previous / next event
- highlight the current frontier in the map
- keep the path pane synced

This should be treated as a nice enhancement after the core rewrite is readable.

## 7. Implementation strategy

### 7.1 Use graph-native renderer-side view models
This rewrite should prefer graph-native renderer helpers over expanding the old exploration projection indefinitely.

Recommended approach:
- keep `SessionGraphPayload` as source of truth
- derive dedicated presentation helpers for:
  - lane assignment
  - visible path extraction
  - selection subgraph extraction
  - node/edge styling state
  - summary counts

These helpers should be renderer-side pure functions and testable without DOM.

### 7.2 Keep compatibility layers narrow
The current `graph-to-exploration-adapter` can continue to exist while parts of the old UI remain, but the rewrite should avoid deepening dependence on it.

Preferred direction:
- path pane and context map should progressively become graph-native
- the adapter remains only where compatibility is temporarily needed

### 7.3 Suggested new renderer modules
Potential additions:
- `src/components/exploration/graph-layout/*`
- `src/components/exploration/exploration-map.tsx`
- `src/components/exploration/exploration-controls.tsx`
- `src/components/exploration/exploration-summaries.tsx`
- `src/components/exploration/exploration-path.tsx`
- `src/lib/exploration-graph-view-model.ts`
- `src/lib/exploration-selection-graph.ts`

Exact filenames can vary, but responsibilities should be explicit and testable.

## 8. Testing strategy

### 8.1 Unit tests
Add pure-function tests for:
- lane assignment
- graph-native selection highlighting
- path extraction
- summary derivation
- visible node/edge filtering by focus mode
- styling state derivation for observed / ambient / inferred / unavailable

### 8.2 Component tests
Add UI tests for:
- default path mode rendering
- selecting an edited file highlights upstream path
- selecting a turn highlights downstream exploration
- framing/instruction selection highlights downstream effects
- unexplored neighbors remain visually distinct from explored nodes
- focus mode toggles change emphasis without changing truth

### 8.3 Regression tests
Preserve confidence in:
- framing display
- unavailable prompt handling
- graph-first route loading
- inspector provenance display

## 9. Acceptance criteria

This rewrite is complete when all of the following are true:

1. The right pane is no longer a grouped artifact browser pretending to be a graph.
2. The default visualization is a readable path-emphasized layered graph or equivalent constrained map.
3. Selecting an edited file clearly highlights how the agent arrived there.
4. Selecting a prompt/turn clearly highlights what happened after it.
5. Observed vs ambient vs inferred vs unavailable states are visually distinct.
6. One-hop adjacent context remains available but subordinate.
7. The inspector and summaries make the route understandable without raw replay inspection.
8. Graph-first architecture remains intact; no competing truth model is introduced.
9. Tests cover the core view-model logic and main interactions.

## 10. Open questions

- Should the first rewritten context map be implemented with SVG and explicit lane placement, or with a lightweight layout library?
- Should focus modes ship in the first slice, or should only Path mode ship first with the code structured for later modes?
- Should replay stepping/scrubbing be in this rewrite or deferred until after the map is visually clear?
- Should framing remain a top strip only, or also appear as a pinned lane within the context map?
