# Build Session Exploration Graph

Status: Active (Milestone 6 remaining — manual validation)
Owner: Follow-up implementation agent
Created: 2026-04-10
Spec: [[docs/specs/2026-04-10-session-exploration-graph.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

After this work, Ariadne users can open `/sessions/:id/exploration` and see how the agent traversed a repo during a session.

The new Exploration surface must answer, with clickable UI interactions rather than freeform prompting:
- which files and docs were explored after a prompt
- how the agent arrived at an edited file
- which docs influenced later reads or edits
- which one-hop neighbors were structurally adjacent but not explored

The experience should be a split view:
- a chronological path/timeline grouped by turn on one side
- a session-scoped graph on the other side
- a detail/inspector surface driven by selection

Verification target: on a real session, a user can click a prompt, read, edit, or doc node and immediately see the relevant path and graph highlights without guessing from raw replay alone.

## Progress

- [x] (2026-04-10) Milestone 1: Define exploration contracts and backend module boundaries.
- [x] (2026-04-10) Milestone 2: Derive dynamic exploration events and turn attribution from replay entries.
- [x] (2026-04-10) Milestone 3: Build lightweight file/doc repo-context graph with lazy cache behavior.
- [x] (2026-04-10) Milestone 4: Expose typed preload/API plumbing and integrate session-detail route/navigation.
- [x] (2026-04-10) Milestone 5: Implement Exploration UI split view, selection interactions, and muted one-hop neighbors.
- [ ] (2026-04-10) Milestone 6: Validate with real sessions, document limitations, and close out follow-up notes.

## Surprises & Discoveries

- Observation: current summary parsing in `backend/analytics/session-parser.ts` reduces bash activity to the first command token, which is not enough to reconstruct discovery paths.
  Evidence: the parser records `bash_commands[program]` but does not preserve query-level discovery detail for `rg`, `find`, or `ls` in aggregate summaries.

- Observation: `backend/analytics/replay-loader.ts` already loads the full raw session entries, so Exploration can derive richer paths from replay data without changing the underlying session format.
  Evidence: `get_session_entries()` returns the unmodified replay entries array plus session header and leaf ID.

- Observation: session detail already has stable route-local patterns for shared data loading and resizable exploration-like surfaces.
  Evidence: `src/pages/session-detail-layout.tsx`, `src/pages/session-detail-context.tsx`, and `src/components/traces/traces-view.tsx` provide reusable route and UI patterns.

## Decision Log

- Decision: v1 will target file/doc-level exploration, not a full symbol/call graph.
  Rationale: the user’s primary need is exploration observability and causal attribution, not maximal static code intelligence. File/doc-level relationships provide a much faster, safer proof of concept.
  Date/Author: 2026-04-10 / planning session

- Decision: the Exploration page will use a split view with chronological path + graph.
  Rationale: the user explicitly wants both a timeline of how the agent moved and a graph of what it explored. The timeline is better for causality, while the graph is better for topology.
  Date/Author: 2026-04-10 / planning session

- Decision: unexplored context will be limited to one-hop muted neighbors in v1.
  Rationale: this provides useful “could have been explored” context without turning the graph into noise.
  Date/Author: 2026-04-10 / planning session

- Decision: repo-context graph building should be lazy-built and cached rather than maintained as a permanently hot project index in v1.
  Rationale: the long-term goal is richer project-level caching, but the user prefers a simpler first iteration that avoids too much infrastructure before the data model is proven.
  Date/Author: 2026-04-10 / planning session

- Decision: curated question-answering will be encoded into selection behavior and preset actions, not a freeform NL query box.
  Rationale: this keeps v1 grounded in trustworthy data and avoids adding UI complexity before the data model is solid.
  Date/Author: 2026-04-10 / planning session

- Decision: snapshot support is a future extension, but the data model must distinguish replay evidence from current-tree augmentation from the start.
  Rationale: historical fidelity will matter later, and provenance/confidence separation is the cleanest way to keep that upgrade path open.
  Date/Author: 2026-04-10 / planning session

- Decision: v1 graph rendering uses a grouped list layout rather than a force-directed graph library.
  Rationale: avoids adding a graph rendering dependency before the data model is proven. The grouped layout still answers the key exploration questions clearly. A force-directed graph can be added in phase 2.
  Date/Author: 2026-04-10 / implementation

- Decision: exploration commands registered under the existing analytics namespace in the preload bridge rather than a separate `exploration` namespace.
  Rationale: keeps the preload API surface minimal and consistent with the existing analytics pattern. A separate namespace can be introduced if the exploration surface grows.
  Date/Author: 2026-04-10 / implementation

- Decision: exploration payload merges dynamic and static layers in the backend command handler rather than in the renderer.
  Rationale: keeps the renderer simple (one fetch, one payload) and ensures the backend is the single source of truth for derivation logic.
  Date/Author: 2026-04-10 / implementation

## Outcomes & Retrospective

### What shipped (v1)
- Typed exploration contracts at `contracts/exploration/`
- Backend replay-to-exploration derivation at `backend/analytics/exploration/derive-exploration.ts` with turn grouping, event classification (discovery, read, edit, write, doc read, opaque, failed), and causal relation derivation
- Static repo-context graph at `backend/analytics/exploration/repo-context.ts` with markdown link, wikilink, heading, path reference, and import extraction
- Lazy caches for both exploration payloads (in-memory by session) and repo context (5min TTL by project root)
- Backend command `get_session_exploration` registered and wired through preload/IPC
- Renderer API wrapper with Zod validation at `src/api/exploration.ts`
- Route `/sessions/:id/exploration` wired in router with lazy loading
- Session-detail navigation updated: Conversation shows Traces + Exploration actions; Traces/Exploration show Conversation back action
- Split-view UI: timeline panel (grouped by turn), artifact graph panel (explored + muted neighbors), selection-driven inspector
- 66 new unit tests for derivation and repo-context graph

### Questions answered well
- "What happened after this prompt?" — click a turn to see all downstream events and artifacts
- "How did the agent reach this file?" — click a file artifact to see causal chain (which discovery, read, or doc led to it)
- "Which docs influenced this edit path?" — doc_influenced_read relations connect doc reads to downstream source file reads
- "What neighbors were not explored?" — one-hop unexplored neighbors shown visually muted in the graph

### Known limitations (v1)
- Graph rendering uses a grouped list layout, not a force-directed graph visualization. Adequate for v1 but a proper graph library (e.g., react-force-graph, sigma.js) would improve topology visualization.
- Current-tree augmentation means historical sessions may show relationships that didn't exist at session time. Provenance/evidence metadata preserves the distinction.
- Import parsing is limited to ES import/require with `.` relative specifiers — no path alias resolution (e.g., `@/` or `@contracts/`)
- No symbol-level graph (functions, classes) — file-level only
- No multi-session comparison
- No snapshot-aware historical reconstruction

### Deferred to phase 2
- Symbol-level exploration graph nodes (function/class/type granularity)
- Cross-session comparison UI
- Snapshot-aware historical repo state reconstruction
- Force-directed or hierarchical graph rendering library
- Path alias resolution for import parsing
- Performance optimization for very large sessions (node count limits, graph pruning)
- Breadcrumb update for exploration route

## Context and orientation

### Existing relevant modules

| Path | Why it matters |
|---|---|
| `src/pages/session-detail-layout.tsx` | Owns session-detail route fetches, header actions, and child route outlet. Exploration route wiring will land here. |
| `src/pages/session-detail-context.tsx` | Provides shared `header`, `entries`, and `session_summary` to session-detail sub-pages. Exploration should reuse this context. |
| `src/pages/session-detail-traces.tsx` | Small route component that demonstrates how a session-detail sub-view consumes shared data. |
| `src/components/traces/traces-view.tsx` | Existing resizable trace surface. Reuse its panel, selection, and navigation patterns where they fit. |
| `backend/analytics/replay-loader.ts` | Loads raw replay entries for a single session. This is the dynamic source of truth for exploration derivation. |
| `backend/analytics/session-parser.ts` | Current aggregate summary parser. Helpful for understanding what is already captured, but not sufficient for exploration attribution. |
| `contracts/ipc-commands.ts` | Source of truth for preload command types. Exploration command wiring must update this file. |
| `src/api/analytics.ts` | Reference pattern for renderer-side Zod validation of backend payloads. |
| `src/router.tsx` | Route inventory for `/sessions/:id/*`; Exploration must be added here. |
| `docs/information-architecture.md` | Must be updated once the route and session-detail responsibilities change. |

### Terms used in this plan

- **Exploration turn**: a user message plus the downstream assistant/tool activity until the next user message.
- **Dynamic exploration layer**: ordered events derived from session replay.
- **Static repo-context layer**: file/doc relationships derived from the current project tree.
- **One-hop neighbor**: a node directly adjacent to an explored node in the repo-context graph, shown as muted context if not explored.
- **Current-tree augmentation**: using the project’s current files/docs to enrich an old session, even if the repo may have changed since the session.

### Assumed implementation shape

A practical v1 layout is:
- `contracts/exploration/*`
- `backend/analytics/exploration/*` (or `backend/exploration/*` if clearer after investigation)
- `src/api/exploration.ts`
- `src/components/exploration/*`
- `src/pages/session-detail-exploration.tsx`

The exploration payload should be fetched from the backend as one cohesive response so the renderer does not need to re-derive causality from raw replay entries.

## Plan of work

Implementation must follow **test-driven development**.

For each milestone:
1. define or confirm the contract and acceptance behavior,
2. add or extend tests for the intended behavior,
3. implement the smallest change that makes those tests pass,
4. run the relevant validation commands before moving on.

Do not defer testing to the end. The Exploration feature is only useful if the derived causality is trustworthy, so tests are part of the product surface.

### Parallelization strategy

This work is suitable for coordinated sub-agents once the contract is settled.

Recommended decomposition:
- **Workstream A — contracts + backend derivation**
  - exploration schemas
  - replay-to-exploration transform
  - backend command registration
  - unit/integration tests for derived payload correctness
- **Workstream B — static repo-context graph**
  - markdown/wikilink/path-reference extraction
  - file/doc adjacency graph
  - lazy cache behavior
  - unit tests for graph derivation and one-hop neighbor selection
- **Workstream C — renderer integration + UI**
  - API wrapper
  - route wiring
  - split-view components
  - UI interaction tests for selection, highlighting, and curated questions

Dependency order:
- Workstream A should land or at least define contracts first.
- Workstream B can proceed in parallel once artifact/edge contracts are agreed.
- Workstream C can begin layout work in parallel, but should not hardcode payload assumptions outside the agreed contracts.

### Milestone 1 — Contracts and backend boundaries

Create the type contract for the exploration payload before building the UI.

The contract should separate:
- dynamic exploration events and turn attribution
- static artifact nodes and edges
- explored vs unexplored-adjacent state
- evidence/confidence metadata
- selection-ready derived groupings needed by the UI

Do not start with a vague `Record<string, unknown>` payload. The contract is the main future-proofing layer for later symbol links and snapshot-aware upgrades.

At the same time, decide whether exploration logic belongs under `backend/analytics/exploration/` or a new `backend/exploration/` root. The safer default is to keep it close to replay loading unless a clear standalone subsystem boundary emerges.

### Milestone 2 — Dynamic exploration derivation

Build the replay-to-exploration transform.

This transform should:
- group entries into turns
- classify discovery commands where reliable
- identify reads, edits, writes, and doc reads
- preserve opaque commands when classification is weak
- derive high-confidence local causal links such as:
  - prompt → discovery command
  - discovery command → read
  - read → later read
  - read/doc read → later edit when sequencing and evidence support it
  - user follow-up response → continued exploration chain

The result must be useful even before any repo-context graph exists.

### Milestone 3 — Static repo-context graph and cache

Build a lightweight graph for the session’s project root using the current tree.

V1 scope:
- source file relationships at the file level
- markdown file and section relationships
- markdown links
- wikilinks like `[[filename]]`
- explicit file-path references from docs

Keep the graph neighborhood constrained to the session-touched nodes plus one-hop neighbors. The graph builder should be lazy-triggered when Exploration is first opened and cached so reopening the session does not rebuild everything from scratch.

Keep provenance explicit so current-tree augmentation never overwrites replay truth.

### Milestone 4 — Transport and route integration

Expose a typed command from backend to renderer.

Update:
- backend command registration
- preload typing in `contracts/ipc-commands.ts`
- renderer API wrapper with Zod validation
- `src/router.tsx`
- `src/pages/session-detail-layout.tsx`

Navigation requirement from the planning session:
- Conversation should expose both Traces and Exploration quick actions
- Exploration should expose a Conversation back action and should not show the Traces action

### Milestone 5 — Exploration UI

Implement the split view.

Required behavior:
- left panel: timeline/path grouped by turn
- right panel: graph of explored nodes with one-hop muted neighbors
- clicking either side updates shared selection/highlighting
- detail/inspector explains the selected item in human terms
- curated actions answer common questions without requiring freeform input

Treat the path/timeline as the canonical explanation surface. The graph should support it, not compete with it.

### Milestone 6 — Validation and closeout

Use real sessions, not only synthetic fixtures.

Specifically verify:
- docs-first exploration
- search-driven exploration (`rg`, `find`, `ls`)
- multi-read chains before edits
- user follow-up questions that change exploration direction
- sessions where static repo context fails or is incomplete

After implementation, update:
- this plan’s living sections
- the spec status if appropriate
- `docs/information-architecture.md`
- any affected architecture/design docs if the new backend subsystem boundary becomes significant

## Concrete steps

All commands run from: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

1. **Create exploration contracts**
   - Add `contracts/exploration/` schemas and exports.
   - Update `contracts/index.ts` and `contracts/ipc-commands.ts` as needed.

2. **Create backend derivation module**
   - Add exploration transform code near replay loading.
   - Reuse existing replay data access from `backend/analytics/replay-loader.ts`.
   - Add command registration in the backend command wiring.

3. **Create lightweight repo-context builder**
   - Add markdown/doc parsing and file-level relationship derivation.
   - Keep logic bounded to session project roots.
   - Add lazy cache behavior.

4. **Create renderer API wrapper**
   - Add `src/api/exploration.ts` with Zod validation.
   - Follow `src/api/analytics.ts` as the runtime validation pattern.

5. **Create session-detail Exploration route**
   - Add `src/pages/session-detail-exploration.tsx`.
   - Wire `/sessions/:id/exploration` in `src/router.tsx`.
   - Update session-detail header/navigation behavior.

6. **Build Exploration components**
   - Add `src/components/exploration/*`.
   - Reuse resizable-panel patterns already used in traces and session detail.

7. **Validate and polish**
   - Run typecheck, tests, and manual verification.
   - Update docs that reflect shipped behavior.

### Suggested verification commands

- `bun run typecheck`
- `bun run test`
- `bun run lint`
- `bun run dev`

Test execution expectations:
- run the smallest relevant test subset while iterating,
- run `bun run test` before handing work to another agent or merging milestones,
- add new tests for every new exploration behavior before declaring the milestone done.

When manual-testing, open a real session and compare:
- Conversation
- Traces
- Exploration

The Exploration route should add causal understanding, not just another rendering of the same raw entries.

## Validation and acceptance

Implementation is acceptable when all of the following are true:

1. `/sessions/:id/exploration` loads from shared session-detail context without breaking Conversation or Traces.
2. Selecting a prompt/turn highlights the downstream exploration path it triggered.
3. Selecting a file explains how the session reached it.
4. Doc links, wikilinks, and explicit file-path references visibly contribute to graph relationships where present.
5. One-hop unexplored neighbors are visible but clearly muted and never confused with explored nodes.
6. Opaque or weakly classified commands remain visible without misleading causal edges.
7. Exploration remains partially useful even if static repo-context derivation fails.
8. Provenance/confidence is surfaced clearly enough that a user can tell replay truth from current-tree augmentation.

## Idempotence and recovery

- Exploration derivation should be additive and read-only.
- If the cache becomes stale or corrupt, it must be safe to rebuild from replay + project tree.
- If repo-context graph derivation fails, the page should degrade to the dynamic path/timeline instead of failing hard.
- If route wiring lands before graph rendering is complete, keep the page behind a stable loading/empty/error state rather than exposing a half-crashing surface.

## Artifacts and notes

To be filled in during implementation.

Recommended evidence to capture here as work proceeds:
- a short example of derived prompt → read → edit chain from a real session
- a short example of a doc link or wikilink producing a visible graph edge
- screenshots or concise notes confirming muted unexplored neighbors
- any cases where current-tree augmentation produced misleading context

## Interfaces and dependencies

| Interface / module | Why it must exist at completion |
|---|---|
| Exploration payload contract in `contracts/exploration/*` | Defines the stable renderer/backend boundary for this feature. |
| Backend exploration command registration | Makes the derived payload available through the supervised backend process. |
| Renderer API wrapper in `src/api/exploration.ts` | Preserves the repo’s compile-time + Zod validation boundary pattern. |
| Session-detail route component | Hosts the Exploration page under `/sessions/:id/exploration`. |
| Exploration UI components | Render timeline/path, graph, and selection details coherently. |
| Session-detail navigation update | Makes Exploration discoverable from the existing session detail workflow. |
| Documentation updates | Keep IA and planning surfaces aligned with shipped behavior and known limitations. |
