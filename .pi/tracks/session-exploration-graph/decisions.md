# Decisions

- 2026-04-18 — The track root is now the documentation root for this feature. Nested `docs/` organization under the track is being removed in favor of `README.md`, `specs/`, `exec-plans/`, and root-level track notes.
- 2026-04-18 — Exploration `Graph` mode will be rewritten in place. Ariadne keeps `Map` and `Graph`; it does not add a third middle-pane mode for this feature.
- 2026-04-18 — qgto screenshots remain as visual references only. Ariadne will not copy their transcript panel, timestamp treatment, keyboard/status chrome, or explicit color palette into the spec.
- 2026-04-18 — The new graph feature must preserve two-way binding with Ariadne's existing left pane and inspector rather than introducing graph-local detail surfaces.
- 2026-04-18 — The current SVG + positioned-DOM graph renderer is a stepping stone, not the intended end-state. After real-session validation, the next planning phase targets a viewported actual-canvas-oriented graph surface so dense sessions do not remain multi-thousand-pixel scroll sheets.
- 2026-04-18 — The first Milestone 3 implementation slice uses a hybrid renderer boundary: the bulk graph is drawn on `<canvas>`, while a minimal DOM overlay is reserved for the active selected-node affordance.
- 2026-04-18 — Selected-node reveal should be conditional rather than always recentering. When selection changes, the camera only moves if the selected node would otherwise sit outside the padded viewport.
