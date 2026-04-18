# Canvas viewport slice validation

Date: 2026-04-18
Track: `session-exploration-graph`
Related:
- `specs/session-graph-tree-visualization/milestone-3-canvas-viewport-and-density.md`
- `exec-plans/active/2026-04-18-session-graph-tree-visualization.md`
- `reports/2026-04-18-real-session-validation.md`

## Purpose

Validate the first Milestone 3 implementation slice after introducing:
- an explicit graph viewport model
- a canvas-oriented graph renderer
- selected-node reveal behavior on top of the existing shared-selection contract

This pass focused on two questions:
1. Does the viewport math behave correctly on real Ariadne session layouts?
2. Does the new camera layer meaningfully address the old scroll-sheet bottleneck without changing graph truth?

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
import { fit_graph_viewport, reveal_world_rect, is_world_rect_visible } from "./src/lib/exploration-graph-viewport.ts";

const viewport_size = { width: 900, height: 680 };
const sessions = (await get_all_sessions(null, 3650))
  .filter((session) => session.project_path === process.cwd())
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
  const layout = compute_session_graph_layout(tree, null);
  const bounds = { x: 0, y: 0, width: layout.width, height: layout.height };
  const fitted = fit_graph_viewport(bounds, viewport_size);

  let reveal_failures = 0;
  for (const node of layout.nodes) {
    const node_bounds = { x: node.x, y: node.y, width: 190, height: 38 };
    const revealed = reveal_world_rect(fitted, node_bounds, bounds, viewport_size, 72);
    if (!is_world_rect_visible(revealed, node_bounds, viewport_size, 72)) {
      reveal_failures += 1;
    }
  }

  console.log(JSON.stringify({
    session: session.id.slice(0, 8),
    nodes: tree.nodes.length,
    edges: tree.edges.length,
    layout: `${layout.width}x${layout.height}`,
    fit_scale: Number(fitted.scale.toFixed(3)),
    reveal_failures,
  }));
}
'
```

Assumed viewport size for the pass: `900 × 680`, which approximates a realistic Ariadne middle-pane graph surface after the side panes are open.

## Session sample

| Session | Projected tree nodes | Tree edges | Layout size | Initial fit scale | Reveal failures |
| --- | ---: | ---: | --- | ---: | ---: |
| `e8c0c10f…` | 103 | 101 | `976 × 3488` | `0.177` | 0 |
| `d1bd7152…` | 39 | 37 | `976 × 1166` | `0.528` | 0 |
| `b709ea50…` | 66 | 62 | `976 × 2948` | `0.209` | 0 |
| `8d2e109e…` | 240 | 230 | `976 × 9374` | `0.080` | 0 |
| `f34317d5…` | 44 | 42 | `976 × 1328` | `0.464` | 0 |
| `80cbfcab…` | 122 | 118 | `976 × 4406` | `0.140` | 0 |
| `532089f2…` | 128 | 126 | `976 × 4244` | `0.145` | 0 |
| `6daf948b…` | 56 | 50 | `976 × 1868` | `0.330` | 0 |

## Results

### Viewport math held up on real layouts

Across the sample:
- `fit_graph_viewport(...)` produced a valid initial camera state for every real session layout
- `reveal_world_rect(...)` successfully made every projected node visible from the initial fitted viewport
- no reveal failures were observed across the sampled real sessions

That gives the canvas slice a solid math baseline before adding richer camera polish.

### The surface now behaves like a camera, not only a sheet

The largest sampled session in this rerun (`240` projected nodes, `9374px` layout height) still proves that the raw layout itself is tall.

The important change is that the user no longer has to treat that layout as a literal DOM document:
- the graph now fits into a bounded viewport
- navigation can happen via pan/zoom
- shared selection can reveal offscreen nodes without changing graph truth

So the bottleneck has shifted again:
- **layout density is still real**
- but **camera behavior is now present**, which was the missing product capability after Milestone 2

### Fit-scale numbers show why density-sensitive rendering matters next

The dense-session initial fit scales are already small:
- `0.177`
- `0.145`
- `0.140`
- `0.080`

That confirms the next follow-up should focus on:
- lower-zoom topology readability
- compact glyph treatment versus full labels
- session-level grouping/prompt-forest treatment

## Validation notes

### Unit / targeted code validation

Passed:
- `bun test tests/unit/lib/exploration-graph-viewport.test.ts tests/unit/lib/exploration-session-graph-view-model.test.ts tests/unit/lib/exploration-session-graph-layout.test.ts tests/unit/lib/exploration-path-view-model.test.ts`

### Typecheck status

Passed:
- `bun run typecheck`

## Implications for the next slice

1. The first Milestone 3 slice is worth keeping: the graph now has a real camera layer and a canvas-oriented rendering path.
2. The next refinement work should focus on density-sensitive presentation rather than reverting to DOM-sheet polish.
3. Session-level grouping is still open; the camera layer helps, but multi-turn prompt forests still need a clearer whole-session read.
