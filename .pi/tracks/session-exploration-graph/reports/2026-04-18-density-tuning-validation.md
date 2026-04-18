# Density tuning validation

Date: 2026-04-18
Track: `session-exploration-graph`
Related:
- `specs/session-graph-tree-visualization/milestone-3-canvas-viewport-and-density.md`
- `exec-plans/active/2026-04-18-session-graph-tree-visualization.md`
- `reports/2026-04-18-canvas-viewport-validation.md`

## Purpose

Validate the first focused tuning pass after the initial density-aware renderer landed.

This pass asked:
1. Do the zoom-band thresholds better separate fit-scale overview from readable mid/detail states?
2. Does the tuned renderer reduce low-zoom chrome clutter on real sessions without changing graph truth or selection behavior?
3. After density tuning, does the product still appear to need a session-spine / grouped-root treatment?

## Tuning changes validated in this pass

- raise the `overview` ceiling from `0.20` to `0.30`
- keep `detail` entry at `0.48`
- restrict mid-zoom accent dots to `primary` / `framing` nodes rather than showing them on all non-artifact nodes
- preserve the same layout bounds, hit-testing model, and shared-selection contract

## Validation method

Run from repository root:

```bash
bun -e '
import { get_all_sessions } from "./backend/analytics/query.ts";
import { get_session_entries } from "./backend/analytics/replay-loader.ts";
import { derive_session_graph } from "./backend/analytics/graph/derive-session-graph.ts";
import { augment_repo_context } from "./backend/analytics/graph/augment-repo-context.ts";
import { project_session_graph_tree } from "./src/lib/exploration-session-graph-view-model.ts";
import { compute_session_graph_layout, SESSION_GRAPH_LAYOUT_NODE_WIDTH } from "./src/lib/exploration-session-graph-layout.ts";
import { fit_graph_viewport } from "./src/lib/exploration-graph-viewport.ts";
import { get_graph_zoom_band, should_render_graph_node_label, should_render_graph_node_accent } from "./src/lib/exploration-graph-render-style.ts";

const viewport_size = { width: 900, height: 680 };
const sessions = (await get_all_sessions(null, 3650))
  .filter((session) => session.project_path === process.cwd())
  .slice(0, 30);

const rows = [];
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
  const fitted = fit_graph_viewport(
    { x: 0, y: 0, width: layout.width, height: layout.height },
    viewport_size,
  );
  const screen_width = SESSION_GRAPH_LAYOUT_NODE_WIDTH * fitted.scale;

  let labels = 0;
  let accents = 0;
  let prompt_labels = 0;
  let turn_labels = 0;

  for (const node of layout.nodes) {
    if (
      should_render_graph_node_label({
        scale: fitted.scale,
        screen_width,
        kind: node.kind,
        role: node.role,
        is_selected: false,
        is_on_selected_path: false,
      })
    ) {
      labels += 1;
      if (node.kind === "user_prompt") prompt_labels += 1;
      if (node.kind === "assistant_turn") turn_labels += 1;
    }

    if (
      should_render_graph_node_accent({
        scale: fitted.scale,
        screen_width,
        kind: node.kind,
        role: node.role,
        is_selected: false,
        is_on_selected_path: false,
      })
    ) {
      accents += 1;
    }
  }

  rows.push({
    session: session.id.slice(0, 8),
    nodes: tree.nodes.length,
    fit_scale: Number(fitted.scale.toFixed(3)),
    zoom_band: get_graph_zoom_band(fitted.scale),
    labels,
    prompt_labels,
    turn_labels,
    accents,
  });
}

rows.sort((a, b) => a.fit_scale - b.fit_scale || b.nodes - a.nodes);
console.table(rows);
'
```

## Sample highlights

| Session | Nodes | Fit scale | Zoom band | Labels at fit | Prompt labels | Turn labels | Accents at fit |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `2a3d05f8…` | 423 | `0.080` | overview | 0 | 0 | 0 | 0 |
| `1043476e…` | 97 | `0.185` | overview | 0 | 0 | 0 | 0 |
| `61c7b647…` | 67 | `0.230` | overview | 0 | 0 | 0 | 0 |
| `0c2a4d0b…` | 69 | `0.274` | overview | 0 | 0 | 0 | 0 |
| `6daf948b…` | 56 | `0.330` | mid | 10 | 5 | 5 | 12 |
| `f34317d5…` | 44 | `0.464` | mid | 4 | 1 | 1 | 4 |
| `850b7996…` | 27 | `0.505` | detail | 25 | 2 | 2 | 27 |
| `d1bd7152…` | 39 | `0.528` | detail | 23 | 1 | 1 | 39 |

## Results

### The overview threshold now catches the ambiguous 60–70 node fit-scale cases

Before tuning, sessions around `0.21–0.27` were already in `mid` zoom, which produced large numbers of accent dots but still showed zero labels.

After tuning:
- `0.209`, `0.230`, `0.268`, and `0.274` all remain in `overview`
- those fit-scale sessions now render as pure topology-first overviews with no label or accent clutter

That is a better match for what the graph can honestly communicate at those scales.

### Mid zoom now reads as a prompt/turn layer instead of an everything layer

For the first genuinely readable fit-scale mid session in the sample (`56` nodes at `0.330`):
- labels appear only on prompts and turns (`10` total)
- accent dots are similarly constrained (`12` total)
- tools and artifacts no longer compete for equal salience at that zoom

That makes the overview-to-mid transition feel more intentional.

### Detail mode still arrives soon enough for small sessions

Small sessions in the `27–39` node range still cross into `detail` around `0.50+`, which keeps the graph usefully legible when there is enough space to support more labels.

The current tuning therefore keeps:
- **overview** for dense and borderline-medium sessions
- **mid** for prompt/turn-readable medium sessions
- **detail** for genuinely small sessions

## Assessment of session-spine / grouped-root follow-up

After this tuning pass, session-level grouping still looks useful — but it no longer looks like the urgent fix.

What changed:
- the main low-zoom readability problem is materially reduced
- the graph now communicates structure more honestly at fit scale

What remains:
- multi-turn sessions still present as a forest of prompt-root branches
- the graph is truthful, but the "this is one session" read is still weaker than it could be

Recommendation after this pass:
- **yes, a light session-level grouping treatment still seems worthwhile**
- but it should ship as a subtle presentation aid, not as a fake parent node or graph-truth rewrite

Preferred next experiment:
- a faint grouped-root rail / session spine behind prompt roots
- only when there are multiple prompt roots
- likely most valuable in overview and mid zoom
- avoid introducing a clickable synthetic session card unless later evidence shows it is necessary

## Validation notes

Passed:
- `bun run typecheck`
- `bun test tests/unit/lib/exploration-graph-render-style.test.ts tests/unit/lib/exploration-graph-viewport.test.ts tests/unit/lib/exploration-session-graph-view-model.test.ts tests/unit/lib/exploration-session-graph-layout.test.ts tests/unit/lib/exploration-path-view-model.test.ts`

## Conclusion

The focused tuning pass improved fit-scale behavior enough that the next conversation can move from "the graph is too noisy" to "how much session-level grouping polish is actually needed?"

My current read is:
- density tuning was necessary first and was the right order
- a session spine / grouped-root treatment is still probably valuable
- but it should now be treated as a subtle polish layer rather than as a rescue for unreadable low-zoom behavior
