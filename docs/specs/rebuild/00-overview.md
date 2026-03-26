# Ariadne — Rebuild Specification: Overview

> **Version**: 1.0 — 2026-03-26
>
> This is the master index for the Ariadne rebuild specification. It is split into
> multiple files so each can be handed to an agent or developer independently.

## What is Ariadne?

Ariadne is a **desktop observation layer for AI coding agents**. Named after the mythological figure who gave Theseus the thread to navigate the Minotaur's labyrinth — Ariadne gives developers the thread to navigate what their agents are actually doing across complex codebases.

It is a **read-only** tool. It never modifies agent session data. It parses, aggregates, and visualizes.

### Core capabilities

1. **Session Analytics** — Parses JSONL session logs from the [pi](https://github.com/mariozechner/pi-coding-agent) coding agent, extracts cost, token, tool, model, and file activity data, and aggregates across projects.
2. **Session Replay** — Renders full conversation trees with branching, tool calls, thinking blocks, compactions, model changes, and raw JSON inspection.
3. **Project Analytics** — Per-project drill-downs into file hotspots, directory activity, tool distribution.
4. **Usage Analytics** — Cross-project tool/model/cost/time-pattern breakdowns.
5. **QMD Integration** — Full GUI for managing [QMD](https://github.com/tobilu/qmd) semantic search indexes, collections, contexts, file inclusion, and hybrid search.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                  React Frontend (Webview)                │
│  Vite · React 19 · TanStack Router · Tailwind v4       │
│  shadcn/ui · Recharts · Zod · react-markdown            │
└────────────────────────┬────────────────────────────────┘
                         │ Tauri IPC (invoke)
┌────────────────────────┴────────────────────────────────┐
│                  Rust Backend (Tauri v2)                 │
│  Session parser · In-memory cache · Sidecar manager     │
│  Direct SQLite reads (rusqlite) · Tauri commands        │
└──────────┬─────────────────────────────┬────────────────┘
           │                             │
    ┌──────▼──────┐               ┌──────▼──────┐
    │  JSONL Files │               │ QMD Sidecar │
    │  (read-only) │               │ (Bun/TS)    │
    │  ~/.pi/agent │               │ JSON-RPC    │
    │  /sessions/  │               │ via stdio   │
    └─────────────┘               └──────┬──────┘
                                         │
                                  ┌──────▼──────┐
                                  │ QMD SQLite  │
                                  │ databases   │
                                  └─────────────┘
```

## Spec Files Index

| # | File | Description |
|---|---|---|
| 00 | `00-overview.md` | This file — project overview, architecture, invariants |
| 01 | `01-project-setup.md` | Toolchain, dependencies, configuration files, project scaffolding |
| 02 | `02-rust-backend.md` | Complete Rust backend: models, parser, cache, sidecar, commands |
| 03 | `03-qmd-sidecar.md` | QMD bridge sidecar process (TypeScript/Bun) |
| 04 | `04-frontend-foundation.md` | React app shell, routing, layout, theme, shared components |
| 05 | `05-frontend-schemas-api.md` | Zod schemas and Tauri IPC wrappers |
| 06 | `06-frontend-pages.md` | All page components with exact behavior |
| 07 | `07-session-viewer.md` | Session replay viewer subsystem (~2000 LOC) |
| 08 | `08-frontend-components.md` | All custom components (charts, tables, QMD UI) |
| 09 | `09-styling.md` | Complete CSS, theme system, design tokens |

## Invariants (Must Hold at All Times)

1. **Bun only.** Use `bun`, `bun run`, `bunx` everywhere. Never npm/npx/yarn/pnpm.
2. **Read-only observation.** Ariadne never writes to `~/.pi/agent/sessions/`. Pure observation.
3. **Zod at the IPC boundary.** Every Tauri command response is validated with Zod before use in the frontend.
4. **Rust models mirror frontend schemas.** `models/*.rs` structs and `schemas/*.ts` Zod types must stay in sync. Both use `snake_case` field names.
5. **Single sidecar process.** Only one QMD sidecar runs at a time. Switches indexes via `switch_index`.
6. **QMD reads in read-only mode.** Rust opens QMD SQLite with `SQLITE_OPEN_READ_ONLY`.
7. **Naming conventions:** Files/folders → `kebab-case`. Functions/variables → `snake_case`. Types/classes → `CamelCase`.

## Prerequisites

- **Rust** (2021 edition) + Cargo
- **Bun** (latest)
- **Tauri CLI v2** (`bun install -g @tauri-apps/cli`)
- **macOS** (primary target; uses WebKit webview, Homebrew SQLite patch)
- **pi coding agent** installed with session data at `~/.pi/agent/sessions/`
- **QMD** (optional — for semantic search features)
