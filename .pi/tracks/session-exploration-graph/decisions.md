# Decisions

- 2026-04-18 — The track root is now the documentation root for this feature. Nested `docs/` organization under the track is being removed in favor of `README.md`, `specs/`, `exec-plans/`, and root-level track notes.
- 2026-04-18 — Exploration `Graph` mode will be rewritten in place. Ariadne keeps `Map` and `Graph`; it does not add a third middle-pane mode for this feature.
- 2026-04-18 — qgto screenshots remain as visual references only. Ariadne will not copy their transcript panel, timestamp treatment, keyboard/status chrome, or explicit color palette into the spec.
- 2026-04-18 — The new graph feature must preserve two-way binding with Ariadne's existing left pane and inspector rather than introducing graph-local detail surfaces.
