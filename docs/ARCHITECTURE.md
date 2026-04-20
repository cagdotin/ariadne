# ARCHITECTURE

Status: active
Last updated: 2026-04-19

This document explains Ariadne's current system shape.

Use it to answer:
- what the major runtime surfaces are
- where the important boundaries live
- how data moves through the app
- which invariants are worth protecting

For design rationale, see `docs/DESIGN.md`. For route/page structure, see `docs/information-architecture.md`.

---

## Bird's-eye view

Ariadne is an **Electron desktop application** for observing AI coding-agent activity.

It currently ships with five meaningful runtime layers:
- a **React renderer** in `src/`
- an **Electron preload bridge** in `electron/preload/`
- a **thin Electron main process** in `electron/main/`
- a **Node/TypeScript backend service** in `backend/`
- a **QMD bridge child process** in `src-sidecar/`

### Current product surfaces

Ariadne currently exposes:
- **Overview** — high-level session, cost, token, and project pulse
- **Sessions** — session browsing plus full replay
- **Usage** — cost, tools, patterns, and scoped file analytics
- **QMD** — index / collection management and hybrid search
- **QMD Logs** — observability over agent QMD CLI usage
- **Provider limits** — sidebar and page-level quota snapshots
- **Settings** — machine-local preferences and experimental feature gates

### Core data sources

- **pi session JSONL files** under `~/.pi/agent/sessions/**/*.jsonl`
- **QMD SQLite indexes** under `~/.cache/qmd/*.sqlite`
- **Codex session/app-server data** under `~/.codex`
- **filesystem paths** referenced by collections and file analytics

---

## Runtime model

```text
React renderer
  -> src/platform/* adapters
  -> window.ariadne preload API
  -> Electron ipcMain bridge
  -> Node backend child process
       -> analytics/session modules
       -> QMD SQLite read service
       -> QMD log cache
       -> provider limits cache
       -> QMD bridge child process for write/search operations
```

### Ownership split

- **Renderer** owns fetching, Zod validation, UI state, and presentation
- **Preload** owns the explicit desktop capability surface exposed to the renderer
- **Electron main** owns lifecycle, windows, dialogs, backend supervision, and event fan-out
- **Backend** owns parsing, aggregation, SQLite reads, provider-limit fetching, and cache lifecycles
- **QMD bridge** owns SDK-native QMD mutations, search, and progress-aware operations

---

## Architecture map

### 1. App shell and navigation

The app shell lives in:
- `src/app.tsx`
- `src/router.tsx`

It owns:
- sidebar navigation
- breadcrumbs
- global project scope
- global analytics time range
- machine-local app settings / experimental flags
- sync action
- provider limits sidebar card

### 2. Desktop boundary

The renderer never talks directly to Electron or Node primitives.

The boundary is:
- renderer adapters: `src/platform/`
- preload API: `electron/preload/index.ts`
- typed contracts: `contracts/ipc-commands.ts`
- main-process router: `electron/main/ipc-router.ts`

The preload surface is strongly typed via `contracts/ipc-commands.ts`, which defines `AriadnePreloadApi` — typed command signatures for all namespaces, dialog types, and event channel payloads. `electron/preload/ariadne.d.ts` imports this type directly. Renderer-side Zod validation in `src/api/*` is preserved as a runtime safety net.

Start here when changing desktop capabilities:
- `contracts/ipc-commands.ts`
- `electron/preload/index.ts`
- `electron/preload/ariadne.d.ts`
- `electron/main/ipc-router.ts`

### 3. Backend process model

Electron main supervises one backend child process.

Start here:
- `electron/main/backend-supervisor.ts`
- `backend/index.ts`
- `backend/runtime/protocol.ts`
- `backend/runtime/request-router.ts`
- `backend/runtime/event-bus.ts`

### 4. Analytics pipeline

The analytics path is:

```text
session JSONL files
  -> backend/workers/analytics-build.worker.ts (worker thread)
  -> backend/analytics/discovery.ts
  -> backend/analytics/session-parser.ts
  -> backend/analytics/session-cache.ts
  -> aggregation/query helpers
  -> preload command bridge
  -> src/api/analytics.ts
  -> route pages and charts
```

Cache building (discovery + parsing) runs in a worker thread so it does not block other backend requests. The worker is bundled as a separate entry point at `backend/dist/analytics-build.worker.js`.

Start with:
- `backend/analytics/session-cache.ts`
- `backend/workers/analytics-build.worker.ts`
- `backend/analytics/aggregations/`
- `backend/analytics/query.ts`
- `src/api/analytics.ts`

### 5. Session replay pipeline

Replay is separate from summary analytics.

The replay path is:

```text
raw session entries
  -> backend/analytics/replay-loader.ts
  -> src/api/analytics.ts#get_session_entries()
  -> src/components/session-viewer/
```

Start with:
- `backend/analytics/replay-loader.ts`
- `src/pages/session-detail.tsx`
- `src/components/session-viewer/`

### 6. Usage workspace

Usage is a route-local analytics workspace with shared loading.

Start with:
- `src/pages/usage/layout.tsx`
- `src/pages/usage/usage-context.tsx`
- `src/pages/usage/*`

### 7. QMD management path

QMD uses a hybrid backend.

The path is:

```text
frontend QMD pages
  -> backend/qmd/sqlite-read-service.ts for status/read views
  -> backend/qmd/bridge/* + src-sidecar/qmd-bridge.ts for mutations/search
```

The QMD bridge sidecar is compiled to `src-sidecar/dist/qmd-bridge.js` as part of the build. In dev, the supervisor runs the TypeScript source via `bun run`. In production, it runs the compiled JS bundle via Electron's Node (`ELECTRON_RUN_AS_NODE=1`).

Start with:
- `backend/qmd/sqlite-read-service.ts`
- `backend/qmd/commands.ts`
- `backend/qmd/bridge/bridge-supervisor.ts`
- `src-sidecar/qmd-bridge.ts`
- `src/pages/qmd.tsx`

### 8. QMD logs observability path

QMD logs is a separate observation pipeline built from session logs, not from the QMD database.

Start with:
- `backend/qmd-logs/cache.ts`
- `backend/qmd-logs/parser.ts`
- `backend/qmd-logs/commands.ts`
- `src/pages/qmd-logs.tsx`

### 9. Provider limits path

Provider limits is a separate live-data subsystem.

Start with:
- `backend/provider-limits/cache.ts`
- `backend/provider-limits/codex.ts`
- `backend/provider-limits/commands.ts`
- `src/components/provider-limits-provider.tsx`

---

## Route shape

`src/router.tsx` is the source of truth.

At a high level:
- `/` — Overview
- `/sessions` — sessions list and replay
- `/usage/*` — analytics workspace
- `/qmd/*` — QMD management and logs

Routes are lazy-loaded via `React.lazy()` + `Suspense` with a skeleton fallback. Only lightweight redirect components are eagerly loaded.

Two route details matter architecturally:
- `/usage` is a layout route with shared data loading
- `/qmd/logs` is a static route and must remain distinct from `/qmd/:index`

---

## Important subsystem boundaries

### 1. Renderer ↔ desktop boundary

All renderer-to-desktop calls go through `window.ariadne`.

The renderer:
- does not import Electron directly
- does not access Node APIs directly
- uses `src/platform/*` as the only transport abstraction

### 2. Main process ↔ backend boundary

Electron main stays thin.

It should own only:
- app/window lifecycle
- native dialogs
- backend supervision
- IPC fan-out

It should not own analytics math, QMD SQL, or session parsing.

### 3. Backend ↔ pi session logs

Ariadne is read-only with respect to pi session logs.

The backend may discover and parse session files, but must not mutate them.

### 4. Backend ↔ QMD for reads

Dashboard-like QMD reads come from direct SQLite access in:
- `backend/qmd/sqlite-read-service.ts`

This covers:
- index discovery
- index status
- collection lists
- collection detail
- indexed paths

### 5. Backend ↔ QMD for writes/search

Mutations and search go through the managed QMD bridge, not direct shell-outs per command.

This covers:
- add/remove/rename collection
- context changes
- reindex/embed/cleanup
- filesystem scan / file toggles
- hybrid search and progress events

### 6. Analytics cache ↔ QMD log cache

`session_cache` and `qmd_log_cache` are intentionally separate.

Normal analytics pages should not pay the cost of QMD-log parsing.

### 7. Global scope vs route-local state

Global selections live near the app root:
- `ProjectScopeProvider`
- `AnalyticsTimeRangeProvider`
- `AppSettingsProvider`

Route-local shared data lives inside the route that owns it:
- `UsageProvider` inside the Usage layout route

---

## Current invariants

1. **Bun is the repo package-manager standard.** Use `bun`, `bun run`, and `bunx` in repo workflows.
2. **Electron preload is the only renderer access point to desktop capabilities.** Do not bypass it.
3. **Electron main stays thin.** Heavy logic belongs in `backend/`, not in `electron/main/`.
4. **Ariadne is a read-only observer of pi sessions.** It must never mutate session files.
5. **Contracts + Zod guard the boundary.** `contracts/` defines shared shapes and `src/api/` validates backend payloads before use.
6. **There is one supervised backend process at a time.** Request/response correlation lives in the backend supervisor.
7. **There is one managed QMD bridge process at a time.** Indexes switch inside that process.
8. **QMD reads and QMD mutations are intentionally split.** SQLite reads live in backend services; mutations/search live in the bridge.
9. **Project identity is path-based, not display-name-based.** `project_name` is presentation only.
10. **Analytics time range is global across analytics routes.** Overview, Sessions, Usage, and Tool Detail must agree on the selected range.
11. **QMD logs are global observability, not index-scoped content.** `/qmd/logs` is not tied to one selected index.
12. **Local app settings are machine-local.** Experimental flags currently persist in renderer local storage until a dedicated config layer exists.
13. **Current docs must describe the live Electron runtime.** Historical material should be clearly separated or removed.

---

## Where to start for common work

| Task | Start here |
|---|---|
| Change the app shell/header/sidebar | `src/app.tsx` |
| Add or change a route | `src/router.tsx`, then matching page under `src/pages/` |
| Change renderer-to-desktop transport | `contracts/ipc-commands.ts`, `src/platform/*`, `electron/preload/index.ts`, `electron/main/ipc-router.ts` |
| Change backend process lifecycle | `electron/main/backend-supervisor.ts`, `backend/index.ts` |
| Change analytics aggregation | `backend/analytics/session-cache.ts`, `backend/workers/analytics-build.worker.ts`, `backend/analytics/aggregations/` |
| Change session parsing | `backend/analytics/session-parser.ts` |
| Change replay loading | `backend/analytics/replay-loader.ts` |
| Change Usage shared loading | `src/pages/usage/layout.tsx`, `src/pages/usage/usage-context.tsx` |
| Change QMD dashboard reads | `backend/qmd/sqlite-read-service.ts` |
| Change QMD writes/search/progress | `backend/qmd/bridge/`, `backend/qmd/commands/`, `src-sidecar/qmd-bridge.ts` |
| Change QMD logs extraction | `backend/qmd-logs/parser.ts`, `backend/qmd-logs/cache.ts`, `src/pages/qmd-logs.tsx` |
| Change provider limits | `backend/provider-limits/` |
| Change doc structure or discovery | `docs/README.md`, `docs/documentation-maintenance.md` |
