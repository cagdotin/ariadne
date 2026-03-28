# Documentation Map

This directory is the system-of-record knowledge base for Ariadne.

Tooling policy: examples and commands in docs should use **Bun** (`bun`, `bun run`, `bunx`).

When updating, reorganizing, or cleaning documentation, read `documentation-maintenance.md` before editing the owning doc.

## Files

| File / Directory | Purpose | Stability |
|---|---|---|
| `ARCHITECTURE.md` | System shape, subsystem boundaries, major entry points, and invariants | High — update when structure changes |
| `DESIGN.md` | Rationale, important flows, and non-obvious design decisions | Medium — update when design decisions or important flows change |
| `information-architecture.md` | Frontend page structure, navigation, route ownership, layout rules | Medium — update when pages or routes change |
| `documentation-maintenance.md` | Rules and recipe for contributing to docs and keeping them clean | High — update when documentation process changes |
| `knowledge/` | Current integration/reference docs (QMD, etc.) | Medium — update when contracts or operational behavior change |
| `specs/` | Feature specs and decision records; `specs/rebuild/` is historical rebuild material | Medium — update when planning starts, scope changes, or shipped status changes |
| `exec-plans/` | Workstream state split into `active/`, `pending/`, and `completed/` | Medium — keep status and placement aligned with reality |
| `agents-directory-map.md` | Reference map of the agents pi package repo | Low — external reference |
| `analytics-page-plan.md` | Early planning doc for the analytics foundation | Low — historical |

## Reading Order

| Doc | When to read | What it answers |
|---|---|---|
| `ARCHITECTURE.md` | First time in this repo, or when lost | What the major subsystems are, how they connect, and where to start |
| `DESIGN.md` | Before working on any subsystem | Why the subsystem is shaped this way and which flows are non-obvious |
| `information-architecture.md` | Before modifying any frontend page or route | Page structure, navigation, route ownership, layout rules |
| `documentation-maintenance.md` | Before adding, rewriting, or reorganizing docs | What belongs where, how to keep docs trustworthy |
| `knowledge/qmd.md` | Before working on QMD integration | Current QMD integration model, constraints, and gotchas |
| `specs/` | When starting medium+ work | Implementation specs for specific features |
