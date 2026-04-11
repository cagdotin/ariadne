# Session Exploration Graph

Status: Draft
Date: 2026-04-10
Execution plan: [[docs/exec-plans/pending/2026-04-10-session-exploration-graph.md]]

## 1. Problem statement

Ariadne currently shows session replay, traces, and aggregate file analytics, but it does not show **how an agent explored a codebase** during a session.

Today a user can answer questions such as:
- what happened in a session
- which tools were used
- which files were touched in aggregate

But Ariadne cannot yet answer the more diagnostic questions that motivated this work:
- after a specific user prompt, which files and docs did the agent explore
- how the agent arrived at editing a file
- which documentation influenced later code exploration
- which nearby files or docs were structurally adjacent but not explored
- how the exploration path unfolded over time across prompts, reads, searches, and edits

This feature adds a new **Exploration** view under session detail that combines:
- a **causal path/timeline** of exploration events
- a **session-scoped graph** of files, docs, doc sections, and discovery events
- a lightweight **repo-neighborhood overlay** showing one-hop related nodes that were available but not explored

The intent is not to replicate a full GitNexus-style code intelligence engine in v1. The intent is to give Ariadne a trustworthy, useful first model of **agent exploration observability**.

## 2. Goals and non-goals

### 2.1 Goals
- Add a new session-detail route at `/sessions/:id/exploration`
- Show how a session traversed the repo as a combination of **chronological path** and **related-graph context**
- Attribute exploration primarily to **conversation turns** while still allowing selection of individual user messages and tool events
- Model exploration from session replay data, including:
  - user prompts / turns
  - discovery commands (`rg`, `find`, `ls`, and similar bash-driven discovery)
  - `read`, `edit`, and `write`
  - doc reads and doc-derived links
  - failed or dead-end discovery where recoverable
- Build a lightweight **file/doc-level** repo graph in v1, with an explicit path to richer symbol-aware exploration later
- Parse markdown and related docs using reliable signals first:
  - markdown links
  - wikilinks like `[[filename]]`
  - heading/section structure
  - explicit file-path references
- Show one-hop muted neighbors to make visible what was adjacent but not explored
- Encode exploration questions into the UI through click/selection behavior and curated actions rather than freeform NL querying in v1
- Design the data model so future phases can support:
  - richer symbol resolution
  - cross-session comparisons
  - snapshot-aware historical reconstruction

### 2.2 Non-goals
- Building a full GitNexus-scale symbol/call graph in v1
- Perfect historical reconstruction of repo state for old sessions
- Freeform natural-language querying in the Exploration UI
- Deep heuristic symbol mention extraction from plain prose in v1
- Multi-session comparison UI in the first implementation
- A whole-repo graph as the default visualization
- Replacing the current Conversation or Traces surfaces

## 3. System context

### Affected runtime surfaces
- `src/pages/session-detail-layout.tsx` — session-detail route header and navigation behavior
- `src/pages/session-detail-context.tsx` — shared session header + entries context
- `src/router.tsx` — new `/sessions/:id/exploration` route
- `backend/analytics/replay-loader.ts` — source of raw session entries
- `backend/analytics/session-parser.ts` — current summary parsing, useful for context but too coarse for exploration attribution
- `contracts/ipc-commands.ts` — preload/backend command contract additions
- `src/api/*` + `electron/preload/*` + `electron/main/ipc-router.ts` — typed transport wiring for exploration payloads

### New subsystem shape for v1
This feature should add a new exploration-specific path without disturbing existing analytics and replay flows.

Recommended structure:
- `contracts/exploration/*` — typed exploration payloads
- `backend/analytics/exploration/*` or `backend/exploration/*` — derivation + lightweight graph building + cache
- `src/api/exploration.ts` — renderer fetch wrapper with Zod validation
- `src/components/exploration/*` — timeline/path, graph, inspector, filters
- `src/pages/session-detail-exploration.tsx` — page component

The backend should expose one exploration-focused command that returns the derived payload for a session, rather than forcing the renderer to reconstruct graph logic from raw replay entries.

### Navigation and route behavior
A new session-detail child route should be added:
- `/sessions/:id/exploration`

Navigation intent for v1:
- from Conversation, the header exposes quick actions for **Traces** and **Exploration**
- from Exploration, the header shows a **Conversation** back action and does **not** show the Traces action
- Traces remains its own route and is not replaced by Exploration

This keeps Exploration parallel to Traces while matching the user’s desired route affordance.

## 4. Conventions and style

### Product framing
This feature is about **agent exploration observability**, not generic repo graph visualization.

When choosing between visual flourish and causal clarity, prefer:
- explicit provenance
- confidence signaling
- click-driven explanation
- graceful degradation when static repo links are unavailable

### Confidence-first modeling
Exploration links must distinguish between:
- **explicit** evidence from session replay or markdown structure
- **inferred** evidence from repo relationships or event sequencing

The UI should visually distinguish high-confidence explored edges from inferred or merely adjacent ones.

### Reuse existing UI patterns
Use Ariadne’s current session-detail and traces patterns as references:
- resizable panels
- selection-driven detail panes
- route-local view composition
- typed backend payloads validated in the renderer

### Delivery approach
Implementation should follow **test-driven development** for all new exploration behavior.

That means:
- define or extend typed contracts first
- add focused tests for the new behavior before or alongside implementation
- prefer small, verifiable milestones over a single large UI merge
- treat the backend-derived exploration payload as the primary unit under test
- add UI interaction tests for the key user questions, not just snapshot rendering

This work is also expected to support **task decomposition and parallel implementation**. The contracts and subsystem boundaries must therefore be explicit enough that separate agents can work independently on:
- contracts + backend derivation
- static repo-context graph derivation
- renderer API + route wiring
- Exploration UI components

### Data before UI
If a relationship cannot be explained confidently, the system should prefer:
- showing the event without a causal edge
- labeling it as unresolved or opaque
- omitting speculative linkage

That is better than presenting a confident but misleading traversal story.

## 5. Domain model

### 5.1 Two-layer model
The v1 exploration model has two layers:

1. **Dynamic exploration layer** — what the agent actually did in the session
2. **Static repo-context layer** — which files/docs/sections were structurally related in the current project tree

The Exploration view overlays the dynamic layer on top of a lightweight static layer.

### 5.2 Core entities

#### Exploration turn
A conversation turn is the primary attribution unit in v1.

A turn begins with a user message and includes the following assistant/tool activity until the next user message. This is the unit used to answer:
- “after this prompt, what was explored?”
- “which prompt led to this file?”

Individual user messages still remain selectable so the UI can explain prompt-specific context inside the turn.

#### Exploration event
An exploration event is a time-ordered action or observation derived from replay data.

Important event categories in v1:
- user message
- turn boundary
- assistant response block when useful for attribution
- discovery command
- file read
- file edit
- file write
- doc read
- unresolved/opaque tool activity
- failed or dead-end discovery event when recoverable

The event model exists to explain chronology and causality.

#### Exploration artifact
An artifact is a repo object that can be explored or related.

V1 artifact classes:
- source file
- markdown doc file
- markdown section
- discovery query / command node

V1 intentionally stops short of full symbol-level graph nodes.

#### Exploration relation
An exploration relation is a typed edge connecting events, turns, and artifacts.

Important relation families:
- dynamic: prompt triggered, command led to read, read preceded edit, doc influenced later file read
- static: doc links to doc, doc references file, file imports file, file contains section
- contextual: adjacent but unexplored one-hop neighbor

### 5.3 Evidence classes
Each derived edge or highlight should carry evidence metadata so the UI can explain why it exists.

Evidence classes:
- **explicit session evidence** — directly present in session replay
- **explicit doc evidence** — markdown link, wikilink, heading containment, explicit file path mention
- **structural code evidence** — reliable file-level import/dependency link
- **sequencing inference** — event ordering strongly suggests causality but is not explicit
- **adjacency only** — structurally nearby, not actually explored

## 6. Detailed design

### 6.1 v1 UX model
The Exploration page should use a **split view**.

Recommended primary layout:
- **left panel** — chronological exploration path / timeline grouped by turn
- **right panel** — session-scoped graph with explored nodes emphasized and one-hop unexplored neighbors muted
- **selection detail surface** — selection-aware inspector or detail pane using existing session-detail interaction patterns

The left and right panels answer different questions:
- path/timeline answers **how the exploration unfolded**
- graph answers **what the exploration touched and what it was near**

The page should be useful even when only the left panel has high-confidence information.

### 6.2 What the left panel should explain
The path/timeline panel should make visible:
- conversation turns
- discovery commands and file/doc reads in chronological order
- edits and writes later in the chain
- moments where the agent asked the user a follow-up question and continued after the answer
- local causal breadcrumbs such as “read A before reading B” and “read doc C before editing file D” where evidence supports it

This panel is the main answer to:
- “how did the agent arrive here?”
- “what was explored first?”
- “what happened after this prompt?”

### 6.3 What the right panel should explain
The graph panel should show a **session-scoped subgraph**, not the entire repo.

The graph starts from:
- explored source files
- explored docs
- explored doc sections
- discovery nodes that visibly connect turns to artifacts

Then it augments with **one-hop neighbors only**, rendered as muted context.

This makes visible:
- explored nodes
- directly related but unexplored nodes
- doc-to-code relationships
- code-to-code relationships at the file level

The graph is not intended to be a raw force-directed hairball. It should be constrained to the session-relevant neighborhood.

### 6.4 Repo graph scope in v1
V1 should use a lightweight file/doc-level graph built lazily from the session’s project root and cached for reuse.

Scope of the v1 repo graph:
- file-to-file import/dependency links where reliable at the file level
- markdown file structure and heading/section containment
- markdown links between docs
- wikilinks like `[[filename]]`
- explicit path references from docs to source files

V1 should not attempt broad plain-prose filename or symbol extraction beyond these strong signals.

### 6.5 Caching model
For v1, use a **lazy build + cache** strategy.

Desired behavior:
- when Exploration is opened for a session, Ariadne derives the exploration payload from raw session replay
- if static repo context is missing for that project, Ariadne builds the lightweight project graph on demand
- derived exploration payloads should be cached by session so reopening the same session does not require full recomputation

V1 may use a backend-managed cache keyed by session identity and source freshness. Exact storage details may stay simple as long as the user-visible behavior is fast and repeatable.

### 6.6 Curated question-answering in the UI
The UI should support question-answering through **selection and curated actions**, not freeform prompts.

Examples of acceptable v1 interactions:
- click a turn to highlight everything explored because of it
- click a file to show why it was explored and which earlier events led to it
- click a doc or section to highlight downstream reads influenced by it
- click an unexplored neighbor to show why it appeared as adjacent context
- use preset actions such as:
  - why was this file explored
  - which prompt led here
  - what docs influenced this
  - what neighbors were not explored

These interactions should be encoded from the exploration data model, not implemented as ad hoc UI-only logic.

### 6.7 Historical fidelity and snapshots
V1 is allowed to derive static repo context from the **current working tree** for the session’s project root.

This is a known limitation. Historical sessions may refer to a repo state that no longer matches the current tree.

The v1 design must preserve a path to future snapshot support by keeping the data model explicit about:
- session-time replay evidence
- current-tree structural augmentation
- confidence/provenance for each edge

That way, future snapshot-aware reconstruction can replace the static augmentation layer without rewriting the Exploration UI contract.

## 7. Error handling and failure modes

### 7.1 Missing or weak static graph context
If the project graph cannot be built, Exploration should still render the chronological path/timeline from session replay.

The user should see a partial but valid exploration story rather than a broken page.

### 7.2 Opaque commands
If a bash command cannot be confidently classified as discovery or mapped to candidate files, it should remain visible as an opaque event without guessed file edges.

### 7.3 Historical drift
If current-tree relationships disagree with the session’s apparent exploration path, Ariadne should favor replay truth and treat the static relationship as contextual only.

### 7.4 Link noise
Low-confidence inferred links should be visually muted, labeled, or omitted. The system should not turn weak guesses into primary graph edges.

### 7.5 Performance fallback
If the graph payload becomes too large, Ariadne should reduce to the session-touched nodes plus the strongest one-hop neighbors rather than attempting to render an unreadable large graph.

## 8. Security and safety considerations

- Ariadne remains read-only with respect to session files and the inspected project tree
- Exploration graph building must not mutate project files or session files
- If shell-based file discovery is used internally for graph building, it must remain bounded to the project root and read-only
- Any future snapshot support should preserve the observer-only invariant

## 9. Testing strategy

### 9.1 Unit tests
- derivation of turns from replay entries
- classification of discovery commands versus opaque commands
- read → read / read → edit / doc → file influence chains where evidence exists
- markdown link, wikilink, heading, and explicit path-reference extraction
- one-hop neighbor selection rules
- confidence/provenance tagging

### 9.2 Integration tests
- backend command returns a stable exploration payload for a known session fixture
- renderer route `/sessions/:id/exploration` loads and renders without errors
- clicking turns, events, files, and docs updates path/graph/inspector coherently
- muted unexplored neighbors appear only one hop away
- Exploration remains functional even when static repo graph derivation fails

### 9.3 UI behavior tests
- selecting a turn highlights the downstream explored artifacts tied to that turn
- selecting a file shows the causal chain that led to it
- selecting a doc or doc section shows downstream linked exploration where evidence exists
- curated question-answering actions update highlighting and detail state correctly
- Exploration route header/navigation behavior matches the intended Conversation / Traces / Exploration affordances

### 9.4 Manual validation
Use a handful of real sessions that include:
- docs-first exploration
- search-driven exploration via `rg` / `find`
- file edits after multiple reads
- follow-up question to the user mid-session

Validate that the page can answer:
- what was explored after this prompt
- how did the agent reach this file
- which docs influenced this edit path

## 10. Implementation checklist
- [ ] Define exploration payload contracts under `contracts/exploration/`
- [ ] Add a backend exploration derivation module from session replay
- [ ] Add lightweight file/doc graph derivation for project roots with lazy cache behavior
- [ ] Expose a typed backend command for session exploration payloads
- [ ] Add renderer API wrapper and validation for exploration payloads
- [ ] Create `/sessions/:id/exploration` route and page
- [ ] Add session-detail navigation behavior for Conversation / Traces / Exploration
- [ ] Build the split-view Exploration UI: path/timeline + graph + selection detail
- [ ] Encode curated question-answering interactions from the data model
- [ ] Distinguish explored versus adjacent-unexplored nodes visually
- [ ] Document known v1 limits around current-tree augmentation and historical drift
- [ ] Add follow-up notes for future symbol graph, comparisons, and snapshot support

## 11. Open questions
- Exact graph rendering library is an implementation decision; the v1 requirement is a clear, interactive session-scoped graph, not a specific visualization stack
- Exact cache persistence strategy may stay simple in v1 if correctness and responsiveness are preserved
- Symbol-aware file internals are intentionally deferred, but the implementation should leave a clean path from file-level edges to later symbol-level augmentation
