# Documentation Map

This directory is the system-of-record knowledge base for Ariadne.

Tooling policy: examples and commands in docs should use **Bun** (`bun`, `bun run`, `bunx`).

## Files

| File / Directory | Purpose | Stability |
|---|---|---|
| `ARCHITECTURE.md` | Codemap, technology stack, boundaries, invariants | High — update when structure changes |
| `DESIGN.md` | Detailed design of every subsystem, data flows, decisions | Medium — update when implementations change |
| `information-architecture.md` | Frontend page structure, navigation, layout rules | Medium — update when pages change |
| `knowledge/` | Reference docs for external integrations (QMD, etc.) | Medium — update when APIs change |
| `specs/` | Implementation specs for planned or complex work | Medium — created per feature |
| `exec-plans/` | Active/completed execution plans | Medium — living documents |
| `agents-directory-map.md` | Reference map of the agents pi package repo | Low — external reference |
| `analytics-page-plan.md` | Early planning doc for the analytics foundation | Low — historical |

## Reading Order

| Doc | When to read | What it answers |
|---|---|---|
| `ARCHITECTURE.md` | First time in this repo, or when lost | What's here, where things live, what the technologies are |
| `DESIGN.md` | Before working on any subsystem | How each part works, implementation details, data flow |
| `information-architecture.md` | Before modifying any frontend page or component | Page structure, navigation, layout rules |
| `knowledge/qmd.md` | Before working on QMD integration | QMD capabilities, schema, sidecar protocol |
| `specs/` | When starting medium+ work | Implementation specs for specific features |
