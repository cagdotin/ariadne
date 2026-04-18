# Findings

- `src/components/exploration/exploration-view.tsx` already centralizes shared selection in `selected_node_id`, which means the graph rewrite can keep one selection contract across left pane, middle pane, and inspector.
- The current Exploration `Graph` mode is not full-session topology; it is a reduced explanation graph derived from `compute_insight_subgraph()` and laid out by `src/lib/exploration-graph-layout.ts`.
- The left pane is turn/action oriented, not a flat node index. Reverse-sync from graph selection will therefore require expansion and scroll behavior inside `src/components/exploration/exploration-path.tsx`.
- The current middle-pane mode type is already `"map" | "graph"`, which fits an in-place Graph rewrite better than adding a third mode.
- The canonical graph IR already contains the node and edge families needed for a first full-session tree renderer; the immediate gap is renderer projection and interaction design, not backend graph derivation.
