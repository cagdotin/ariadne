# DESIGN

Status: active  
Last updated: 2026-04-08

This document explains the non-obvious design choices in Ariadne.

It should answer:
- why the system is shaped this way
- what boundaries are deliberate
- which flows are important to preserve
- which tradeoffs are easy to miss when only reading files

For the current system map, see `docs/ARCHITECTURE.md`.

---

## 1. Ariadne uses Electron, but the shell is intentionally small

Moving to the current Electron runtime did **not** mean flattening the app into Electron main.

Ariadne now uses:
- a renderer in `src/`
- a preload bridge in `electron/preload/`
- a thin shell in `electron/main/`
- a dedicated backend process in `backend/`

### Why

Electron main is good at:
- app lifecycle
- window creation
- dialogs
- wiring IPC boundaries
- supervising child processes

It is not the right place for:
- session parsing
- analytics aggregation
- QMD SQL queries
- provider-limit probing

That work lives in the backend service so it stays restartable, testable, and easier for TypeScript-oriented agents to own.

---

## 2. Renderer capabilities are intentionally explicit

The renderer does not get a generic `ipcRenderer` escape hatch.

Instead, preload exposes a named `window.ariadne` surface with grouped namespaces:
- `commands.analytics`
- `commands.qmd`
- `commands.qmd_logs`
- `commands.provider_limits`
- `dialogs`
- `events`

### Why

This keeps the desktop boundary understandable and reviewable.

The mental model is:
- renderer code imports from `src/platform/*`
- preload exposes a limited capability surface
- Electron main routes requests
- backend handles business logic

That is much easier to audit than a generic `invoke(anything)` pattern.

---

## 3. Session analytics still revolve around a parsed in-memory view

Ariadne's raw source material is still a large append-only set of JSONL logs under `~/.pi/agent/sessions/`.

The current choice is still:
- parse and aggregate in the backend
- render in React
- pass structured summaries or replay payloads over the desktop boundary

### Where it lives now

- discovery: `backend/analytics/discovery.ts`
- parsing: `backend/analytics/session-parser.ts`
- cache: `backend/analytics/session-cache.ts`
- aggregations: `backend/analytics/aggregations/`

### Why Ariadne still does not use a separate local analytics database

The source of truth already exists on disk.

The current product benefits more from:
- simple invalidation semantics
- parity with the original runtime behavior
- one shared place for aggregation logic

than from introducing a second persistence layer.

### Important current tradeoff

The worker-thread follow-up has not landed yet. Heavy analytics parsing still happens inside the backend process rather than a dedicated worker thread.

That is acceptable for current correctness, but it remains one of the clearest post-migration performance improvements.

---

## 4. Ariadne still uses two session representations on purpose

Ariadne intentionally keeps:
1. **session summaries** for analytics and tables
2. **raw session entries** for replay

### Why

A summary is the right shape for aggregate views.
A replay viewer needs the original event stream, including:
- parent/child relationships
- branching
- tool call blocks
- tool results
- compactions
- model changes

Trying to collapse both into one model would either lose fidelity or create an overly broad contract.

### Important current detail

`get_session_entries()` is only partially validated today. The wire shape is validated with permissive Zod schemas, but entry bodies are still intentionally passthrough to preserve parity.

That is a conscious migration tradeoff, not a finished ideal.

---

## 5. Session replay is branch-aware, not a flat transcript

pi sessions can branch, so Ariadne's viewer is not just a chronological message list.

### Current structure

The replay subsystem lives in `src/components/session-viewer/`.

The important design point is not the exact folder structure, but that the viewer keeps two simultaneous models available:
- the full branch tree
- one readable path from root to the selected leaf

### Why this matters

A flat transcript hides branch structure.
A fully nested branch renderer is hard to read.
The current design preserves both comprehensibility and fidelity.

---

## 6. Global scope is first-class, but route data is not app-global

Ariadne has two app-level scopes:
- **project scope**
- **analytics time range**

Both are mounted near the root and are meant to persist while moving between routes.

### Why these are global

The intended user experience is:
- choose a project once
- choose a time range once
- move between Overview, Sessions, and Usage without reconfiguring every page

### Why Ariadne still avoids a universal store

Not everything belongs at the app root.

The Usage workspace keeps route-local shared data in `UsageProvider` because that data is:
- shared across usage tabs
- not useful to unrelated routes
- naturally owned by the `/usage` route family

This split keeps the mental model smaller than introducing one global data store for everything.

---

## 7. The app shell keeps scope and sync visible on purpose

`src/app.tsx` is not just layout glue.

It encodes important product decisions:
- sidebar owns top-level navigation
- breadcrumbs come from the shell rather than page-local back buttons
- project scope is visible globally
- analytics time range only appears where it matters
- sync ends with a full reload

### Why the full reload after sync is intentional

`resync_sessions()` refreshes backend data, but frontend providers also need a fresh startup pass to:
- reload project lists
- validate persisted scope
- clear a stale scope if the backing project disappeared

So the full reload is deliberate, not just expedient.

---

## 8. Usage is a route-local analytics workspace, not a pile of tabs

The Usage surface is organized as a layout route under `src/pages/usage/`.

`src/pages/usage/layout.tsx` owns:
- tab navigation
- shared loading
- route-level context
- conditional file-stats loading when a project is scoped

### Why this matters

Without a route-level loader/context, each tab would either:
- duplicate fetch logic
- refetch the same payloads
- or force unrelated state upward into the app shell

The current layout keeps data ownership aligned with route ownership.

---

## 9. QMD is still intentionally hybrid

Ariadne's QMD integration remains split between:
- direct backend SQLite reads for dashboard-like state
- a managed QMD bridge process for write/search behavior

### Why not move everything into the backend process?

The QMD SDK behavior already exists in TypeScript and is more naturally preserved in a dedicated process.

### Why not move everything through the bridge?

Some reads are cheaper and more transparent to perform directly from SQLite:
- index discovery
- status
- collection metadata
- indexed paths

That split keeps status views fast while preserving SDK-native behavior for operations that actually mutate or search.

---

## 10. One active QMD bridge process is still the right model

Ariadne keeps one managed bridge process and switches indexes inside it.

### Why

This avoids:
- process sprawl
- duplicated runtime overhead
- harder progress routing
- more complicated lifecycle management

The URL expresses user-facing index state.
The bridge expresses runtime execution state.
Those are related, but they are not the same thing.

---

## 11. QMD search is designed to show the pipeline, not only the result

Ariadne's QMD search UI does not just return hits.

It also exposes:
- expanded queries
- progress stages
- timings
- traces when available

### Why

Ariadne is an observation layer. Showing how a search happened is part of the product value, not just an implementation detail.

That is why progress events and pipeline metadata are important to preserve.

---

## 12. QMD logs is a separate observability pipeline

The `/qmd/logs` page is built from pi session logs, not from QMD's database.

### Why the separate cache exists

QMD CLI observability is related to Ariadne's mission, but it should not increase the startup cost of Overview, Sessions, or Usage.

So Ariadne keeps:
- `session_cache` for analytics
- `qmd_log_cache` for QMD CLI observability

### Why this matters

It gives Ariadne a way to inspect agent knowledge-work behavior without requiring new instrumentation in pi or QMD.

---

## 13. Provider limits is intentionally not "just more analytics"

Provider limits is a live-state subsystem.

It answers a different question from session analytics:
- analytics asks what happened in past sessions
- provider limits asks what quota remains right now

### Consequence

It has its own cache, source-confidence model, freshness model, and fallback behavior.

That is why it lives in `backend/provider-limits/` rather than inside analytics.

---

## 14. Migration-era parity artifacts are still valuable, but they are historical

Ariadne still keeps migration fixtures, goldens, and parity tests because they are useful as regression protection and historical context.

But they are no longer the current runtime architecture.

### Important documentation rule

Current docs should describe the Electron + TypeScript backend as the live system.
Legacy migration material should stay clearly historical or be removed when it stops helping.

---

## High-value files to read next

| Question | Read |
|---|---|
| How are routes and shared shell behavior wired? | `src/router.tsx`, `src/app.tsx` |
| How does the desktop boundary work? | `src/platform/*`, `electron/preload/index.ts`, `electron/main/ipc-router.ts` |
| How does backend supervision work? | `electron/main/backend-supervisor.ts`, `backend/runtime/protocol.ts` |
| How does session parsing/aggregation work? | `backend/analytics/session-parser.ts`, `backend/analytics/session-cache.ts` |
| How does replay loading work? | `backend/analytics/replay-loader.ts`, `src/components/session-viewer/` |
| How does Usage share data? | `src/pages/usage/layout.tsx`, `src/pages/usage/usage-context.tsx` |
| How does QMD integration work? | `backend/qmd/sqlite-read-service.ts`, `backend/qmd/bridge/`, `src-sidecar/qmd-bridge.ts` |
| How do QMD logs work? | `backend/qmd-logs/parser.ts`, `backend/qmd-logs/cache.ts`, `src/pages/qmd-logs.tsx` |
| How do provider limits work? | `backend/provider-limits/cache.ts`, `backend/provider-limits/codex.ts` |
