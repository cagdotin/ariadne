# Session graph structure evaluation — provenance graph is sound, but full-session Graph mode overexposes scaffolding

Date: 2026-04-18
Track: `session-exploration-graph`
Related:
- `artifacts/session-graph-structure-reference.md`
- `backend/analytics/graph/derive-session-graph.ts`
- `contracts/graph/types.ts`
- `src/lib/exploration-session-graph-view-model.ts`
- `src/lib/exploration-insight-graph-view-model.ts`
- `src/components/exploration/exploration-graph.tsx`

## Purpose

Evaluate whether the current session graph data structure actually matches the user-facing problem the Exploration Graph is trying to solve.

The immediate trigger was a real UI read where:
- `Turn 1` and the user prompt feel like near-duplicate nodes
- `read: filename.tsx` and `filename.tsx` feel like near-duplicate nodes

The question was not only whether the rendering is noisy, but whether the underlying graph model itself is conceptually right.

## Inputs reviewed

- canonical graph reference in `artifacts/session-graph-structure-reference.md`
- graph schemas in `contracts/graph/types.ts`
- replay derivation in `backend/analytics/graph/derive-session-graph.ts`
- graph → exploration projection in `contracts/graph/graph-to-exploration-adapter.ts`
- current full-session Graph mode projection in `src/lib/exploration-session-graph-view-model.ts`
- current Graph mode renderer in `src/components/exploration/exploration-graph.tsx`
- selection-centered explanation graph logic in `src/lib/exploration-insight-graph-view-model.ts`

## Conclusion

The current graph IR is mostly reasonable as a **provenance graph**, but the current full-session Graph mode is exposing too much of that low-level scaffolding as first-class visible topology.

In other words:
- the **IR mostly makes sense**
- the **current Graph view projection often does not**

## What currently makes sense

### 1. Tool calls and files are not the same thing in the IR

The model currently treats:
- `tool_call` / `search_query` as **events**
- `source_file` / `doc_file` / `agents_doc` as **artifacts**

That distinction is valid and useful because it preserves:
- invocation order via `turn_index` and `tool_index`
- the difference between `read`, `edited`, and `wrote`
- repeated access to the same artifact across turns
- evidence and provenance for each observed action

So `read: exploration-graph.tsx` and `exploration-graph.tsx` should **not** literally collapse to one canonical node in the IR.

### 2. File/doc deduplication is a good property of the current model

The derivation already deduplicates artifacts by path, so repeated reads/edits point to the same file/doc node. That is the right identity rule for artifacts.

### 3. Availability / confidence / evidence are strong parts of the design

The IR's provenance system is one of the best parts of the structure. Observed vs ambient vs inferred vs unavailable is a real product need and should be preserved.

## Where the current structure becomes weak

### 1. `assistant_turn` is currently more of a grouping shim than a meaningful visible node

In `derive-session-graph.ts` the `assistant_turn` node is effectively:
- label: `Turn N`
- metadata: `{ turn_index }`
- purpose: group tool calls for that turn

That means it often has much less standalone meaning than the `user_prompt` node sitting next to it. In the visible graph, `User: ...` and `Turn 1` therefore read as two copies of almost the same idea.

This does not make `assistant_turn` wrong in the IR, but it does make it a weak candidate for equal visual prominence.

### 2. Tool-call labels currently mirror artifact labels too closely

For file-touching tools the label is built as:
- `read: basename(file)`
- `edit: basename(file)`
- `write: basename(file)`

The artifact node label is then also:
- `basename(file)`

So the graph shows an event node and an artifact node whose labels differ only by a small verb prefix. The model distinction is real, but the visible topology makes them feel duplicated.

### 3. The current Graph mode uses a full-session topology projection, not the stronger insight graph already available

The current middle-pane Graph mode is driven by:
- `src/lib/exploration-session-graph-view-model.ts`
- `src/components/exploration/exploration-graph.tsx`

That path renders a full-session projected topology.

But the codebase also already contains:
- `src/lib/exploration-insight-graph-view-model.ts`

That model is closer to the product need because it classifies nodes/edges as:
- `primary_path`
- `supporting`
- `structural_ref`
- `downstream`

So the repository already has a more explanation-oriented abstraction, but the visible Graph mode is currently showing the broader session topology instead.

### 4. The visible Graph mode is a tree projection of a graph IR

`project_session_graph_tree()` chooses one parent edge per visible node. That makes the renderer simpler, but it means the current topology is already a lossy projection.

So the current experience pays the complexity cost of a rich event/artifact graph while still simplifying it into a tree that overexposes scaffolding and underexplains multi-cause relationships.

## Recommended interpretation

### The graph IR should be treated as a canonical provenance layer

Keep the distinction between:
- narrative/event nodes: prompt, turn, tool, search
- artifact/context nodes: files, docs, instructions, framing

That separation is useful for traceability and inspector explanations.

### The user-facing Graph mode should not treat all IR nodes as peer topology cards

The current rendering makes too many intermediate nodes look like primary content.

A better rule is:
- keep event nodes in the IR
- show them only when they materially explain the current question
- otherwise let artifact nodes dominate the visible graph

## Recommended direction

### Low-risk direction

Keep the IR largely intact, but change the projection strategy:

1. Prefer the selection-centered insight graph in Graph mode when a node is selected
2. Treat full-session topology as a secondary or debug-oriented mode, not the main explanation view
3. Demote or suppress `assistant_turn` from the visible graph unless it is the selected anchor
4. Demote or suppress `tool_call` nodes unless they are required to explain provenance
5. Preserve tool/action detail in the left pane and inspector, where operational sequencing reads more naturally

### Higher-change direction

If the graph contract is revisited more deeply, consider replacing the current `user_prompt` + `assistant_turn` pairing with a single first-class `turn` node that owns:
- user text
- turn index
- grouped tool activity
- optional assistant summary/outcome if later needed

That would reduce one major source of visible duplication.

## Practical verdict

### Keep
- separate event vs artifact identity in the graph IR
- file/doc deduplication by canonical path
- provenance metadata: availability, confidence, evidence
- framing/context nodes

### Reconsider
- `assistant_turn` as a peer-visible graph card
- full-session topology as the default Graph-mode projection
- tool labels that visually collapse into artifact labels

## Final summary

The current session graph is better understood as an **internal causal/provenance IR** than as a directly renderable user-facing topology.

The main problem is not that the model distinguishes tools from files; that distinction is valid. The main problem is that the current Graph mode renders too much of the IR's explanatory scaffolding as if it were primary topology.

That is why the graph currently feels duplicated even where the underlying node identities are technically correct.

---

## Follow-on spec — discovery lineage and inferred causal influence

Status: Proposed
Date: 2026-04-18
Builds on:
- `artifacts/session-graph-structure-reference.md`
- `docs/specs/2026-04-11-session-graph-ir-and-framing.md`
- `docs/specs/2026-04-13-exploration-path-insight-graph.md`
- `docs/exec-plans/pending/2026-04-13-exploration-visualization-rewrite.md`
- current derivation in `backend/analytics/graph/derive-session-graph.ts`
- current projections in `src/lib/exploration-session-graph-view-model.ts` and `src/lib/exploration-insight-graph-view-model.ts`

### Purpose

Define a graph-level and projection-level extension that makes Ariadne answer the question:

> what led the agent to read this file, not just which turn it happened in?

The immediate motivating gap is intra-turn discovery lineage. Today the graph can show:
- `user_prompt -> assistant_turn -> search_query`
- `user_prompt -> assistant_turn -> tool_call(read)`
- `tool_call(read) -> file`

But it does not yet show the missing explanatory chain:
- `user_prompt -> assistant_turn -> search_query -> tool_call(read) -> file`

That missing chain is what makes search/grep/bash discovery actions and later reads feel visually flattened into the same layer.

### 1. Problem statement

The current graph IR preserves chronology and provenance, but it does not yet preserve enough **intra-turn causal lineage** to explain why later file reads happened.

As a result:
- search queries and later reads often appear as siblings under the same turn
- the graph answers **what happened in this turn** better than **what likely caused this action**
- the UI can show arrival order but not the decision trail that led to a specific file read/edit/write
- the full-session tree projection further amplifies this issue because it chooses a single parent and currently prefers the turn scaffold over inferred causal parents

This is not only a rendering issue. It is a graph-semantic gap between:
- **chronology** — the order in which actions happened
- **causal lineage** — which earlier actions materially led to later actions

The spec below defines how to add that missing explanatory layer without collapsing the distinction between events and artifacts.

### 2. Goals

- Preserve the current event/artifact separation in the graph IR
- Make discovery chains legible as:
  - `prompt -> turn -> search -> read -> artifact`
- Distinguish clearly between:
  - observed discovery facts
  - inferred likely causal influence
- Reuse the existing graph contract edge kinds where possible, rather than introducing new node families
- Improve both:
  - graph derivation semantics
  - graph projection behavior
- Keep provenance, availability, confidence, and evidence visible and honest
- Build on top of the current Path / Influence / inspector model rather than replacing it

### 3. Non-goals

- Reconstructing hidden model reasoning or chain-of-thought
- Claiming a perfect, exhaustive causal graph for every action
- Collapsing `tool_call` and `source_file` / `doc_file` identities into one node type
- Making the main graph a free-form many-parent canvas by default
- Adding broad cross-turn causal inference in the first pass
- Emitting weak low-signal causal edges simply to make the graph look more connected

### 4. Core decisions

#### 4.1 Keep the current event vs artifact distinction

The graph must continue to distinguish:
- discovery/action nodes: `search_query`, `tool_call`
- artifact nodes: `source_file`, `doc_file`, `agents_doc`

The issue is not that those are different things. The issue is that the graph does not yet encode enough relationships **between** them.

#### 4.2 Activate existing edge kinds instead of adding new node families

The existing graph contract already defines:
- `discovered`
- `influenced_by`

This work should primarily activate and operationalize those edge kinds rather than introduce a new parallel concept.

#### 4.3 Split the problem into two relationship types

Two different questions must be represented separately:

1. **What did a search surface?**
   - represented by `search_query -> artifact` using `discovered`

2. **What later action did that earlier node likely lead to?**
   - represented by `influencer -> later_action` using `influenced_by`

These are related but not interchangeable.

#### 4.4 Preserve current forward edge direction even for `influenced_by`

Although the name reads like a reverse phrase, current repository usage already treats `influenced_by` as a forward edge:
- `influencer -> influenced_node`

Examples already present in tests and view models follow that convention, e.g.:
- `claude_md -> file_b` with kind `influenced_by`

This spec preserves that directional convention for compatibility and consistency.

### 5. Edge semantics

#### 5.1 `discovered`

**Shape**
- source: `search_query`
- target: `source_file | doc_file | agents_doc | directory` (directory remains future-compatible)

**Meaning**
- this discovery action surfaced this artifact as a candidate during the session

**When to emit**
- when search output or replay-observable search evidence explicitly mentions the target artifact path, or strongly and uniquely identifies it
- initial implementation should prefer touched artifacts that already exist as graph nodes, rather than creating a large population of never-opened search-result nodes

**Provenance expectation**
- typically `availability: derived_inferred`
- `confidence: high` for exact explicit path match
- `confidence: medium` for uniquely resolvable basename/stem-level match
- evidence should cite the search replay entry/tool call and explain the basis of the path match

#### 5.2 `influenced_by`

**Initial preferred shape**
- source: `search_query | tool_call | source_file | doc_file | agents_doc | instruction_source`
- target: primarily `tool_call` in the first implementation pass

**Meaning**
- this earlier node materially influenced the later action

**Why target `tool_call` first**
The user-facing question is usually:
- why did the agent read this file?
- why did the agent edit this file?

That is first a question about an **action**, and only secondarily about an artifact. Modeling the causal edge onto the action node makes the explanation chain more precise:
- `search_query -> tool_call(read x.ts)`
- then `tool_call(read x.ts) -> source_file(x.ts)`

**Compatibility note**
Existing and future artifact-level `influenced_by` edges remain valid for coarser summaries, inspector explanations, or broader influence views. This spec does not ban them. It only says the first rollout should prefer action-targeted influence for discovery lineage.

### 6. Inference scope and sequencing

This should be implemented in phases so the graph becomes more explanatory without becoming noisy or speculative.

#### 6.1 Phase 1 — same-turn discovery lineage

This phase directly addresses the user-visible flattening issue.

Scope:
- same `assistant_turn` only
- search/discovery actions leading to later file/doc reads, edits, or writes in that same turn
- no broad cross-turn inference in the first pass

Primary outputs:
- `search_query -> artifact` via `discovered`
- `search_query -> tool_call` via `influenced_by`

#### 6.2 Phase 2 — broader supporting influence

Only after Phase 1 proves useful and honest, broaden influence inference to other contributor types such as:
- earlier doc reads influencing later edits
- earlier source file reads influencing later edits/writes
- instruction sources and `AGENTS.md` influencing later actions more explicitly

This broader phase should reuse the same `influenced_by` contract and provenance rules, not invent a second causal system.

### 7. Phase 1 inference rules

#### 7.1 Candidate search window

For a target non-search tool call:
- only consider `search_query` nodes in the same `assistant_turn`
- only consider search queries with smaller `tool_index` than the target action
- prefer the nearest prior search queries first, but do not use proximity alone as sufficient evidence

#### 7.2 High-confidence discovery

Emit `discovered(search_query -> artifact)` when:
- the search result output explicitly contains a path that normalizes to the artifact path later touched by the session
- or the output contains a uniquely matching relative path/basename that resolves unambiguously to that touched artifact within the current project and turn context

Recommended treatment:
- `availability: derived_inferred`
- `confidence: high` for exact normalized path match
- `confidence: medium` only when uniqueness is strong and explainable

#### 7.3 High/medium-confidence causal influence from search to action

Emit `influenced_by(search_query -> tool_call)` when:
- the target tool later reads/edits/writes an artifact already linked from that search by `discovered`
- or, if no `discovered` edge is emitted, there is still a strong unique match between the search query/result and the later target artifact

Recommended treatment:
- `availability: derived_inferred`
- `confidence: high` when backed by an exact surfaced-artifact match
- `confidence: medium` for a strong unique match that is still one step more inferential

#### 7.4 What should *not* be emitted in Phase 1

Do **not** emit causal edges when the only signal is:
- simple temporal adjacency
- "this was the last search before the read"
- vague token overlap with multiple plausible candidate files
- ambiguous multi-search scenarios with no deterministic strongest parent

The first implementation should favor under-linking over over-claiming.

### 8. Primary-parent projection rules

The graph IR is allowed to remain multi-edge. The main flattening issue shows up when a tree projection chooses only one visible parent.

To make the visible graph explain discovery lineage better, tree-style projections should adopt a **primary causal parent** rule.

#### 8.1 Tool parent priority

For visible `tool_call` nodes, choose the primary visible parent using this priority:

1. a same-turn incoming `influenced_by` edge from a visible earlier action/search with `confidence: high`
2. a same-turn incoming `influenced_by` edge from a visible earlier action/search with `confidence: medium`
3. the owning `assistant_turn` via `invoked_tool`
4. existing fallback behavior

This changes the visible hierarchy from:
- `turn -> [search, read, read, read]`

toward:
- `turn -> search -> read -> artifact`
- `turn -> search -> read -> artifact`
- `turn -> search -> edit -> artifact`

when the graph actually supports that inference.

#### 8.2 Artifact parent rule

Artifact nodes should continue to prefer the action node that touched them:
- `tool_call(read) -> file`
- `tool_call(edit) -> file`
- `tool_call(write) -> file`

This preserves the action/artifact distinction while allowing the action node itself to be nested under the more explanatory search/discovery parent.

#### 8.3 Multiple possible influences

If multiple incoming `influenced_by` edges exist:
- select one deterministic primary parent for tree layout
- keep the remaining influence edges available for:
  - Influence mode
  - inspector explanations
  - future richer graph layouts

Recommended tie-breakers:
- highest confidence first
- exact surfaced-artifact match over fuzzy match
- nearest prior same-turn search over earlier same-turn search
- deterministic final tie-break by node id / tool index

### 9. Relationship to current visualization modes

#### 9.1 Full-session tree / Graph mode

The current full-session graph projection should stop forcing all tool nodes to be turn-level siblings when a stronger same-turn causal parent exists.

This does **not** require the entire UI to become a freeform graph. It only requires the projection to prefer more explanatory parentage where the graph supports it.

#### 9.2 Insight / selection-centered graph

`src/lib/exploration-insight-graph-view-model.ts` already has the right conceptual direction.

This spec extends that model by making `discovered` and action-targeted `influenced_by` edges first-class explanation edges for:
- primary route construction
- supporting contributor summaries
- clearer arrival-path explanations

#### 9.3 Path vs Influence semantics

Path and Influence should remain distinct, but both should benefit from better lineage.

Recommended interpretation:
- **Path** should remain the cleaner route spine and may use the selected primary parent when tree layout requires one
- **Influence** should surface the wider set of supporting `influenced_by` / `discovered` relationships without pretending they are all equal-strength route steps

### 10. Provenance, evidence, and confidence rules

#### 10.1 Availability

For this feature, the default expectation is:
- `discovered`: `derived_inferred`
- `influenced_by`: `derived_inferred`

Even when the raw search output is present in replay text, the edge itself is still being derived from that text into a structured graph relationship.

#### 10.2 Confidence policy

Recommended initial policy:
- emit only `high` and `medium` confidence discovery/influence edges in the graph payload
- do not emit `low` confidence causal edges in the first rollout

This keeps the graph readable and preserves trust.

#### 10.3 Evidence expectations

Each emitted edge should explain *why it exists*.

Expected evidence sources include:
- the search tool call entry id
- the later tool call entry id
- optionally the replay entry/tool result that contained the surfaced path text
- a human-readable `detail` string such as:
  - `search result explicitly mentioned src/lib/foo.ts`
  - `later read matched uniquely surfaced artifact within same turn`
  - `nearest prior exact-path search result in same turn`

### 11. Error handling and honesty rules

- If search output is unavailable, truncated, or too ambiguous to map confidently, do not emit `discovered`
- If multiple prior searches are equally plausible and no deterministic strongest parent emerges, do not invent a single causal edge just to improve the picture
- Do not let repo augmentation create the appearance that replay observed a discovery path it did not actually observe
- Do not backfill broad cross-turn causal claims in Phase 1
- Prefer a flat but truthful graph over a more satisfying but speculative one

### 12. Implementation surfaces

Primary surfaces expected to change:
- `backend/analytics/graph/derive-session-graph.ts`
  - derive same-turn discovery lineage and causal influence edges
- `contracts/graph/types.ts`
  - no new enum values required, but tests/docs should reflect activated semantics
- `src/lib/exploration-session-graph-view-model.ts`
  - allow `influenced_by` to participate in parent selection for visible action nodes
- `src/lib/exploration-insight-graph-view-model.ts`
  - treat `discovered` and action-targeted `influenced_by` as first-class explanation edges
- `contracts/graph/graph-to-exploration-adapter.ts`
  - update only if downstream consumers need explicit relation mapping or summaries
- tests covering derivation, projection, and inspector/path semantics

A small focused helper module for search-result parsing and same-turn lineage inference is recommended if `derive-session-graph.ts` becomes too dense.

### 13. Testing strategy

#### 13.1 Unit tests — derivation

Add derivation tests that prove:
- exact search result path -> touched artifact emits `discovered`
- search query that surfaced a later-read file emits `influenced_by` onto the read tool
- same-turn ambiguity does not emit a false strong edge
- no edge is emitted from pure temporal adjacency alone
- multiple reads can legitimately share the same influencing search query

#### 13.2 Unit tests — projection/view models

Add projection tests that prove:
- a read tool nests under a search query when a higher-priority `influenced_by` edge exists
- the graph still falls back to `assistant_turn -> tool_call` when no supported influence exists
- artifact arrival explanations include the richer route when discovery lineage exists
- Influence mode can surface secondary influence edges without breaking primary path clarity

#### 13.3 Real-session validation

Validate against real Ariadne development sessions that include:
- multiple `rg` / `grep` / `find` commands before a read
- repeated reads of similar filenames
- ambiguous searches that should remain unlinked
- sessions where the improved topology visibly changes from flat siblings to causal nesting

### 14. Implementation checklist

- [ ] Document `discovered` and active `influenced_by` semantics in the canonical graph reference
- [ ] Add same-turn discovery-lineage inference to graph derivation
- [ ] Emit `discovered` edges only when search-to-artifact evidence is explicit or strongly unique
- [ ] Emit search-to-action `influenced_by` edges only when supported by discovery evidence or strong unique same-turn matching
- [ ] Update tree projection parent selection to prefer primary causal parents over flat turn-level sibling layout
- [ ] Update insight/path summaries to use surfaced-by / likely-led-to wording
- [ ] Add unit tests for derivation, ambiguity handling, and projection behavior
- [ ] Validate with real sessions and screenshots before broadening inference scope

### 15. Open questions

- Do we need a dedicated evidence kind for parsed search-result output, or is `observed_replay` with a detailed explanation sufficient?
- Should the current full-session Graph mode adopt this causal nesting directly, or should the change be introduced first in the selection-centered insight graph?
- When a search surfaces many files but only one is later touched, should untouched surfaced files remain outside the graph in Phase 1?
- Should a future cleanup phase replace `user_prompt + assistant_turn` with a single first-class `turn` node, or is causal nesting enough to solve the current flattening issue?
