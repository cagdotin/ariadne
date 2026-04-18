# Session Exploration Graph Track

This track root is the documentation root for the feature. There is no extra `docs/` layer.

## Read first

1. `AGENTS.md` — track workflow, note-taking rules, and update expectations.
2. `summary.md` — current compressed snapshot refreshed by `/track sync`.
3. `tasks.md` — active milestone, next steps, and checklist.
4. `references.md` — smallest useful reading path into specs, artifacts, and code.

## Structure

- `specs/` — design contracts for the feature work.
- `exec-plans/` — active/completed implementation plans.
- `artifacts/` — durable references copied into the track.
- `reports/` — research reports or one-off investigations worth keeping.
- `findings.md` — durable discoveries that are easy to forget.
- `decisions.md` — decisions, rationale, and tradeoffs.
- `report.md` — live status while the track is active.
- `references.md` — curated reading order, not a file inventory.
- `notes/` — vault-style scratch and reasoning notes.

## Reading order for this initiative

### When planning or implementing the visualization

1. `artifacts/session-graph-structure-reference.md`
2. `specs/README.md`
3. `specs/session-graph-tree-visualization/spec.md`
4. `specs/session-graph-tree-visualization/graph-mode-canvas.md`
5. `specs/session-graph-tree-visualization/selection-and-sync.md`
6. `specs/session-graph-tree-visualization/milestones.md`
7. `exec-plans/active/2026-04-18-session-graph-tree-visualization.md`

### When changing the current Exploration implementation

1. `src/components/exploration/exploration-view.tsx`
2. `src/components/exploration/exploration-path.tsx`
3. `src/components/exploration/exploration-graph.tsx`
4. `src/components/exploration/exploration-inspector-v2.tsx`
5. `src/lib/exploration-path-view-model.ts`
6. `contracts/graph/types.ts`
7. `backend/analytics/graph/derive-session-graph.ts`

## Documentation rules for this track

- Prefer replacing stale guidance over layering a new story on top of the old one.
- Keep screenshot references local to the track so future agents do not depend on temp paths.
- Specs should capture intent and constraints; plans should capture sequencing and verification.
- If the implementation direction changes, update `decisions.md`, `tasks.md`, `report.md`, and the relevant spec/plan in the same workstream.
