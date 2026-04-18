# Findings

- `src/components/exploration/exploration-view.tsx` already centralizes shared selection in `selected_node_id`, which means the graph rewrite can keep one selection contract across left pane, middle pane, and inspector.
- The current Exploration `Graph` mode is not full-session topology; it is a reduced explanation graph derived from `compute_insight_subgraph()` and laid out by `src/lib/exploration-graph-layout.ts`.
- The left pane is turn/action oriented, not a flat node index. Reverse-sync from graph selection will therefore require expansion and scroll behavior inside `src/components/exploration/exploration-path.tsx`.
- The current middle-pane mode type is already `"map" | "graph"`, which fits an in-place Graph rewrite better than adding a third mode.
- The canonical graph IR already contains the node and edge families needed for a first full-session tree renderer; the immediate gap is renderer projection and interaction design, not backend graph derivation.
- Real-session validation across recent Ariadne sessions showed the new projection and reverse-sync logic are structurally consistent, but dense sessions already produce 4k–8kpx graph sheets. The next bottleneck is viewport/density handling, not selection correctness.
- Because the hidden `session` node is not visually rendered, each `user_prompt` currently becomes a tree root. On multi-turn sessions this yields a prompt forest rather than a single visually unified session trunk, which is truthful but weakens the "whole session" read.
- On a realistic `900 × 680` graph viewport, dense real sessions already fit down to very small initial overview scales (`0.08` on a recent 240-node session, `0.14–0.18` on several 100+ node sessions). The camera layer is now necessary, but density-sensitive rendering remains the next readability constraint.
- The new viewport math held up on sampled real sessions: fitting and selected-node reveal succeeded across all projected nodes in the validation rerun, which means the current Milestone 3 risk is renderer readability/presentation rather than camera correctness.
- Ariadne's theme tokens are stored as full CSS colors (currently OKLCH), not HSL channel tuples. Wrapping them as `hsl(var(--token))` or `hsl(${token})` inside the canvas renderer produces invalid colors and can make session edges render black/invisible against the graph background.
