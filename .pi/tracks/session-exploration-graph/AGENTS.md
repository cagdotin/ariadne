# Track: session-exploration-graph

## Purpose

Visualize how AI explores the codebase with each prompt — solidify the session details/exploration feature to show how changing prompts, docs, AGENTS.md, etc. changes agent behavior patterns across the codebase.

## Read this first

1. `README.md` — track-level documentation map and reading order.
2. `summary.md` — current compressed snapshot.
3. `tasks.md` — active tasks, milestones, and next steps.
4. `references.md` — curated reading path when more context is needed.

## File guide

- `README.md` — documentation map for this track.
- `summary.md` — deterministic snapshot refreshed by `/track sync`.
- `tasks.md` — active tasks, milestones, next steps, and checklist items.
- `references.md` — task-specific reading path, not a file inventory.
- `findings.md` — durable non-obvious discoveries.
- `decisions.md` — decisions with rationale and tradeoffs.
- `report.md` — live report; keep it current while working.
- `specs/` — feature specs owned by this track.
- `exec-plans/` — active/completed plans for implementation work.
- `reports/` — investigations or research outputs worth keeping.
- `notes/` — **use vault methodology** (see below) for note-taking.
- `artifacts/` — outputs worth keeping with the track.

## Update rules

- Tracks can span multiple sessions and milestones; do not treat one completed subtask as automatic grounds for closure.
- Keep `summary.md` compressed and let `/track sync` regenerate it.
- Replace stale text instead of appending endless history.
- Put only durable discoveries in `findings.md` and `decisions.md`.
- Keep `report.md` current while the workstream is active; do not save all useful context for the end.

## Note-taking methodology

Notes under `notes/` follow the methodology from `/Users/cgn/git/dev/0xcgn/vault` (see vault `AGENTS.md`).

Key principles:
- **Prose-as-title** — titles that work as claims or descriptions, not topic labels.
- **Descriptions are retrieval filters** — help decide whether to open the note, don't just summarize.
- **Show reasoning** — use connective words (because, but, therefore). Acknowledge uncertainty.
- **Every note must be findable** — clear title, description that adds filtering value, linked from related notes.
- **Dangling links are cheap and valuable** — name ideas even before writing them up.
- **Discovery-first** — before creating any note, ask: does the title communicate the argument? Does the description add value? Can it be found by following links?
- **If it won't exist next session, write it down now.**

## Key artifacts

- `artifacts/session-graph-structure-reference.md` — canonical spec for the graph IR that powers session exploration.
- `specs/session-graph-tree-visualization/references/` — stable local screenshot references for the graph/tree visualization work.

## Closeout rules

Close the track only when the broader workstream is actually complete, abandoned, or superseded.
Before closing the track:
- refresh the snapshot with `/track sync`
- make sure `report.md` reflects the outcome
- then run `/track end`
