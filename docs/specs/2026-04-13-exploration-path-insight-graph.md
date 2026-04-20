# Exploration Path & Insight Graph — explicit relationship view for the current selection

Status: Draft
Date: 2026-04-13
Execution plan: [[docs/exec-plans/pending/2026-04-13-exploration-path-insight-graph.md]]
Related specs and plans:
- [[docs/specs/2026-04-10-session-exploration-graph.md]]
- [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
- [[docs/specs/2026-04-13-exploration-temporal-history.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-clarity-pass.md]]
- [[docs/exec-plans/pending/2026-04-13-exploration-temporal-history.md]]

## 1. Problem statement

Ariadne’s Exploration route now answers much more than it did originally:
- the route is graph-first
- the left pane owns the narrative spine
- the middle pane is artifact-first by default
- temporal history lets turns/prompts show “built so far” and artifacts show “arrival path”
- the inspector explains evidence, provenance, and selected-node summaries

This is a strong foundation. But one important gap still remains in the middle pane:

> the route can explain relationships, but it does not yet **show** them explicitly enough.

Today the middle pane is still best at:
- scanning explored artifacts
- seeing grouped context
- reading a historically truthful snapshot

It is still weaker at:
- showing the **main route** to the current selection
- distinguishing the **primary path** from secondary contributors
- showing what **caused** the selected file/doc/output
- showing what the selection **caused downstream**
- surfacing **references and relationships among already explored artifacts** in a way the user can visually follow

For example, when a user selects a file, they should be able to quickly understand:
- which prompt or turn kicked off the path
- which searches and discovery steps mattered most
- which docs or instruction sources influenced the route
- which already-read files reference or are referenced by this file
- what edits or writes happened downstream from this selection

The current artifact-first map and inspector can partially answer those questions, but the user still needs to do too much interpretation.

The next step is therefore not another truth-model phase and not a replay phase.

The next step is to add an explicit **Path & Insight Graph** view inside the middle pane:
- keep the current map for scanning and overview
- add a second graph view for visualizing actual relationships with arrows and topology
- make that graph view selection-first, insight-first, and explanation-first

This should turn the middle pane from “artifact map with highlighting” into a place where the user can also directly see:
- how we got here
- what mattered most
- what this affected
- what related explored files/docs connect structurally to the current path

## 2. Product framing

### 2.1 What this phase is
This phase adds a second middle-pane visualization mode:
- **Map** — the current artifact-first context map for scanning and overview
- **Graph** — a more explicit relationship/path view for the current selection

It also adds richer selection-level insights:
- primary path vs secondary contributors
- upstream causes vs downstream effects
- related explored references among already-read files/docs
- clearer ranking/summaries of what mattered

### 2.2 What this phase is not
This phase is not:
- a graph database project
- a full free-pan canvas / generic graph explorer
- a replay or scrubber phase
- a symbol-level graph phase
- a multi-session comparison phase

### 2.3 Why this is the next logical step
Temporal history solved historical truthfulness.

The remaining gap is **visual explanation quality**.

The route already knows enough to answer the user’s core questions; the next task is to make those answers more visible and more direct.

## 3. Current state

### 3.1 What is already true
- the Exploration route is graph-first
- the left pane already provides chronological narrative and turn/action context
- the current middle pane already supports:
  - artifact-first baseline
  - Path / Influence / Neighborhood focus modes
  - built-so-far turn/prompt slices
  - arrival-path artifact slices
- the inspector already exposes provenance, how-it-was-reached, and what-followed summaries
- graph payloads already contain meaningful relationship kinds relevant for a graph view:
  - `prompted`
  - `invoked_tool`
  - `searched_for`
  - `read`
  - `edited`
  - `wrote`
  - `linked_to`
  - `imports`
  - `influenced_by`
  - `constrained_by`
  - `adjacent_unexplored`

### 3.2 What is still missing
- the middle pane does not yet have a real relationship-graph rendering mode with explicit arrows/connectors as primary content
- users still rely too much on inspector prose to infer the actual route
- the UI does not yet clearly rank path elements into:
  - primary route
  - supporting contributors
  - structural references
  - downstream effects
- references among already explored artifacts are not yet surfaced strongly enough in the main visualization
- there is no dedicated graph mode in the middle-pane header that says “show me the topology, not just the grouped artifacts”

## 4. Goals and non-goals

### 4.1 Goals
- Add a middle-pane toggle/tab so users can switch between the current **Map** view and a new **Graph** view
- Keep the current Map view as the default overview/scanning surface
- Make the new Graph view explicitly visualize relationships and direction with arrows/connectors
- Optimize the Graph view for the current selection, not for showing the entire session graph equally
- Distinguish:
  - primary path
  - secondary contributors
  - structural references among explored artifacts
  - downstream effects
- Show “what caused this?” and “what did this cause?” more directly for files/docs/outputs
- Surface relationships such as imports/links/references among already explored files/docs when they materially explain the selected path
- Keep temporal-history slicing intact so Graph view remains historically truthful
- Keep observed / ambient / inferred / unavailable distinctions visually clear

### 4.2 Non-goals
- Replacing the current Map view with Graph view entirely
- Making the graph view a generic force-directed hairball
- Showing every session node and edge with equal prominence
- Reopening backend graph semantics unless a tiny renderer-support addition is absolutely required
- Building symbol-level references in this phase

## 5. User questions this phase must answer better

### Highest priority
1. **How did the agent arrive at this file/doc/output?**
2. **What was the main route, not just everything nearby?**
3. **Which docs, searches, prompts, and files mattered most to this path?**
4. **What did this node influence or cause downstream?**
5. **Which already explored files/docs reference this node or are referenced by it?**

### Important supporting questions
6. **Which contributors are primary vs secondary?**
7. **Which relationships are observed exploration vs structural repo context?**
8. **How should I visually read the selected path without relying only on inspector text?**

## 6. Core product model

### 6.1 Two middle-pane modes
The middle pane should have two explicit visualization modes in its header:

#### Map
- existing artifact-first scanning view
- best for overview, inventory, and neighborhood scanning
- remains the default mode on first load

#### Graph
- new relationship-first view
- best for route explanation and causal understanding
- explicitly draws arrows/connectors and shows topology

The user should not have to choose between “overview” and “explanation” globally. The middle pane should support both.

### 6.2 Graph view is selection-first
Graph view should be most useful when something is selected.

It should not aim to show the entire session graph in full richness by default. Instead it should show a reduced, selection-centered explanation subgraph.

If there is no meaningful selection, Graph view may either:
- show a simplified session-level topology, or
- present a gentle empty/low-detail state that invites selection

The important rule is:
> Graph view is for explaining the current question, not dumping the whole graph.

### 6.3 Primary path, supporting contributors, structural references, downstream effects
Graph view should classify visible nodes/edges into conceptual roles.

#### Primary path
The strongest route explaining the current selection.

Examples:
- selected edited file → prompt → search → doc → file read → selected file → edit
- selected prompt → prompt → turn activity → docs/files reached → outputs

#### Supporting contributors
Important nodes that influenced the path but are not the single route spine.

Examples:
- a second doc read that informed the change
- an instruction source that constrained the implementation
- a supporting source file read before the final edit

#### Structural references
Relationships among already explored artifacts that help explain why the path makes sense.

Examples:
- an explored source file imports the selected file
- an explored doc links to a selected source file
- a selected file references another already-read file

These should be clearly differentiated from directly observed replay actions.

#### Downstream effects
Nodes or effects caused by the selected node or selected path.

Examples:
- a read doc influenced an edited file
- a selected file was later edited or written into output
- a prompt eventually led to particular outputs

## 7. Detailed design

### 7.1 Middle-pane header changes
The middle-pane header should support a new view toggle/tab, such as:
- `Map`
- `Graph`

This toggle should:
- live within the middle pane, not as a global route-mode switch
- preserve current selection when switching modes
- preserve current temporal/history slice semantics
- make it obvious that the user is changing visualization style, not route semantics

### 7.2 Graph-view layout direction
Graph view should be readable, structured, and directional.

Recommended default strategy:
- use a layered left-to-right or top-to-bottom directional layout
- keep arrows/connectors explicit
- center or emphasize the selected node/path rather than distributing all nodes evenly
- sort or group nodes in a way that respects the current historical slice

Strong candidates:
- selected artifact centered, upstream causes to the left, downstream effects to the right
- selected prompt/turn anchored left, downstream path and outputs flowing right
- supporting contributors grouped around the route spine rather than mixed into it equally

### 7.3 Graph-view behavior by selection type

#### No selection
Graph view may show a reduced session-level topology or a selection prompt, but it should avoid becoming a noisy graph dump.

Preferred behavior:
- show a simplified, low-density artifact relationship view, or
- show “Select a turn, prompt, doc, or file to inspect the path graph” if that is the clearest product behavior

#### Selected turn or prompt
Graph view should show:
- the selected turn/prompt as the path anchor
- the strongest downstream path through searches, docs, files, and outputs
- supporting contributors that materially shaped the turn’s outcome
- temporal-history cutoff preserved so later artifacts do not appear

This should answer:
> after this prompt, what path actually formed?

#### Selected file/doc/output
Graph view should show:
- the selected node as the focal point
- upstream route spine explaining arrival
- key supporting contributors
- structural references among already explored artifacts where relevant
- downstream effects if they are meaningful and not overwhelming

This should answer:
> how did we get here, and what did this affect?

#### Selected framing/instruction node
Graph view should show:
- the selected framing source
- downstream affected docs/files/outputs
- only minimal path scaffolding where it helps explain influence

### 7.4 Structural references among explored artifacts
This is an important part of the insight layer.

When both endpoints are already visible in the current historical slice, the Graph view should be able to surface structural relationships such as:
- `imports`
- `linked_to`
- possibly `belongs_to` where helpful

These relationships should be visually distinct from directly observed exploration actions.

The goal is not to imply that the agent explicitly followed every structural edge. The goal is to help the user see:
- this file was already explored
- and it structurally references the selected file
- so this is part of the local explanation context

### 7.5 Ranking and suppression
Not every visible node should be equally prominent.

Graph view should rank or suppress nodes so that the selected question remains readable.

Recommended hierarchy:
- selected node / route spine = strongest
- high-confidence upstream contributors = strong
- supporting contributors = moderate
- structural reference context = secondary
- ambient/inferred/unexplored nodes = subdued
- unrelated visible background = suppressed or omitted entirely

This is the key to preventing the graph from becoming a hairball.

### 7.6 Inspector and summary alignment
The inspector should become more graph-aware when Graph mode is active.

Examples of useful summaries:
- “Primary arrival path: Prompt → bash search → README.md → commands.ts → selected file.”
- “Supporting contributors: `PLAN.md`, `ipc-commands.ts`.”
- “Related explored references: `commands.ts` imports `session-types.ts`.”
- “Downstream effects: later edit to `commands.ts` and write of spec document.”

The inspector should explain not just raw evidence, but why each visible relationship is present in the graph view.

### 7.7 Relationship legend / visual grammar
Graph view should have a clear visual grammar.

Recommended distinctions:
- observed exploration edges = strong solid arrows
- primary path edges = highest emphasis
- supporting contributor edges = medium emphasis
- structural reference edges (`imports`, `linked_to`) = distinct color and/or lighter treatment
- ambient/inferred edges = dashed or muted
- downstream effect edges = visually directional and distinct from upstream arrival edges

### 7.8 Temporal-history compatibility
Graph view must respect the existing temporal-history semantics.

That means:
- selected turn/prompt graph = built-so-far only
- selected artifact graph = arrival-path explanation, not final-session leakage
- structural references should only appear when their endpoint nodes are already valid in the current historical slice

## 8. Error handling and failure modes

- If there is no meaningful reduced graph for the current selection, Graph view should prefer a small, honest graph or a helpful empty state rather than fabricating links.
- If structural references create too much noise, the view should suppress weaker references rather than show everything.
- If no selected node exists and the session-level graph is too broad, prefer an invitation to select something instead of rendering a low-value dense graph.
- If ranking cannot confidently distinguish primary from secondary contributors in a given case, the UI should downgrade claims and show a simpler “related contributors” grouping.

## 9. Security and safety considerations

No new security surface is introduced.

This remains:
- renderer-side first
- read-only
- graph-first
- truthful about observed vs ambient vs inferred vs structural context

## 10. Testing strategy

### 10.1 Unit tests
Add or update pure-function tests for:
- selection-centered explanation subgraph derivation
- ranking of primary path vs supporting contributors
- inclusion of structural references only when both endpoints are visible in the current historical slice
- suppression of unrelated nodes in Graph view
- graph-view compatibility with built-so-far and arrival-path temporal semantics

### 10.2 Component tests
Add focused tests for:
- middle-pane Map / Graph toggle behavior
- switching modes without losing selection
- selected file/doc/prompt producing a graph view with explicit relationship structure
- inspector summaries changing appropriately when Graph mode is active
- structural reference edges being visually differentiated from observed exploration edges

### 10.3 Manual validation
Validate on real sessions that:
- Graph view is more useful than Map view for “how did we get here?”
- Map view remains the better overview/scanning surface
- Graph view clearly shows primary route vs secondary contributors
- explored structural references are helpful rather than misleading
- no obvious future-leak or relationship-overclaim is introduced

## 11. Implementation checklist
- [ ] Add a middle-pane Map / Graph mode toggle in the header
- [ ] Preserve selection, focus mode, and temporal-history semantics when switching modes
- [ ] Introduce a renderer-side explanation-subgraph / insight derivation helper
- [ ] Rank visible graph content into primary path, supporting contributors, structural references, and downstream effects
- [ ] Implement Graph view rendering with explicit arrows/connectors
- [ ] Keep Graph view selection-first and reduced rather than full-session-by-default
- [ ] Surface structural references among already explored artifacts where they materially explain the selected path
- [ ] Update inspector summaries to align with graph-mode explanations
- [ ] Add tests for graph-mode derivation, ranking, and rendering behavior
- [ ] Validate on real sessions and document any deferred follow-ups

## 12. Open questions

1. In Graph mode with no selection, should the route show a small session topology or an explicit “select something” empty state?
2. Should downstream effects be shown by default for selected artifacts, or only when there are few enough to remain readable?
3. Should structural reference edges be always visible when valid, or hidden behind a lightweight “show references” toggle if they add noise?
4. When multiple candidate upstream routes exist, should Graph view show one ranked primary route plus grouped contributors, or multiple parallel routes at equal weight?
5. Should the Graph mode eventually become the default when a selection is active, or should it remain an explicit opt-in visualization?
