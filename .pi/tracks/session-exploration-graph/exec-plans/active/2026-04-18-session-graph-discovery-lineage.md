# Add same-turn discovery lineage to the session graph

Status: Active
Owner: pi
Created: 2026-04-18
Spec: `reports/2026-04-18-session-graph-structure-evaluation.md` (`Follow-on spec — discovery lineage and inferred causal influence`)

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. This plan conforms to `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Ariadne's current Exploration Graph shows that searches, reads, and edits happened in a turn, but it does not yet show which earlier discovery step likely led to a later file action. The immediate product gap is that same-turn searches and later reads appear as flat siblings instead of as an explanatory chain.

After this work, Ariadne should be able to show evidence-backed same-turn lineage such as:
- `user prompt -> turn -> search -> read -> file`
- `user prompt -> turn -> search -> edit -> file`

The first ship goal is deliberately narrow and honest:
- infer only same-turn discovery lineage
- emit only strong `discovered` and `influenced_by` edges
- prefer under-linking over speculative causal graphs

A user should be able to verify the change by opening a real session in `/sessions/:id/exploration`, switching to `Graph`, and seeing later file-touching tools nest under the search that plausibly surfaced them when the replay evidence is strong enough.

## Progress

- [x] (2026-04-18 16:20 CEST) Reviewed the current graph IR, derivation pipeline, tree projection, insight graph helpers, and wrote the follow-on spec in `reports/2026-04-18-session-graph-structure-evaluation.md`.
- [x] (2026-04-18 14:41 UTC) Milestone 1 — graph derivation now correlates same-turn search `toolCall.id` ↔ `toolResult.toolCallId`, stores tool-call/result metadata on graph nodes, and emits evidence-backed `discovered` plus action-targeted `influenced_by` edges for exact-path and uniquely-resolved basename matches. Added derivation tests covering exact match, unique-basename match, ambiguity rejection, adjacency-only rejection, and one-search-to-many-reads behavior.
- [x] (2026-04-18 14:51 UTC) Milestone 2 — tree projection now allows same-turn `influenced_by` edges to become the primary parent for later `tool_call` nodes ahead of `assistant_turn -> tool_call`, and insight/path helpers now surface `search -> action -> artifact` as the primary route while keeping `discovered` as supporting context. Added projection/insight/summary tests for parent preference, fallback behavior, artifact lineage, turn lineage, tool selection, and primary-path labels.
- [~] (2026-04-18 15:25 UTC) Milestone 3 — targeted real-session validation against `e8c0c10f-6599-4e15-bcdc-8ba1b279857d` showed the initial exact-hit-only search lineage was still too weak. The derivation now uses a broader same-turn influence scorer: search-result hits, search-query term affinity, post-search artifact references, and same-artifact follow-up. Added derivation tests for query-term batches, artifact-referenced reads, same-artifact edit follow-up, and tied-query ambiguity suppression. In the validation session, the `rg "exploration-session-graph|ExplorationGraph|viewport|graph" ...` batch now parents the three following reads under the search instead of keeping them as turn-level siblings.
- [~] (2026-04-18 16:00 UTC) Graph-mode follow-on — the canvas projection is being generalized from a pure tree into a grouped columnar session graph. Repeated semantic nodes such as identical searches, repeated `read/edit/write path` actions, and files now collapse into one visible node per session-level concept while prompts/turns remain explicit. Added grouped-projection and grouped-layout tests to lock fixed columns plus multi-parent file/action highlighting.
- [~] (2026-04-18 16:10 UTC) Routed grouped Graph edges through dedicated inter-column lanes. Skipped-column edges now use above/below bridge rails instead of dropping vertical segments through node bodies, which fixes the most obvious overlap between turn/search/action/file columns in the live canvas.

## Surprises & Discoveries

- Observation: `backend/analytics/graph/derive-session-graph.ts` currently derives tool and artifact nodes only from assistant `toolCall` blocks; it does not read `toolResult` messages at all.
  Evidence: Current derivation code walks `entry.message.role === "assistant"` blocks and never correlates `toolCall.id` with `toolResult.toolCallId`.

- Observation: The replay contract already contains the information needed for search-result correlation, but it is split across two message shapes.
  Evidence: `contracts/sessions/replay.ts` defines assistant `toolCall` blocks with `id`, and `toolResult` messages with `toolCallId`, `toolName`, and textual `content`.

- Observation: The tree projection already knows about the `influenced_by` and `discovered` enum values, but it does not currently admit those edges into visible parent selection.
  Evidence: `src/lib/exploration-session-graph-view-model.ts` includes both kinds in `edge_kind_priority`, while `classify_tree_edge()` currently accepts only `prompted`, `invoked_tool`, `read|edited|wrote`, `constrained_by`, and `framed_by`.

- Observation: Several explanation helpers already consider `influenced_by` / `discovered` as meaningful upstream relationships, but the current derivation rarely emits them, and artifact-selected insight traces do not yet surface action-targeted influence.
  Evidence: `src/lib/exploration-insight-graph-view-model.ts`, `src/lib/exploration-temporal-view-model.ts`, and `src/lib/exploration-inspector-summaries.ts` all reference these edge kinds.

- Observation: A safe first derivation slice can emit `discovered` more broadly than `influenced_by`.
  Evidence: The implementation now allows multiple searches to surface the same artifact, but it withholds action-targeted `influenced_by` when multiple prior searches tie at the strongest confidence for the same later action.

- Observation: `discovered` should not be treated as a peer primary-path edge for touched artifacts once action-targeted lineage exists.
  Evidence: The Milestone 2 insight update keeps `tool -> artifact` as the primary route step and renders `search -> artifact` discovery as supporting context, which avoids regressing back into a flattened or double-parented explanation.

- Observation: Broadening influence requires local-provenance resets, not only more candidate sources.
  Evidence: In real session `e8c0c10f-6599-4e15-bcdc-8ba1b279857d`, an earlier plan/spec read explicitly mentioned later test files, but the user-visible causal story was still the newer `rg` batch that immediately preceded those reads. The updated scorer therefore lets a qualifying later search reset older artifact-reference candidates unless a newer post-search file action becomes the stronger local cause.

- Observation: `Sync` could still show stale graph parentage unless replay-derived caches were cleared.
  Evidence: `resync_sessions` rebuilt the session list but did not invalidate the in-memory graph cache, so a window reload could continue serving a pre-change `SessionGraphPayload` for up to the graph TTL. `backend/analytics/session-cache.ts` now clears graph and exploration caches during resync.

- Observation: repeated-file behavior exposed a deeper projection mismatch than single-parent artifact parenting alone.
  Evidence: Sessions like `80cbfcab-24a7-473c-ade2-1870d30744f6` need one canonical file node with multiple incoming touch paths, and the same pressure now applies to repeated semantic action nodes such as repeated `write path/to/file` calls across turns. The grouped columnar projection addresses this without adding a new UI mode.

## Decision Log

- Decision: Phase 1 is restricted to same-turn lineage from `search_query` nodes to later file-touching actions in the same `assistant_turn`.
  Rationale: This is the user-visible gap in the current graph and is the safest high-value place to add causal inference without inventing broad speculative links.
  Date/Author: 2026-04-18 / pi

- Decision: Phase 1 will prefer action-targeted `influenced_by` edges (`search_query -> tool_call`) over artifact-targeted `influenced_by` edges.
  Rationale: The core user question is "why did the agent perform this read/edit/write?"; action-targeted influence preserves the existing action -> artifact distinction and makes the visible chain more precise.
  Date/Author: 2026-04-18 / pi

- Decision: Phase 1 will emit `discovered` edges only for artifacts already touched in the session graph, not for every raw search result hit.
  Rationale: The immediate goal is explanation for observed reads/edits/writes, not materializing a large second artifact population made only of unvisited search hits.
  Date/Author: 2026-04-18 / pi

- Decision: The first rollout should emit only `high` and `medium` confidence discovery/influence edges and should not emit `low` confidence edges.
  Rationale: The graph currently needs trust more than density; speculative weak links would make the new topology feel more connected but less believable.
  Date/Author: 2026-04-18 / pi

- Decision: A newer qualifying same-turn search resets older artifact-reference candidates for primary action attribution.
  Rationale: Users care about the immediate local exploration batch. Older docs/spec reads may mention many paths, but once a later search clearly starts the working set, Ariadne should prefer that newer search unless a still-later file action becomes the stronger local parent.
  Date/Author: 2026-04-18 / pi

- Decision: Search query term affinity is acceptable as a medium-confidence influence signal when the matched term is specific enough.
  Rationale: Exact surfaced-path hits are too narrow for real sessions. Matching a specific query term such as `exploration-session-graph` against later file paths preserves an evidence-backed explanation without collapsing back into pure temporal adjacency.
  Date/Author: 2026-04-18 / pi

- Decision: Graph mode should evolve in place into a grouped columnar DAG rather than adding a second repeated-file-special-case mode.
  Rationale: The user-visible problem is broader than files alone. Prompts/turns should stay explicit, but repeated searches, repeated semantic file actions, and repeated file nodes should collapse into one session-level node per concept while selection highlights the relevant upstream/downstream paths.
  Date/Author: 2026-04-18 / pi

## Outcomes & Retrospective

Current status:
- the problem statement and intended edge semantics are now documented inside the track
- this plan exists to turn that spec into an implementation sequence that can be executed incrementally and validated on real sessions

Success for this plan means:
- graph derivation can emit evidence-backed same-turn `discovered` and `influenced_by` edges
- the full-session Graph view can visually prefer `turn -> search -> read/edit -> artifact` over a flat sibling list when evidence supports it
- ambiguous sessions stay truthful by remaining partially flat rather than over-claiming causal structure

Likely follow-up after completion:
- decide whether to broaden influence inference beyond searches into doc-read, source-read, and instruction-source contributors
- decide whether the same lineage should change Path mode only, Influence mode only, or both more strongly

## Context and orientation

This plan builds on the already-landed full-session graph surface. The graph renderer is no longer the main blocker; the missing piece is graph semantics plus projection rules that make causal lineage visible.

Key files and why they matter:
- `backend/analytics/graph/derive-session-graph.ts` — source-of-truth derivation from replay entries into `SessionGraphPayload`; this is where same-turn lineage edges must be created.
- `contracts/sessions/replay.ts` — replay message contract; defines assistant `toolCall` blocks and `toolResult` messages that must be correlated.
- `contracts/graph/types.ts` — canonical graph enums; already contains `discovered` and `influenced_by`, so this work should activate existing semantics rather than add new edge kinds.
- `src/lib/exploration-session-graph-view-model.ts` — current full-session tree projection; must start preferring causal parentage for tool nodes when supported.
- `src/lib/exploration-insight-graph-view-model.ts` — selection-centered explanation subgraph; needs to treat action-targeted influence as part of the visible explanation path.
- `src/lib/exploration-temporal-view-model.ts` — arrival contributor sets used by Exploration selection modes; already includes these edge kinds and may need only small adjustments once derivation emits them.
- `src/lib/exploration-inspector-summaries.ts` — inspector summaries and arrival-path copy; update only if the current wording hides the newly surfaced lineage.
- `tests/unit/backend/graph-derive.test.ts` — primary derivation test surface.
- `tests/unit/lib/exploration-session-graph-view-model.test.ts` — tree parent/ordering test surface.
- `tests/unit/lib/exploration-insight-graph-view-model.test.ts` — explanation-subgraph test surface.
- `reports/2026-04-18-session-graph-structure-evaluation.md` — spec and rationale for this plan.

Useful repository precedent:
- `backend/qmd-logs/parser.ts` already contains a small helper for extracting text from `toolResult` content; that pattern can be reused or adapted instead of inventing a second parser style.
- `backend/analytics/exploration/derive-exploration.ts` already contains a weaker same-turn `command_led_to_read` relation based mostly on sequencing; it is a useful cautionary baseline, but this plan requires stronger evidence before emitting graph-level causal edges.

## Plan of work

### Milestone 1 — derivation plumbing for same-turn evidence

Add a small, focused lineage-inference layer to `derive-session-graph.ts`.

Work to do:
1. Correlate assistant `toolCall` blocks with later `toolResult` messages using `toolCall.id` and `toolResult.toolCallId`.
2. Preserve enough per-tool metadata during derivation to reason about same-turn order and evidence. If needed, add metadata such as `tool_call_id` to tool/search nodes.
3. Extract search-result text from `toolResult` content blocks in a deterministic helper rather than inline string handling scattered through the derivation.
4. Implement a same-turn inference helper that inspects earlier `search_query` nodes, their result text, and later file-touching tools in the same turn.
5. Emit:
   - `search_query -> artifact` with kind `discovered` when the surfaced artifact match is explicit or strongly unique
   - `search_query -> tool_call` with kind `influenced_by` when the later action is strongly supported by that search result
6. Keep provenance explicit: `availability: derived_inferred`, strong evidence records, and no low-confidence edges.

Implementation guidance:
- keep the inference helper separate from the node/edge creation loop if `derive-session-graph.ts` starts to become harder to read
- normalize candidate paths through the same path utilities already used for file node IDs
- treat exact normalized-path matches as the strongest signal
- allow uniquely resolvable basename matches only when the evidence is deterministic and explainable

### Milestone 2 — make the new edges change visible explanations

Once the graph emits the new edges, update the projection and explanation layers so users can actually see the lineage.

Work to do:
1. Update `src/lib/exploration-session-graph-view-model.ts` so visible `tool_call` nodes can choose an incoming same-turn `influenced_by` edge as their primary parent before falling back to `assistant_turn -> tool_call`.
2. Keep artifact nodes parented to the action that touched them; the goal is to nest the action under the search, not to skip the action layer.
3. Update `src/lib/exploration-insight-graph-view-model.ts` so selected artifacts can surface the owning tool's incoming `influenced_by` / `discovered` context instead of stopping at `tool -> turn -> prompt` only.
4. Review `src/lib/exploration-temporal-view-model.ts` and `src/lib/exploration-inspector-summaries.ts` after the derivation change. Only expand them if the current copy or contributor tracing fails to reflect the new lineage in a readable way.
5. Keep Path vs Influence semantics distinct. Path may use the chosen primary parent; Influence should remain free to show additional supporting edges.

Implementation guidance:
- do not rely on incidental ordering side effects to choose the causal parent; encode the intended priority explicitly in the tree projection
- keep secondary influence edges available even when the tree chooses only one visible parent
- avoid turning the full-session graph into a generic multi-edge hairball just because the IR becomes richer

### Milestone 3 — validation, ambiguity handling, and closeout decisions

The final milestone proves that the feature is both useful and honest.

Work to do:
1. Add targeted derivation tests for exact-match, uniquely-resolved, ambiguous, and multi-read cases.
2. Add tree-projection tests for causal-parent preference and fallback behavior.
3. Add or update insight/arrival tests if the explanation surface changes.
4. Run focused real-session validation against sessions with:
   - multiple `rg` / `grep` / `find` searches before reads
   - repeated reads of similarly named files
   - ambiguous searches that should remain flat
5. Record any broaden/defer decisions in the plan and track docs before pausing.

A successful Milestone 3 leaves behind not only working code but also a clear answer to this question:
- is same-turn search lineage sufficient for the first ship, or did real-session review reveal the need for broader influence inference immediately?

## Concrete steps

Run from repository root unless noted otherwise.

1. Re-read the current derivation and replay contracts before editing:
   - `read contracts/sessions/replay.ts`
   - `read backend/analytics/graph/derive-session-graph.ts`
   - `read src/lib/exploration-session-graph-view-model.ts`
   - `read src/lib/exploration-insight-graph-view-model.ts`
   - `read src/lib/exploration-inspector-summaries.ts`

2. Search for existing helpers and edge-kind consumers:
   - `rg -n "toolResult|toolCallId|extract_tool_result_text|influenced_by|discovered" backend src tests -S`
   Expected result: replay parsing helpers exist elsewhere, and the graph/explanation layers already know these edge kinds even though derivation rarely emits them.

3. Implement Milestone 1 in small slices:
   - add/borrow a tool-result text extractor
   - add same-turn correlation between search tool calls and tool results
   - add tests in `tests/unit/backend/graph-derive.test.ts`
   - run `bun test tests/unit/backend/graph-derive.test.ts`

4. Implement Milestone 2 in small slices:
   - update tree candidate selection in `src/lib/exploration-session-graph-view-model.ts`
   - update insight/path helpers only as needed to expose the lineage
   - run:
     - `bun test tests/unit/lib/exploration-session-graph-view-model.test.ts`
     - `bun test tests/unit/lib/exploration-insight-graph-view-model.test.ts`
     - `bun test tests/unit/lib/exploration-temporal-view-model.test.ts`
     - `bun test tests/unit/lib/exploration-inspector-summaries.test.ts`

5. Run type checking after the targeted test slices pass:
   - `bun run typecheck`

6. Perform focused product validation using a real Ariadne dev session:
   - `bun run dev`
   - open `/sessions/:id/exploration`
   - switch to `Graph`
   - compare one session with clear search-to-read lineage and one intentionally ambiguous session
   Expected behavior: clear sessions gain `search -> action -> artifact` nesting; ambiguous sessions stay flatter instead of inventing a wrong cause.

7. Before pausing, update this plan's living sections and any affected track docs (`report.md`, `decisions.md`, `tasks.md`) if the implementation reveals a change in scope or direction.

## Validation and acceptance

Code-level validation:
- `bun test tests/unit/backend/graph-derive.test.ts`
- `bun test tests/unit/lib/exploration-session-graph-view-model.test.ts`
- `bun test tests/unit/lib/exploration-insight-graph-view-model.test.ts`
- `bun test tests/unit/lib/exploration-temporal-view-model.test.ts`
- `bun test tests/unit/lib/exploration-inspector-summaries.test.ts`
- `bun run typecheck`

Behavior validation in the app:
- pick a real session where a search visibly precedes one or more reads in the same turn
- verify the graph no longer renders those later reads as only turn-level siblings when the search result clearly surfaced the touched file
- verify repeated/ambiguous searches do not force an obviously wrong causal parent
- verify the left pane and inspector still sync with graph selection after the parentage change
- verify Influence mode and arrival-related summaries still read coherently when new edges exist

Acceptance bar:
- same-turn search lineage changes the graph only when evidence is explicit or strongly unique
- the visible topology can show `turn -> search -> read/edit -> artifact` without removing the action node
- ambiguous cases remain truthful and may stay partially flat
- no new edge kind is added for Phase 1
- the graph still validates against `session_graph_payload_schema`

## Idempotence and recovery

- This work is additive. If the search-result parsing helper lands before the inference logic is trustworthy, it is safe to keep the helper and emit no new edges yet.
- If the derivation starts over-linking, the first rollback step is to tighten emission rules or disable medium-confidence matches before removing the feature entirely.
- If projection updates make the graph harder to read, keep the new graph edges in the IR and temporarily fall back to turn-level parentage while preserving tests for the derivation layer.
- Keep Phase 1 scoped to touched artifacts and same-turn searches; that boundary is the main guardrail against runaway noisy graphs.

## Artifacts and notes

Planning artifacts created or updated for this slice:
- `reports/2026-04-18-session-graph-structure-evaluation.md`
- `exec-plans/active/2026-04-18-session-graph-discovery-lineage.md`

Expected implementation artifacts:
- `backend/analytics/graph/derive-session-graph.ts`
- optional helper extracted near graph derivation if needed
- `src/lib/exploration-session-graph-view-model.ts`
- `src/lib/exploration-insight-graph-view-model.ts`
- possibly `src/lib/exploration-temporal-view-model.ts`
- possibly `src/lib/exploration-inspector-summaries.ts`
- targeted tests under `tests/unit/backend/` and `tests/unit/lib/`

## Interfaces and dependencies

Required completion interfaces:
- `SessionGraphPayload` remains the single graph source of truth.
- `contracts/graph/types.ts` keeps using existing edge kinds `discovered` and `influenced_by`; Phase 1 should not introduce new graph enums.
- `derive_session_graph()` must remain schema-valid and deterministic.
- `project_session_graph_tree()` must still return a single-parent visible topology, but it should be able to choose a causal tool parent when supported.
- `compute_insight_subgraph()` must remain selection-centered and should expose the richer lineage without requiring a full freeform graph renderer.
- replay correlation depends on `toolCall.id` ↔ `toolResult.toolCallId`; if real sessions show missing IDs for some tools, document that limitation explicitly instead of fabricating lineage.
