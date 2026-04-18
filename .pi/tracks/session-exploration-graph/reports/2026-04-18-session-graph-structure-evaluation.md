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
