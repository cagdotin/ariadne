# Build Session Graph IR and Framing Context

Status: Pending
Owner: Follow-up implementation agent
Created: 2026-04-11
Spec: [[docs/specs/2026-04-11-session-graph-ir-and-framing.md]]

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Conforms to: `PLAN.md`

## Purpose / Big picture

After this work, Ariadne users opening `/sessions/:id/exploration` should be able to see not only what files/docs the agent touched, but also what **framed** the session and how trustworthy each graph relationship is.

The backend should derive a new in-memory session graph IR that becomes the source of truth for Exploration. The graph should include:
- session framing context
- prompts, turns, tools, and explored artifacts
- explicit, ambient, inferred, and unavailable context states
- evidence/provenance for graph assertions

The implementation must remain honest about what current session JSONLs actually contain.

Verification target:
- on a real session, the Exploration UI can show framing context such as cwd/model/thinking level/custom runtime context
- explicit `AGENTS.md` reads show as observed graph material when they occurred
- unavailable system/developer prompt text is shown as missing/unknown rather than silently fabricated
- graph nodes/edges include enough provenance for the inspector to explain why they exist

## Progress

- [ ] (2026-04-11) Milestone 1: Lock `contracts/graph/` schemas and export surface.
- [ ] (2026-04-11) Milestone 2: Implement backend session graph derivation from replay plus framing context.
- [ ] (2026-04-11) Milestone 3: Add current-tree augmentation for ambient repo instruction/doc/code context with provenance.
- [ ] (2026-04-11) Milestone 4: Expose typed graph transport across backend, preload, and renderer.
- [ ] (2026-04-11) Milestone 5: Integrate graph-derived framing/provenance into the Exploration UI.
- [ ] (2026-04-11) Milestone 6: Validate on real sessions, document confirmed limitations, and prepare follow-up notes.

## Surprises & Discoveries

- Observation: real session JSONLs on this machine do not currently persist `role: "system"` or `role: "developer"` messages.
  Evidence: repository-side audit across discovered session JSONLs found `system_role: 0` and `developer_role: 0`.

- Observation: useful framing context is still present in replay-adjacent data.
  Evidence: session headers include `cwd`; replay entries include `model_change`, `thinking_level_change`, and `custom_message` entries such as `cmux-detected`, `expertise-loaded`, and `track-context-loaded`.

- Observation: explicit `AGENTS.md` reads are recoverable when they happened during the session.
  Evidence: real session JSONLs contain tool calls like `read("AGENTS.md")` and absolute-path reads to repo `AGENTS.md` files.

- Observation: the current Exploration implementation already has a backend derivation path and UI surface, but its contract is too exploration-specific to serve as the long-term truth model.
  Evidence: `contracts/exploration/*` and `backend/analytics/exploration/*` exist, but they do not yet model framing availability/provenance broadly enough.

## Decision Log

- Decision: a new `contracts/graph/` package will be introduced instead of overloading `contracts/exploration/` further.
  Rationale: the graph IR is broader than the current Exploration page and should become a reusable truth model for future features.
  Date/Author: 2026-04-11 / planning session

- Decision: graph derivation remains in-memory and on-demand in this phase.
  Rationale: the immediate problem is graph truth, not graph persistence.
  Date/Author: 2026-04-11 / planning session

- Decision: unavailable system/developer prompt content must be modeled explicitly rather than guessed.
  Rationale: the product must prefer truthful absence over fabricated context.
  Date/Author: 2026-04-11 / planning session

- Decision: explicit vs ambient vs inferred context must be visible in both contracts and UI.
  Rationale: `AGENTS.md` and other framing sources are high-value only if users can tell how Ariadne knows about them.
  Date/Author: 2026-04-11 / planning session

## Outcomes & Retrospective

To be filled in during implementation. Capture here:
- whether graph IR fully replaced or temporarily coexisted with the old exploration payload
- which framing sources successfully appeared on real sessions
- which limitations remain around unavailable prompt data
- whether the UI needed only an adapter or a larger refactor

## Context and orientation

### Relevant files and modules

| Path | Why it matters |
|---|---|
| `contracts/sessions/replay.ts` | Defines the currently understood replay/session schema boundary. |
| `contracts/exploration/types.ts` | Current exploration contract; useful comparison point for migration/projection decisions. |
| `contracts/index.ts` | Top-level contract barrel; must export the new graph contract. |
| `backend/analytics/replay-loader.ts` | Loads raw session entries that feed graph derivation. |
| `backend/analytics/exploration/*` | Existing exploration derivation and cache logic; likely starting point for migration. |
| `contracts/ipc-commands.ts` | Typed preload command surface; must expose graph retrieval. |
| `src/api/exploration.ts` | Existing Exploration fetch wrapper; may gain adapter logic or be complemented by `src/api/graph.ts`. |
| `src/pages/session-detail-exploration.tsx` | Route entry point where graph-derived framing must become visible. |
| `src/components/exploration/*` | Existing timeline/graph/inspector components to update with framing and provenance. |
| `docs/specs/2026-04-10-session-exploration-graph.md` | Prior Exploration design context; useful for continuity. |
| `docs/exec-plans/pending/2026-04-10-session-exploration-graph.md` | Prior implementation sequencing for the current Exploration feature. |

### Terms used in this plan

- **Graph IR**: an intermediate representation — a typed, in-memory session graph contract used by Ariadne internally.
- **Observed context**: directly present in replay/session data.
- **Ambient context**: current runtime/repo context that plausibly framed the session but was not explicitly read in replay.
- **Inferred context**: strong but indirect derivation, usually from ordering or structure.
- **Unavailable context**: information users care about, but the session logs do not actually contain.

### Assumptions for implementers

- Work from `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`
- Use Bun commands only
- Do not commit or push
- Follow TDD
- Keep the plan file current once implementation starts

## Plan of work

Implementation should proceed contract-first and follow TDD.

This work is well-suited to parallelization after the graph contract is locked.

Recommended workstream split:
- **Workstream A — contracts + backend graph derivation**
- **Workstream B — ambient/current-tree augmentation + provenance**
- **Workstream C — renderer transport + Exploration UI integration**

Dependency rule:
- Workstream A must define the graph contract first.
- Workstream B can proceed once node/edge/evidence semantics are stable.
- Workstream C can prepare UI integration in parallel but should not invent payload shape locally.

### Milestone 1 — Lock graph contracts

Create a new `contracts/graph/` package.

Required outcomes:
- Zod schemas for node kinds, edge kinds, evidence kinds, confidence, availability state, and top-level payload
- exported inferred TypeScript types
- barrel exports from `contracts/graph/index.ts`
- top-level export via `contracts/index.ts`

Tests to add first:
- valid payload examples parse successfully
- invalid node/edge/evidence states fail validation
- availability states support unavailable/unknown framing without requiring hidden prompt text

### Milestone 2 — Replay-derived graph and framing extraction

Implement backend graph derivation using raw replay/session data.

Required outcomes:
- session header becomes graph framing material where appropriate
- model changes and thinking level changes become graph-visible framing context
- custom runtime messages like `cmux-detected`, `expertise-loaded`, and `track-context-loaded` can be represented with provenance
- prompts, turns, tools, search/discovery, files/docs, and causal edges are represented in the graph
- explicit `AGENTS.md` reads become observed graph nodes/edges
- system/developer prompt absence is represented truthfully

Tests to add first:
- fixture with `cwd`/model/thinking-level yields framing nodes or equivalent graph material
- fixture with explicit `AGENTS.md` read yields observed `agents_doc` material
- fixture without system/developer prompt data yields unavailable/unknown graph state instead of fake content
- graph evidence records refer back to replay entry IDs or equivalent source refs where possible

### Milestone 3 — Ambient repo augmentation and provenance

Add current-tree augmentation carefully.

Required outcomes:
- identify repo instruction/doc sources such as repo `AGENTS.md` when present in the current tree
- distinguish ambient repo context from explicit replay reads
- preserve provenance and confidence on all augmentation edges
- continue to support doc/code structural links for Exploration

Tests to add first:
- current-tree `AGENTS.md` can appear as ambient repo context when not explicitly read
- ambient context is tagged differently from observed replay context
- augmentation failure does not break replay-observed graph derivation

### Milestone 4 — Typed transport and API surface

Expose the graph through Ariadne’s typed transport boundary.

Required outcomes:
- preload/backend command wiring added in `contracts/ipc-commands.ts` and corresponding backend command registration
- renderer API wrapper validates the graph payload with Zod
- command naming is documented clearly if a temporary coexistence phase with `get_session_exploration` exists

Tests to add first:
- backend command returns schema-valid graph payload
- renderer API rejects malformed payloads cleanly
- any compatibility adapter from graph to exploration payload remains covered

### Milestone 5 — Exploration UI integration

Update the Exploration route to consume graph truth and show framing/provenance.

Required outcomes:
- users can see session framing context in the Exploration experience
- selected nodes/edges expose evidence/provenance in the inspector
- unavailable prompt context is visible as unavailable/unknown when relevant
- explicit vs ambient vs inferred context are visually distinct enough not to mislead

Tests to add first:
- framing section/cluster renders when graph contains framing nodes
- inspector displays provenance/evidence for selected items
- unavailable system/developer prompt state renders as absence/unknown rather than as fake content
- explicit `AGENTS.md` vs ambient `AGENTS.md` are distinguishable in UI behavior or labels

### Milestone 6 — Real-session validation and follow-up notes

Validate against real sessions and write down remaining gaps.

Required outcomes:
- confirm framing works on sessions that include model changes and runtime custom messages
- confirm explicit `AGENTS.md` reads are shown correctly where present
- confirm sessions without prompt capture show truthful unavailability
- document any remaining migration debt between graph IR and old exploration-specific contracts

## Concrete steps

All commands run from:
- `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Orientation
```bash
find contracts -maxdepth 2 -type f | sort
find backend/analytics -maxdepth 3 -type f | sort | rg 'exploration|replay|session'
find src -maxdepth 3 -type f | sort | rg 'exploration|session-detail|api'
```

### Suggested implementation sequence
```bash
# 1. Add graph contracts and tests
bun run test <new-contract-tests>

# 2. Add backend graph derivation tests first
bun run test <new-backend-graph-tests>

# 3. Implement backend derivation + transport
bun run typecheck
bun run test <backend-tests>

# 4. Add UI tests for framing/provenance rendering
bun run test <ui-tests>

# 5. Run broader validation
bun run test
bun run typecheck
bun run lint
```

### Real-session spot checks
Use real Ariadne session JSONLs that already demonstrated the relevant signals during planning, for example:
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-10T14-10-44-971Z_2a3d05f8-994d-4d01-a9eb-738011875c92.jsonl`
- `~/.pi/agent/sessions/--Users-cgn-git-dev-0xcgn-ariadne-ariadne--/2026-04-09T10-25-07-248Z_61c7b647-8f85-4d9d-9c56-953bdb150aae.jsonl`

These should be used for manual verification only; do not mutate them.

## Validation and acceptance

This work is complete when all of the following are true:

1. `contracts/graph/` exists with Zod-first schemas and exported types.
2. Backend can return a schema-valid session graph payload derived from replay.
3. Session framing context from currently available data sources appears in the graph.
4. Explicit `AGENTS.md` reads are represented as observed graph material.
5. Ambient repo instruction/doc context is represented separately from explicit reads.
6. System/developer prompt absence is modeled truthfully as unavailable/unknown rather than guessed.
7. Exploration UI can display framing/provenance/unavailable-context information from the graph.
8. `bun run typecheck` passes.
9. Relevant tests pass.
10. Manual validation on at least two real sessions confirms the model is believable.

## Idempotence and recovery

- Contract creation is safe to re-run as long as tests pin the intended schema surface.
- If migration from old exploration payloads becomes too invasive, introduce a temporary graph-to-exploration adapter rather than duplicating graph logic in two places.
- If ambient repo augmentation becomes noisy, keep the graph stricter and ship only the replay-observed framing first.
- If UI integration is blocked, land graph contracts/backend/API first so the truth model is available independently of the final presentation.

## Artifacts and notes

Record here during implementation:
- example graph payload snippets for framing nodes
- example observed `AGENTS.md` relation from a real or fixture session
- example unavailable system-prompt representation
- screenshots or interaction notes from the Exploration UI after graph integration

## Interfaces and dependencies

| Interface / module | Why it matters |
|---|---|
| `contracts/graph/*` | New source-of-truth graph IR shared across backend and renderer. |
| `contracts/index.ts` | Must export the new graph contract package. |
| `contracts/ipc-commands.ts` | Typed transport surface for session graph retrieval. |
| `contracts/sessions/replay.ts` | Defines what replay data Ariadne currently knows how to validate. |
| `backend/analytics/replay-loader.ts` | Raw replay source for graph derivation. |
| `backend/analytics/exploration/*` | Existing derivation code that may be refactored or adapted. |
| `src/api/exploration.ts` / new `src/api/graph.ts` | Renderer-side validation and fetch surface. |
| `src/pages/session-detail-exploration.tsx` | Route-level integration point for graph-derived Exploration. |
| `src/components/exploration/*` | Existing UI components that should begin surfacing framing and provenance. |
