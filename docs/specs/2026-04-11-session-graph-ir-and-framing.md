# Session Graph IR and Framing Context

Status: Draft
Date: 2026-04-11
Execution plan: [[docs/exec-plans/pending/2026-04-11-session-graph-ir-and-framing.md]]

## 1. Problem statement

Ariadne’s new Exploration surface established a useful first pass for replay-derived file/doc exploration, but it still does not have a strong enough underlying graph model to explain **why** the agent moved through the repo the way it did.

The current limitation is not primarily visual. The deeper problem is that Ariadne does not yet have a first-class, provenance-aware graph representation for:
- session framing context
- prompts and turns
- tool calls and search/discovery actions
- files, docs, and doc sections
- explicit vs inferred relationships
- observed vs ambient context
- unavailable context that should be shown as missing rather than fabricated

This gap is especially visible around agent framing. Users care not only about what the agent read or edited, but also:
- what instructions framed the session before the first tool call
- whether `AGENTS.md` was explicitly read during the session or only existed as ambient repo guidance
- whether system or developer instructions are actually available in replay data
- which parts of the story are directly observed vs reconstructed vs unknown

Investigation of real pi session JSONL files on this machine established the following:
- session JSONLs currently include useful framing metadata such as `cwd`, `model_change`, `thinking_level_change`, and some custom runtime messages such as `cmux-detected`, `expertise-loaded`, and `track-context-loaded`
- explicit `read` calls to `AGENTS.md` are recoverable from replay data when they happened
- current session JSONLs do **not** appear to persist `role: "system"` or `role: "developer"` messages, nor dedicated `system_prompt` / `developer_prompt` fields

So Ariadne must model framing truthfully:
- show what is explicitly observed
- show what is ambient but reconstructable
- show what is missing or unknown
- never present unavailable hidden prompts as if they were captured facts

This feature introduces a new **session graph IR** (intermediate representation) under `contracts/graph/` and makes it the source of truth for future exploration rendering. The graph is derived in memory on demand when the user opens the Exploration route. No graph database or persistent storage is introduced in this phase.

## 2. Goals and non-goals

### 2.1 Goals
- Define a new first-class graph contract under `contracts/graph/` using Zod-first schemas with exported TypeScript types
- Represent session exploration as a typed property-graph-like payload with:
  - nodes
  - edges
  - evidence/provenance
  - confidence
  - observed vs ambient vs inferred vs unavailable state
- Derive the graph in memory from session replay plus lightweight current-tree augmentation when the user opens `/sessions/:id/exploration`
- Include session framing information in the graph and UI where available, including:
  - session header context like `cwd`
  - model/provider changes
  - thinking level changes
  - relevant custom runtime messages such as `cmux-detected`, `expertise-loaded`, and `track-context-loaded`
  - explicit `AGENTS.md` reads
  - ambient repo instruction sources that can be identified from the current repo tree
- Distinguish clearly between:
  - explicit replay observations
  - ambient framing context
  - inferred temporal/structural relations
  - unavailable or unknown context
- Make the graph contract the new backend truth model for Exploration, even if the UI initially consumes it through an adapter or projection layer
- Add a visible “session framing” concept to Exploration so users can understand what shaped the session before repo traversal
- Preserve Ariadne’s typed backend/preload/renderer boundary with Zod validation in the renderer
- Implement with TDD and preserve room for parallel sub-agents

### 2.2 Non-goals
- Adding a graph database, Neo4j, SQLite graph tables, or any persistent graph storage in this phase
- Claiming to recover hidden system or developer prompt text when it is not actually present in session logs
- Full snapshot-aware historical repo reconstruction in this phase
- Solving cross-session graph comparison UI in this phase
- Full symbol-level graphing in this phase
- Replacing all current exploration UI with a large graph-library-based renderer before the graph truth model is proven
- Fabricating causal edges from weak heuristics when stronger evidence is absent

## 3. System context

### Affected runtime surfaces
- `contracts/sessions/replay.ts` — current replay schema and known replay entry/message kinds
- `backend/analytics/replay-loader.ts` — raw session replay source
- `backend/analytics/exploration/*` — current replay-to-exploration derivation; likely to be refactored to consume graph IR or coexist temporarily
- `contracts/exploration/*` — current exploration payload contracts; may become a projection layer or be incrementally retired
- `contracts/ipc-commands.ts` — preload/backend command contract additions or evolution
- `src/api/exploration.ts` and/or a new `src/api/graph.ts` — Zod-validated renderer API wrapper
- `src/pages/session-detail-exploration.tsx` — Exploration route entry point
- `src/components/exploration/*` — current UI surface that should begin surfacing framing and provenance explicitly

### Existing architecture constraints
Ariadne’s current architecture requires:
- backend derivation in `backend/`
- typed desktop transport through `contracts/` + preload + main-process router
- runtime validation in renderer API wrappers
- read-only treatment of pi session logs

This work should preserve that shape.

### Confirmed replay-data reality
The design must reflect what was verified from real session JSONLs:
- session headers include `cwd`
- replay entries include `model_change` and `thinking_level_change`
- replay entries include message roles `user`, `assistant`, and `toolResult`
- replay entries can include `custom_message` entries such as `cmux-detected`, `expertise-loaded`, and `track-context-loaded`
- explicit tool calls to `read` `AGENTS.md` are observable when present
- system/developer prompt content is not currently persisted in an observable form in session JSONLs on this machine

## 4. Conventions and style

### Truth over completeness
This feature must prefer:
- explicit truth
- uncertainty signaling
- provenance visibility
- omission over invention

If the system prompt is unavailable, the UI should say it is unavailable or unknown. It must not imply that Ariadne saw it.

### Graph contract first
This phase exists to improve graph semantics before graph storage or fancy rendering.

The most important artifact is the typed graph contract. The backend and UI should be organized so future phases can reuse it for:
- richer single-session exploration
- multi-session comparison
- export or persistence later

### Zod-first contracts
All new shared graph contracts must live under a new `contracts/graph/` folder and follow the repository’s standard pattern:
- Zod schema definitions first
- inferred TypeScript types exported next to them
- barrel export from `contracts/graph/index.ts`
- top-level re-export from `contracts/index.ts`

### TDD and parallelization
Implementation should follow test-driven development.

Separate agents should be able to work in parallel once the graph contract is locked, especially for:
- graph contracts
- backend graph derivation
- renderer API wiring
- Exploration UI updates and tests

## 5. Domain model

### 5.1 Session graph as the source of truth
The new session graph is a typed, in-memory property-graph-like payload.

It is not a database model. It is an application-level IR describing:
- the session
- the framing around the session
- the explored artifacts and events
- the evidence behind each graph assertion

The graph should be expressive enough that Exploration becomes a view over the graph rather than the primary model.

### 5.2 Core node families
The graph should support node families such as:
- **session** — the session itself
- **session_framing** — a synthetic grouping/context node for framing sources
- **runtime_context** — `cwd`, model/provider, thinking level, and notable custom runtime context
- **instruction_source** — repo instructions or ambient context sources
- **system_prompt** — represented only when actually available; otherwise modeled as unavailable/unknown if needed by the UI
- **developer_prompt** — same treatment as system prompt
- **agents_doc** — an `AGENTS.md` source, whether explicitly read or ambiently identified
- **user_prompt** — a user message or turn root
- **assistant_turn** — assistant/tool activity grouped under a turn
- **tool_call** — an explicit tool invocation
- **search_query** — a discovery/search action when applicable
- **directory** — optional path-level grouping when useful
- **source_file** — code file
- **doc_file** — markdown or other documentation file
- **doc_section** — heading-level section inside a doc

This list does not require all node kinds to be fully rendered in the first UI pass, but the contract must leave room for them.

### 5.3 Core edge families
The graph should support relation families such as:
- **framed_by** — session or turn framed by context
- **prompted** — prompt leading into activity
- **invoked_tool** — assistant/turn to tool call
- **searched_for** — tool call to search/discovery query
- **read** — tool call or turn to file/doc
- **edited** — tool call or turn to file
- **wrote** — tool call or turn to file
- **discovered** — search/discovery leading to artifact
- **linked_to** — docs/files linked by explicit structure
- **imports** — file-level structural code relation
- **belongs_to** — section to doc, artifact to grouping node
- **influenced_by** — downstream relation with clear evidence or strong inference
- **constrained_by** — activity constrained by framing/instructions
- **adjacent_unexplored** — context node available but not explored

### 5.4 Evidence and provenance
Every node and edge should be explainable through evidence records.

Evidence classes should include categories like:
- **observed_replay** — directly present in replay entries
- **observed_tool_args** — extracted from tool arguments
- **observed_custom_message** — derived from runtime custom messages
- **parsed_markdown_link** — derived from markdown link structure
- **parsed_import** — derived from code import structure
- **ambient_repo_context** — current-tree context that plausibly framed the session but was not explicitly read in replay
- **inferred_temporal** — inferred from replay order/turn structure
- **heuristic** — weaker signal; should be visually distinguished and used sparingly

Each evidence record should be able to point back to a source reference such as:
- replay entry id
- file path
- heading id/path
- tool call id
- custom message type

### 5.5 Availability states
The graph must support truthfully modeling missing framing information.

Important availability states:
- **available_observed** — explicit in replay
- **available_ambient** — reconstructed from known runtime/repo context, but not explicitly read in replay
- **derived_inferred** — inferred from strong sequencing/structure
- **unavailable** — not present in logs and not reconstructable
- **unknown** — theoretically possible but not currently determinable

This is especially important for system/developer prompt handling.

## 6. Detailed design

### 6.1 Contracts
A new `contracts/graph/` package should define the session graph IR.

Recommended contract grouping:
- node schema(s)
- edge schema(s)
- evidence schema(s)
- enums for node kinds, edge kinds, evidence kinds, confidence, and availability state
- top-level `session_graph_payload_schema`

The payload should be shaped so the backend can return one cohesive graph for a session, including both:
- replay-observed graph material
- current-tree augmentation material with provenance preserved

### 6.2 Backend derivation
The backend should derive the graph on demand when a session’s Exploration view is opened.

The derivation should:
1. load session replay data
2. build framing nodes from session header and early replay/runtime entries
3. derive prompt/turn/tool/file/doc/search nodes and observed edges
4. add explicit `AGENTS.md` observations when they exist in replay
5. inspect the current project tree to identify ambient repo instruction sources and file/doc structure
6. augment the graph with structural relationships and one-hop context while preserving provenance and confidence
7. return the graph payload, optionally alongside a projection for the existing Exploration UI

The implementation may memoize the derived graph in process, but it must remain effectively in-memory and disposable.

### 6.3 Framing model
The graph should introduce a visible “session framing” cluster or section.

This framing model should surface things like:
- current working directory
- provider/model changes
- thinking level changes
- notable runtime context messages
- explicit `AGENTS.md` reads
- ambient repo instruction sources when identifiable from the repo tree
- system/developer prompt availability state

The most important design rule is that framing should answer:
- what shaped the agent before repo traversal started?

without collapsing observed and ambient context into one undifferentiated blob.

### 6.4 Exploration UI integration
The Exploration route should begin consuming the new graph truth model.

Initial UI goals for this phase:
- show framing information in or near the Exploration experience
- make evidence/provenance visible in the inspector for selected nodes/edges
- distinguish explicit vs ambient vs inferred context visually
- allow users to see when system/developer prompt context is unavailable

This phase does not require a full redesign of the current Exploration UI. A transitional adapter is acceptable if it helps land the graph truth model safely.

### 6.5 Relationship to current exploration contracts
The current `contracts/exploration/` payload can remain temporarily if it reduces migration risk.

However, the spec direction is:
- **graph IR becomes the source of truth**
- exploration-specific payloads become projections or adapters over the graph

This avoids duplicating causal logic in multiple contract layers long-term.

## 7. Error handling and failure modes

- If replay parsing succeeds but framing extraction is partial, return a valid graph with explicit missing/unavailable states rather than failing the whole request
- If current-tree augmentation fails, preserve the replay-observed graph and mark augmentation availability clearly
- If `AGENTS.md` cannot be found in the current repo tree, do not fabricate an ambient instruction source
- If system/developer prompt data is absent, expose that as unavailable or unknown instead of omitting the concept entirely when the UI needs to explain absence
- If the graph cannot be fully derived, fail in a typed and diagnosable way at the backend boundary, not as an unstructured renderer crash

## 8. Security and safety considerations

- Session logs remain read-only
- Hidden prompt content must not be invented or reconstructed from guesswork
- Ambient instruction modeling must not imply sensitive hidden context was captured if it was not
- Current-tree augmentation must preserve provenance so users can distinguish historical replay evidence from present-day repo structure

## 9. Testing strategy

### 9.1 Unit tests
- contract validation tests for graph nodes, edges, evidence, and payloads
- backend derivation tests proving:
  - session header framing is captured
  - model/thinking-level/runtime custom messages become framing nodes or evidence
  - explicit `AGENTS.md` reads become observed graph material
  - missing system/developer prompt state is represented truthfully
  - provenance and confidence are attached to derived nodes/edges
- adapter/projection tests if current Exploration payloads are derived from the graph

### 9.2 Integration tests
- backend command tests for graph retrieval
- renderer API tests for Zod validation and error handling
- Exploration UI tests for framing display, provenance display, and unavailable-context display
- targeted real-session validation against known JSONLs

## 10. Implementation checklist
- [ ] Add `contracts/graph/` with Zod-first session graph schemas and exports
- [ ] Add backend session-graph derivation with explicit framing, observed exploration, and current-tree augmentation
- [ ] Model explicit vs ambient vs inferred vs unavailable context in the returned payload
- [ ] Wire a typed backend/preload/renderer API for session graph retrieval
- [ ] Integrate graph-derived framing/provenance into the Exploration route
- [ ] Add tests for graph contracts, derivation, transport, and UI behavior
- [ ] Document limitations clearly, especially around unavailable system/developer prompt text

## 11. Open questions
- Should the first backend command be named generically (for example `get_session_graph`) or remain exploration-specific while the migration is in progress?
- Should the current Exploration payload remain as a projection layer for one release to reduce migration risk, or should the UI switch directly to graph-native consumption?
- How much of the framing model should be visible in the first UI slice: dedicated framing lane, inspector-only, or both?
