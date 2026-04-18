# Real-session validation for the session graph/tree rewrite

Date: 2026-04-18
Track: `session-exploration-graph`
Related:
- `specs/session-graph-tree-visualization/spec.md`
- `specs/session-graph-tree-visualization/milestone-3-canvas-viewport-and-density.md`
- `exec-plans/active/2026-04-18-session-graph-tree-visualization.md`

## Purpose

Validate the Milestone 1 + Milestone 2 implementation against actual Ariadne session data rather than only synthetic unit fixtures.

This pass focused on two questions:
1. Does the current full-session projection remain internally consistent on real sessions?
2. What does real-session density tell us about the next renderer phase?

## Validation method

Run from repository root:

```bash
bun -e '
import { get_all_sessions } from "./backend/analytics/query.ts";
import { get_session_entries } from "./backend/analytics/replay-loader.ts";
import { derive_session_graph } from "./backend/analytics/graph/derive-session-graph.ts";
import { augment_repo_context } from "./backend/analytics/graph/augment-repo-context.ts";
import { project_session_graph_tree } from "./src/lib/exploration-session-graph-view-model.ts";
import { compute_session_graph_layout } from "./src/lib/exploration-session-graph-layout.ts";
import { compute_path_turns, resolve_path_selection_target } from "./src/lib/exploration-path-view-model.ts";

const sessions = (await get_all_sessions(null, 3650))
  .filter((s)=>s.project_path === process.cwd())
  .slice(0, 8);

for (const session of sessions) {
  const { entries, header } = await get_session_entries(session.id);
  const graph = derive_session_graph(session.id, entries, header);
  augment_repo_context(graph);
  const tree = project_session_graph_tree(graph, {
    show_ambient: true,
    show_inferred: true,
    show_unexplored: true,
  });
  const path_turns = compute_path_turns(graph);

  for (const node of tree.nodes) {
    resolve_path_selection_target(node.id, path_turns);
    compute_session_graph_layout(tree, node.id);
  }
}
'
```

### Checks applied

- every recent Ariadne session in the sample could derive a graph, full-session tree projection, and layout without errors
- every projected non-framing node resolved to a left-pane row target
- every projected artifact node resolved back to the same owning tool/action chosen as its tree parent
- every projected node could be passed into `compute_session_graph_layout(tree, selected_node_id)` without selection-path failures

## Session sample

The sample used the 8 most recent Ariadne sessions for the current repository path.

| Session | Projected tree nodes | Tree edges | Roots | Turns | Max depth | Layout size |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `b709ea50…` | 66 | 62 | 4 | 3 | 3 | `976 × 2948` |
| `8d2e109e…` | 211 | 202 | 9 | 8 | 3 | `976 × 8186` |
| `f34317d5…` | 44 | 42 | 2 | 1 | 3 | `976 × 1328` |
| `80cbfcab…` | 42 | 39 | 3 | 2 | 3 | `976 × 1544` |
| `532089f2…` | 128 | 126 | 2 | 1 | 3 | `976 × 4244` |
| `6daf948b…` | 56 | 50 | 6 | 5 | 3 | `976 × 1868` |
| `64789638…` | 31 | 28 | 3 | 2 | 3 | `976 × 950` |
| `11b881be…` | 5 | 3 | 2 | 1 | 2 | `730 × 194` |

## Results

### Correctness checks passed

Across the sample:
- projected non-framing nodes without a left-pane mapping: `0`
- artifact-parent mismatches between the tree projection and reverse-sync mapping: `0`
- layout selection failures: `0`

This validates that the current projection and reverse-sync logic are structurally consistent on real session data, including sessions with repeated file touches.

### Density concerns were confirmed

The current renderer is correct, but real sessions show that the current SVG + positioned-DOM surface is only a stepping stone:

- the largest sampled implementation session projected to **211 nodes / 202 edges**
- that session produced a surface height of **8186px**
- another dense planning session projected to **128 nodes / 126 edges** and still reached **4244px** in height

This means the current graph becomes a very tall scroll sheet rather than a camera-like navigable surface on dense sessions.

### Root proliferation is part of that density problem

Because the hidden `session` node is not rendered, each `user_prompt` becomes a root in the projected tree. On the large implementation session, the graph had:
- 8 prompt roots
- 1 framing root
- total roots: **9**

That produces a vertically stacked forest rather than a single session trunk. The projection is truthful, but the current presentation under-communicates the "whole session" feeling on larger sessions.

## Implications for the next phase

The validation pass supports two conclusions:

1. **Do not back out the current Milestone 1 + 2 implementation.**
   The projection, selection path, and reverse-sync logic held up on real data.

2. **The next phase should be a viewported graph surface, not more DOM-sheet polish.**
   The main issue is no longer basic correctness; it is navigability and density under real-session scale.

That is why the next focused spec moves toward an actual canvas-oriented graph/tree surface with pan/zoom and selection centering.

## Deferred items to validate during the next phase

- whether the large-session forest should gain an implicit visual session spine or another grouping treatment
- whether selected-node auto-centering should trigger on every left-pane selection or only when the node is offscreen
- whether the first actual canvas renderer should be fully canvas-drawn or hybrid (canvas bulk layer + minimal DOM overlay for active state)
