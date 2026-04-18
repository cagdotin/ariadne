# Implement Exploration pane rebalance

Status: Active
Owner: Implementation agent
Created: 2026-04-13
Spec: [[docs/specs/2026-04-13-exploration-pane-rebalance.md]]
Related artifacts:
- [[docs/specs/2026-04-13-exploration-clarity-pass.md]]
- [[docs/specs/2026-04-13-exploration-visualization-rewrite.md]]
- [[docs/exec-plans/active/2026-04-13-session-graph-ir-review-fixes.md]]

This ExecPlan is a living document and must be maintained in accordance with `PLAN.md`.
Conforms to: `PLAN.md`

## Purpose / Big picture

Rebalance the Exploration route so each pane owns one job clearly:
- left pane = session narrative
- map = explored artifacts and nearby context
- inspector = explanation of the active selection

After this work, a user opening `/sessions/:id/exploration` should see:
- framing at the top of the left pane rather than as a separate full-width row
- all turns collapsed by default so the page is compact and scannable
- a map that primarily shows docs, files, edited outputs, and adjacent context
- prompt/tool/framing nodes appearing in the map only when needed to explain the active selection

Observable verification target:
1. open a real session and confirm the left pane begins with a collapsible framing section followed by collapsed turns
2. confirm the unselected map is artifact-first rather than prompt/discovery/framing-heavy
3. select a file, prompt, and framing source and confirm the map reintroduces only the minimal scaffolding needed to explain each case

## Progress

- [x] (2026-04-13 14:00Z) Planning artifact created; scope and constraints captured in spec + exec plan.
- [x] (2026-04-13 14:05Z) Establish baseline behavior — 82 tests passing, route inspected.
- [x] (2026-04-13 14:10Z) Integrate framing into the left narrative pane — ExplorationFraming moved from standalone row into ExplorationPath.
- [x] (2026-04-13 14:15Z) Collapse turns by default and add selection-aware auto-expansion via useEffect.
- [x] (2026-04-13 14:20Z) Convert the map to artifact-first default baseline — added `artifact_first` and `scaffolding_node_ids` to VisibilityOptions; narrative lanes hidden by default.
- [x] (2026-04-13 14:25Z) Selection-driven scaffolding wired — selection subgraph's highlighted_node_ids passed as scaffolding to reintroduce minimal narrative nodes.
- [x] (2026-04-13 14:30Z) Quick actions and focus modes unchanged — they already work because selection subgraph provides the scaffolding.
- [x] (2026-04-13 14:35Z) 87 tests passing (5 new artifact-first tests), typecheck clean. `docs/information-architecture.md` updated.

## Surprises & Discoveries

- Observation: the current implementation already has clean renderer-side seams for this work.
  Evidence: `src/components/exploration/exploration-view.tsx` composes framing, controls, path, map, and inspector separately; `src/lib/exploration-graph-view-model.ts` and `src/lib/exploration-path-view-model.ts` already centralize most view-model logic.

- Observation: current tests focus on pure helpers rather than DOM-heavy component coverage.
  Evidence: existing exploration tests live under `tests/unit/lib/` and cover `exploration-graph-view-model`, `exploration-path-view-model`, `exploration-question-actions`, and inspector summaries.

- Observation: current code still encodes the old redundancy directly.
  Evidence: `exploration-view.tsx` renders `ExplorationFraming` above the whole split view; `exploration-path.tsx` initializes all turns expanded; `exploration-map.tsx` still renders framing, prompts, and discovery as first-class lane content.

## Decision Log

- Decision: treat this as a renderer-only clarity pass unless implementation proves otherwise.
  Rationale: the requested changes are about pane ownership, default visibility, and interaction density, not graph semantics.
  Date/Author: 2026-04-13 / planning

- Decision: preserve the graph-first model and keep prompt/tool/framing nodes fully inspectable.
  Rationale: the user wants less duplication in the map, not less explanatory power overall.
  Date/Author: 2026-04-13 / planning

- Decision: make the default map artifact-first and selection-driven for narrative scaffolding.
  Rationale: the left pane already owns chronology; the map should specialize in files/docs/context until a selection asks for more explanation.
  Date/Author: 2026-04-13 / planning

## Outcomes & Retrospective

Implementation landed.

Achieved outcomes:
- framing moved into the top of the left narrative pane (no standalone row above workspace)
- turns collapsed by default; auto-expand on selection
- map defaults to artifact lanes only (docs, files, outputs, context)
- selection-driven scaffolding reintroduces narrative nodes from the selection subgraph
- all existing tests preserved; 5 new artifact-first visibility tests added
- typecheck clean
- `docs/information-architecture.md` updated to match shipped pane ownership

No scope breaks — all changes are renderer-side.

Deferred:
- manual validation on a real running session (requires `bun run dev`)
- open questions from spec §11 (turn anchors in map, auto-collapse on clear, long causal chains) left as-is for now

## Context and orientation

Relevant files and current responsibilities:

- `src/components/exploration/exploration-view.tsx`
  - top-level composition for framing, controls, path, map, and inspector
  - currently renders `ExplorationFraming` as a separate full-width row above the workspace

- `src/components/exploration/exploration-path.tsx`
  - renders turns and actions in the left pane
  - currently initializes all turns expanded via `new Set(path_turns.map(...))`
  - should become the home for the framing section as well

- `src/components/exploration/exploration-framing.tsx`
  - existing framing UI
  - likely to be embedded into the path pane or split into a reusable section component

- `src/components/exploration/exploration-map.tsx`
  - current context map
  - currently groups visible nodes by lane and renders framing/prompts/discovery/docs/files/outputs/context as peer sections

- `src/lib/exploration-graph-view-model.ts`
  - controls lane assignment, map-node filtering, map-edge filtering, route connectors, and selection subgraph derivation
  - this is the main place to implement artifact-first default visibility and selection-driven scaffolding rules

- `src/lib/exploration-question-actions.ts`
  - provides curated action descriptors
  - likely needs small updates so actions still produce meaningful views after the map stops showing narrative lanes by default

- `tests/unit/lib/exploration-graph-view-model.test.ts`
  - currently expects framing/prompts/discovery lanes to exist in the default map model
  - must be revised to express the new artifact-first baseline

- `tests/unit/lib/exploration-path-view-model.test.ts`
  - good place to add helper-level assertions if turn-state logic moves into pure helpers

- `docs/information-architecture.md`
  - update when the feature ships so the Exploration route description matches the new pane ownership

Scope guardrails:
- do not change backend derivation or `contracts/graph/*` unless blocked by a genuine missing capability
- do not add broad new UI surfaces; recompose the existing ones
- do not delete inspector support for prompt/tool/framing nodes

## Plan of work

### Milestone 1 — Capture the current baseline and define the new default states

Before editing behavior, run the current focused tests and inspect the route once manually so the agent knows exactly what is changing.

Expected result:
- a clear before-state for framing placement, turn expansion, and map lane density
- confidence that failures after the change are caused by the new behavior rather than pre-existing issues

### Milestone 2 — Fold framing into the left narrative pane

Refactor the composition so framing appears at the top of the left pane instead of as a separate row above the split view.

Implementation guidance:
- prefer reusing `ExplorationFraming` internals rather than rewriting framing from scratch
- either embed `ExplorationFraming` inside `ExplorationPath` or extract a smaller shared section component and compose it there
- preserve current framing selection behavior and `show_ambient` handling

Expected result:
- no standalone framing strip above the workspace
- the left pane opens with framing first, then turns

### Milestone 3 — Make turns collapsed by default

Change the initial turn-state model so the route is compact on first load.

Implementation guidance:
- replace the current “all expanded” initialization with “all collapsed”
- if a selected node belongs to a turn, auto-expand only that owning turn
- keep manual toggling independent after selection-driven expansion occurs
- if the logic becomes awkward in the component, extract a small pure helper rather than layering more implicit state into JSX

Expected result:
- long sessions are immediately scannable
- selecting an action still reveals its containing turn deterministically

### Milestone 4 — Convert the map to an artifact-first baseline

Change the default map visibility so the unselected map highlights artifacts and nearby context instead of narrative scaffolding.

Implementation guidance:
- the baseline visible set should center on docs, files, outputs, and adjacent context
- framing, prompts, discovery nodes, and generic tool-call nodes should be hidden or strongly suppressed by default in the map
- retain availability styling for the nodes that remain visible
- update lane derivation or visible-node filtering in a way that keeps the implementation readable; avoid sprinkling one-off conditions throughout the render tree

Expected result:
- the map looks materially less redundant relative to the left pane
- the user can scan touched docs/files/outputs without reading a second copy of the session narrative

### Milestone 5 — Add selection-driven narrative scaffolding back into the map

Reintroduce prompt/tool/framing nodes only when they are necessary to answer the active question.

Implementation guidance:
- a selected file may need a minimal upstream chain
- a selected turn may need a compact turn anchor plus its explored artifacts
- a selected framing node may need itself plus influenced artifacts
- keep the reintroduced nodes visually subordinate to artifacts unless they are the selected node itself
- when selection clears, return to the artifact-first baseline cleanly

Expected result:
- the map regains explanatory power without regaining baseline clutter

### Milestone 6 — Align quick actions and focus modes

Ensure Path / Influence / Neighborhood and curated actions still lead to meaningful, distinct views under the new baseline.

Implementation guidance:
- review `compute_question_actions` and any view-model helpers those actions rely on
- make sure a quick action does not silently depend on default prompt/discovery lanes being visible anymore
- keep Neighborhood artifact-local by default

Expected result:
- selecting a file, prompt, or doc still produces a coherent answer with fewer competing nodes

### Milestone 7 — Validate, clean up, and update docs

Once behavior is stable, update tests, run validation, and document the final route description.

Expected result:
- focused tests pass
- typecheck passes
- the route is manually verified on at least one real session
- `docs/information-architecture.md` reflects the shipped pane ownership

## Concrete steps

Work from the repository root: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

1. Establish baseline and focused test health.
   - Run:
     - `bun run test -- tests/unit/lib/exploration-graph-view-model.test.ts`
     - `bun run test -- tests/unit/lib/exploration-path-view-model.test.ts`
     - `bun run test -- tests/unit/lib/exploration-question-actions.test.ts`
   - Expected result: current tests pass or any failures are captured in `Surprises & Discoveries` before implementation proceeds.

2. Move framing into the left pane.
   - Edit:
     - `src/components/exploration/exploration-view.tsx`
     - `src/components/exploration/exploration-path.tsx`
     - optionally `src/components/exploration/exploration-framing.tsx`
   - Expected observable result: no dedicated framing row above the split view.

3. Change turn default state and selection-aware expansion.
   - Edit `src/components/exploration/exploration-path.tsx`
   - If needed, add a pure helper in `src/lib/` and a matching unit test file under `tests/unit/lib/`
   - Expected observable result: first render shows collapsed turns; selecting an action expands the owning turn.

4. Implement artifact-first map visibility.
   - Edit:
     - `src/lib/exploration-graph-view-model.ts`
     - `src/components/exploration/exploration-map.tsx`
   - Update tests in `tests/unit/lib/exploration-graph-view-model.test.ts`
   - Expected observable result: the unselected map primarily shows docs/files/outputs/context.

5. Add selection-driven scaffolding.
   - Continue edits in:
     - `src/lib/exploration-graph-view-model.ts`
     - `src/components/exploration/exploration-map.tsx`
     - `src/lib/exploration-question-actions.ts` as needed
   - Expected observable result: selecting a file/prompt/framing node adds only minimal explanatory scaffolding.

6. Run validation.
   - Run:
     - `bun run test -- tests/unit/lib/exploration-graph-view-model.test.ts tests/unit/lib/exploration-path-view-model.test.ts tests/unit/lib/exploration-question-actions.test.ts tests/unit/lib/exploration-inspector-summaries.test.ts`
     - `bun run typecheck`
   - Expected result: all targeted tests pass; typecheck passes.

7. Manual verification.
   - Run `bun run dev`
   - Open a real session at `/sessions/:id/exploration`
   - Verify:
     - framing is in the left pane
     - turns are collapsed initially
     - unselected map is artifact-first
     - file selection still explains arrival clearly
     - prompt selection still explains downstream exploration without restoring full map clutter

8. Update route documentation after behavior ships.
   - Edit `docs/information-architecture.md`
   - Update this ExecPlan and the spec status/notes accordingly.

## Validation and acceptance

The work is acceptable only if all of the following are true:

1. There is no separate full-width framing row above the workspace.
2. The left pane begins with framing and then a list of collapsed turns.
3. The first-load map is clearly artifact-first.
4. Selecting a file still answers “how did the agent arrive here?”
5. Selecting a prompt still answers “what happened after this?”
6. Clearing selection returns the map to the artifact-first baseline.
7. Focused exploration tests pass.
8. `bun run typecheck` passes.
9. `docs/information-architecture.md` matches shipped behavior.

## Idempotence and recovery

- Make changes milestone by milestone and keep tests green after each one. Do not batch the entire rewrite into a single unverified edit.
- If the framing move destabilizes layout, temporarily embed the existing framing component unchanged inside the left pane first, then refine styling in a second pass.
- If turn auto-expansion becomes hard to reason about, extract a pure helper and test it rather than layering more `useEffect` state synchronization into the component.
- If artifact-first filtering breaks a quick action, restore that action’s behavior by making the action request explicit scaffolding instead of relaxing the default baseline globally.
- If implementation discovers a real need for backend or graph-contract changes, stop and record the blocker in `Surprises & Discoveries` instead of widening scope silently.

## Artifacts and notes

Pre-implementation notes:
- No runtime artifacts captured yet.
- During implementation, add short notes here for:
  - before/after screenshots or descriptions
  - any especially tricky visibility-rule decisions
  - manual validation sessions used

## Interfaces and dependencies

Required interfaces and modules at completion:

- `src/components/exploration/exploration-view.tsx`
  - must compose controls, left narrative pane, map, and inspector without a standalone framing row

- `src/components/exploration/exploration-path.tsx`
  - must render framing plus collapsible turns
  - must own or coordinate selection-aware turn expansion

- `src/components/exploration/exploration-map.tsx`
  - must render an artifact-first visible set by default
  - must still honor selection and focus-mode emphasis

- `src/lib/exploration-graph-view-model.ts`
  - must expose readable, testable logic for default artifact visibility and selection-driven scaffolding

- `src/lib/exploration-question-actions.ts`
  - must continue to return actions that produce meaningful views under the new baseline

- `tests/unit/lib/exploration-graph-view-model.test.ts`
  - must verify the new baseline and selection behavior

- `docs/information-architecture.md`
  - must describe the Exploration route in a way that matches the shipped pane ownership
