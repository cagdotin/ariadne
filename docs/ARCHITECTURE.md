# ARCHITECTURE

Status: active  
Last updated: 2026-03-28

This document explains Ariadne's **system shape**.

Use it to answer:
- what the major subsystems are
- how data flows through the app
- where important boundaries live
- which invariants are worth protecting

It should **not** mirror the file tree. Agents and contributors can inspect the current tree directly with code tools.

For design rationale, see `docs/DESIGN.md`. For page structure and navigation, see `docs/information-architecture.md`.

---

## Bird's-eye view

Ariadne is a **desktop observation layer for AI coding agents**.

It is a **Tauri v2 application** with:
- a **Rust backend** that discovers and parses pi session logs, aggregates analytics, reads QMD SQLite state, and manages a QMD sidecar process
- a **React frontend** that renders analytics, session replay, QMD management, and QMD logs observability
- a **TypeScript sidecar** that wraps the QMD SDK for mutations, search, progress streaming, and file-level index control

### Current product surfaces

Ariadne currently ships four major surfaces:
- **Overview** — high-level session / cost / token / project pulse
- **Sessions** — browsable session list plus full session replay
- **Usage** — cost, tools, patterns, and scoped file analytics
- **QMD** — index / collection management, search, and QMD CLI observability via `/qmd/logs`

### Core data sources

- **pi session JSONL files** under `~/.pi/agent/sessions/**/*.jsonl`
- **QMD SQLite indexes** under `~/.cache/qmd/*.sqlite`
- **filesystem paths** referenced by QMD collections and file analytics

---

## Runtime model

```text
React frontend
  -> calls typed IPC wrappers
  -> validates responses with Zod
  -> renders route surfaces and interaction state

Rust backend
  -> discovers and parses session logs
  -> aggregates analytics in memory
  -> serves session replay payloads
  -> reads QMD SQLite directly for dashboard/state reads
  -> manages one long-lived QMD sidecar for writes/search/progress
  -> builds a separate lazy cache for QMD log observability

QMD sidecar
  -> wraps the QMD TypeScript SDK
  -> opens one index at a time
  -> handles mutation/search/file-toggle behavior
  -> streams progress back through Tauri events
```

---

## Architecture map

### 1. App shell and navigation

The app shell lives at the root of the frontend and owns:
- sidebar navigation
- header controls
- breadcrumbs
- global project scope
- global analytics time range

Start with:
- `src/app.tsx`
- `src/router.tsx`

### 2. Analytics pipeline

The analytics path is:

```text
session JSONL files
  -> discovery/parsing in Rust
  -> `SessionCache`
  -> Tauri commands
  -> typed frontend API wrappers
  -> route pages / charts / tables
```

Important ownership split:
- Rust owns parsing and aggregation
- frontend owns fetching, validation, and presentation

Start with:
- `src-tauri/src/parser/session.rs`
- `src-tauri/src/cache.rs`
- `src-tauri/src/commands/analytics.rs`
- `src/api/analytics.ts`
- `src/schemas/analytics.ts`

### 3. Session replay pipeline

Session replay is intentionally separate from summary analytics.

The replay path is:

```text
raw session entries
  -> on-demand backend fetch
  -> branch/path shaping in the replay subsystem
  -> tree + conversation + sidebar rendering
```

Start with:
- `src/pages/session-detail.tsx`
- `src/pages/scoped-session-detail.tsx`
- `src/components/session-viewer/`

### 4. Usage workspace

Usage is a route-local analytics workspace with shared loading and tab-level presentation.

Important design boundary:
- global project scope and time range are app-level selections
- Usage data itself is route-local shared state

Start with:
- `src/pages/usage/layout.tsx`
- `src/pages/usage/usage-context.tsx`
- `src/pages/usage/*`

### 5. QMD management path

QMD uses a hybrid backend.

The management path is:

```text
frontend QMD pages
  -> Rust read commands for status/collection/index reads
  -> sidecar-backed commands for mutations/search/progress/file toggles
```

Start with:
- `src/pages/qmd.tsx`
- `src/pages/qmd-collection.tsx`
- `src-tauri/src/commands/qmd.rs`
- `src-tauri/src/sidecar.rs`
- `src-sidecar/qmd-bridge.ts`

### 6. QMD logs observability path

QMD logs is a separate observation pipeline built from session logs, not from the QMD database.

The path is:

```text
session JSONL files
  -> QMD CLI extraction parser
  -> lazy `QmdLogCache`
  -> QMD logs endpoints
  -> `/qmd/logs` page and badge UI
```

Start with:
- `src-tauri/src/parser/qmd_logs.rs`
- `src-tauri/src/qmd_log_cache.rs`
- `src-tauri/src/commands/qmd_logs.rs`
- `src/pages/qmd-logs.tsx`

---

## Route shape

`src/router.tsx` is the source of truth.

At a high level, the route system is organized as:
- `/` for Overview
- `/sessions` for session browsing and replay
- `/usage/*` for the shared analytics workspace
- `/qmd/*` for QMD management and QMD logs

Two route-shape details matter architecturally:
- `/usage` is a **layout route** with shared data loading
- `/qmd/logs` is a **static route** that must remain distinct from dynamic index routes

For the full route/page map, use `docs/information-architecture.md` or inspect `src/router.tsx` directly.

---

## Important subsystem boundaries

### 1. Frontend ↔ backend

All app data crosses the Tauri boundary through typed wrappers in `src/api/`.

The frontend:
- does **not** parse session files directly
- does **not** read QMD SQLite directly
- validates structured payloads with Zod before use

### 2. Backend ↔ pi session logs

Ariadne is **read-only** with respect to pi session logs.

The backend discovers and parses `~/.pi/agent/sessions/**/*.jsonl`, but never modifies them.

### 3. Backend ↔ QMD for reads

QMD status and collection/dashboard reads come from **direct SQLite access** in Rust.

This is used for:
- index discovery
- collection/status reads
- document/indexed-path reads

### 4. Backend ↔ QMD for writes/search

Mutations and hybrid search go through the **QMD sidecar**, not through per-command shelling out.

This is used for:
- creating indexes
- collection/context mutation
- reindex / embed / cleanup
- hybrid search
- filesystem scans
- file inclusion toggles

### 5. Analytics cache ↔ QMD log cache

`SessionCache` and `QmdLogCache` are intentionally separate.

Normal analytics pages should not pay the cost of QMD-log parsing. QMD log extraction is lazy and only runs when QMD logs endpoints are requested.

### 6. Global scope vs route-local state

Global scope lives in providers at the app root:
- `ProjectScopeProvider`
- `AnalyticsTimeRangeProvider`

Route-local shared state lives inside the route that owns it:
- `UsageProvider` inside the Usage layout route

That split matters:
- project scope and time range are app-level selections
- usage overview/time/file payloads are usage-route data, not app-global stores

---

## Current invariants

1. **Bun is the repo package-manager standard.** Use `bun`, `bun run`, and `bunx` in repo docs and workflows.
2. **Ariadne is a read-only observer of pi sessions.** It may read and aggregate session files, but must not mutate them.
3. **Zod guards the IPC boundary.** `src/api/` + `src/schemas/` are the frontend contract for backend payloads.
4. **Rust model fields and frontend schema fields stay aligned in `snake_case`.** Drift here breaks the app at runtime.
5. **There is one managed QMD sidecar process at a time.** Indexes switch inside the process via `switch_index`; Ariadne does not run one sidecar per index.
6. **QMD dashboard reads are SQLite reads; writes/search are sidecar calls.** Do not blur those paths casually — the split is intentional.
7. **Project identity is path-based, not display-name-based.** `project_name` is presentation only; `project_path` is the stable identity key.
8. **Analytics time range is global across analytics routes.** Overview, Sessions, Usage, and Tool Detail must agree on the selected range.
9. **QMD logs are global observability, not index-scoped content.** `/qmd/logs` may parse index metadata from commands, but the route itself is not tied to one selected index.
10. **Docs should follow progressive disclosure.** `AGENTS.md` -> `docs/README.md` -> `docs/ARCHITECTURE.md` -> `docs/DESIGN.md` -> focused docs -> code. For documentation work, read `docs/documentation-maintenance.md` before editing.

---

## Where to start for common work

| Task | Start here |
|---|---|
| Add or change a route | `src/router.tsx`, then matching file under `src/pages/` |
| Change the app shell/header/sidebar | `src/app.tsx` |
| Change project scope behavior | `src/components/project-scope-provider.tsx`, `src/components/project-scope-selector/` |
| Change analytics time range behavior | `src/components/analytics-time-range-provider.tsx`, `src/components/analytics-time-range-selector.tsx` |
| Change Usage shared loading | `src/pages/usage/layout.tsx`, `src/pages/usage/usage-context.tsx` |
| Change session replay | `src/pages/session-detail.tsx`, `src/components/session-viewer/` |
| Change analytics aggregation | `src-tauri/src/cache.rs` |
| Change session parsing | `src-tauri/src/parser/session.rs` |
| Change QMD dashboard reads | `src-tauri/src/commands/qmd.rs` + `src-tauri/src/models/qmd.rs` |
| Change QMD writes/search/progress | `src-sidecar/qmd-bridge.ts`, `src-tauri/src/sidecar.rs`, `src-tauri/src/commands/qmd.rs` |
| Change QMD logs extraction | `src-tauri/src/parser/qmd_logs.rs`, `src-tauri/src/qmd_log_cache.rs`, `src/pages/qmd-logs.tsx` |
| Change doc structure / maps | `docs/README.md`, `docs/documentation-maintenance.md` |
