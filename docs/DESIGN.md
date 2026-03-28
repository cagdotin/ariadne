# DESIGN

Status: active  
Last updated: 2026-03-28

This document explains the **non-obvious design choices** in Ariadne.

It is intentionally thinner than the code. It should answer:
- why the system is shaped this way
- what boundaries are deliberate
- which flows are important to preserve
- which tradeoffs are easy to miss when only reading files

For the current architecture map, see `docs/ARCHITECTURE.md`.

---

## 1. Parsing and analytics live in Rust on purpose

Ariadne's raw source material is not API data. It is a large set of append-only JSONL session logs under `~/.pi/agent/sessions/`.

The design choice is:
- parse and aggregate in **Rust**
- render in **React**
- pass only structured summaries and replay payloads across IPC

### Why

This keeps the frontend from doing expensive work with raw session files and makes the Tauri boundary explicit.

The Rust side owns:
- file discovery (`src-tauri/src/parser/discovery.rs`)
- summary extraction (`src-tauri/src/parser/session.rs`)
- analytics aggregation (`src-tauri/src/cache.rs`)
- on-demand replay payload loading (`get_session_entries()`)

The frontend owns:
- route-driven data fetching (`src/api/*.ts`)
- schema validation (`src/schemas/*.ts`)
- presentation and interaction state

### Important consequence

Most analytics pages should be thought of as **views over `SessionCache`**, not as places that compute their own business logic.

If analytics math changes, start in `src-tauri/src/cache.rs`, not in the page components.

---

## 2. Ariadne uses two different session representations

Ariadne intentionally keeps **two levels of session data**:

1. **`SessionSummary`** for analytics, tables, counts, tool breakdowns, and project-level aggregation
2. **raw session entries** for the session replay UI

### Why the split exists

A summary is the right shape for analytics.
A replay viewer needs the original event stream, including:
- parent/child relationships
- branching
- tool call blocks
- tool results
- compactions
- model changes
- custom message blocks

Trying to force replay through summary structs would either lose fidelity or create an overly broad analytics model.

### Where it lives

- summary model: `src-tauri/src/models/session.rs`
- parser: `src-tauri/src/parser/session.rs`
- replay fetch: `get_session_entries()` in `src-tauri/src/commands/analytics.rs`
- replay UI: `src/components/session-viewer/`

---

## 3. `SessionCache` is a deliberate "parsed view" cache, not a database

`SessionCache` in `src-tauri/src/cache.rs` is an in-memory cache of parsed sessions plus aggregation methods.

### Why Ariadne does not persist a second local analytics database

The source of truth already exists on disk in the session logs.
The current product benefits more from:
- fast startup after first parse
- simple invalidation semantics
- one place for aggregation logic
than from adding a second persistence layer.

### Important design traits

- **lazy initialization** on first request
- **full resync** when explicitly refreshed
- **shared filtering helpers** (`session_matches()`, `filter_sessions()`) used across analytics methods
- **on-demand replay loading** rather than caching every raw entry in memory

### Why the shared filtering helpers matter

The project-scope and time-range model is app-wide. Re-implementing date/project filtering per method caused drift risk, so the backend now centralizes the filtering rules.

If a page appears inconsistent across Overview / Sessions / Usage / Tool Detail, the shared filter path in `cache.rs` is one of the first places to inspect.

---

## 4. Session replay is designed around branch navigation, not a flat transcript

pi sessions can branch. Ariadne's viewer is therefore not a simple chronological chat renderer.

### Current structure

The replay subsystem lives in `src/components/session-viewer/` and is split by concern rather than by one monolithic renderer.

Read that directory directly for the current decomposition. The important architectural point is not the exact folder list, but that branch navigation, conversation rendering, tool rendering, sidebar detail, and shaping utilities are intentionally separated so replay logic does not collapse into one giant component.

### Key design choice

The viewer computes a **current path from root to a selected leaf** and renders that path linearly, while keeping the full branch tree available in the sidebar.

This gives the user two simultaneous models:
- the whole branching structure
- one readable conversation path at a time

### Why this matters

A flat transcript hides branch structure.
A fully nested branch renderer is hard to read.
The current design keeps branch awareness without making the main pane unreadable.

### Related detail

`ScopedSessionDetail` in `src/pages/scoped-session-detail.tsx` is intentionally a **thin scope guard** around the real `SessionDetail`. Scope-specific redirect behavior is kept outside the replay component so the replay UI itself stays scope-agnostic.

---

## 5. Global scope is first-class, but not everything should become global state

Ariadne now has two app-level scopes:
- **project scope** — `ProjectScopeProvider`
- **analytics time range** — `AnalyticsTimeRangeProvider`

Both are mounted in `src/main.tsx`.

### Why these are global

They affect multiple routes and should feel like durable context, not page-local filters.

The user expectation is:
- choose a project once
- choose a time range once
- move between Overview, Sessions, and Usage without reconfiguring the app every time

### Why Ariadne still avoids a broad global store

Not all shared data belongs at the app root.

The Usage route owns a shared `UsageProvider` in `src/pages/usage/layout.tsx` because its data is:
- shared across usage tabs
- route-local
- not useful to unrelated parts of the app

This is an intentional split:
- **global selections** live in providers near the app root
- **route data** lives inside the route that owns it

That keeps the mental model smaller than introducing a universal app store.

---

## 6. The app shell makes scope visible in the header, not inside pages

`src/app.tsx` is not just layout glue. It encodes the navigation model.

### Important design decisions in the shell

- sidebar owns the four top-level destinations
- breadcrumbs reflect route depth instead of pages rendering their own back buttons
- project scope stays visible in the header
- analytics time range appears only on routes where it has meaning
- sync performs a full reload because provider re-initialization is load-bearing for scope validation

### Why the full reload after sync is intentional

`resync_sessions()` updates backend data, but the project scope provider also needs a clean startup pass to:
- reload the project list
- validate persisted scope
- clear a scope whose `project_path` no longer exists

That is why `handle_sync()` in `src/app.tsx` ends with `window.location.reload()`.
It is not just convenience.

---

## 7. Usage is a route-local analytics workspace, not a pile of unrelated pages

The Usage surface is organized as a layout route under `src/pages/usage/`.

### Current pattern

`src/pages/usage/layout.tsx`:
- reads global project scope + global time range
- fetches shared route data in one place
- conditionally fetches file analytics only when a project is scoped
- exposes the loaded payloads via `UsageProvider`

The tab pages (`cost-tab.tsx`, `tools-tab.tsx`, `patterns-tab.tsx`, `files-tab.tsx`) are mostly presentational.

### Why this design matters

Without a route-level loader/context, each tab would either:
- duplicate fetch logic
- refetch the same analytics payloads independently
- or push too much state into the app shell

The current layout keeps data ownership aligned with route ownership.

---

## 8. File analytics was redesigned around a unified file-insight model

The Usage Files tab used to rely mainly on separate read/edit/write arrays.

It now has a more durable shared model in `src/lib/file-analytics.ts`:
- `FileInsight`
- `OperationLens`
- helpers for lens values, intensity, percentages, and file-size enrichment

### Why this matters

The Files tab now drives multiple visualizations from one conceptual record:
- treemap
- imbalance chart
- session breadth chart
- size vs activity scatter
- grid/table lookup

This avoids re-deriving different file views in each component from scratch.

### Important design choices

- **operation lens** (`all | read | edit | write`) is owned by `files-tab.tsx`, not by individual charts
- backend now returns **`file_insights` with `distinct_session_count`** so cross-session breadth is not reconstructed ad hoc in the frontend
- file sizes are fetched separately via `get_file_sizes()` so the main analytics response stays fast

### Consequence

The Files tab is best thought of as a **small analytics workspace** with shared filters and multiple synchronized views, not as a single chart page.

---

## 9. QMD uses a hybrid backend on purpose

Ariadne's QMD integration is intentionally split between:
- **direct Rust SQLite reads** for status and dashboard-like reads
- **a TypeScript sidecar** for mutations, search, and progress-aware operations

### Why not do everything in Rust?

The QMD SDK is TypeScript-native and exposes the write/search behaviors Ariadne needs.

### Why not do everything through the sidecar?

Some dashboard reads are simpler and cheaper to perform directly from SQLite in Rust.
That keeps the UI responsive and avoids paying process / SDK overhead for every collection/status read.

### Where the split lives

- Rust read path: `src-tauri/src/commands/qmd.rs`
- sidecar manager: `src-tauri/src/sidecar.rs`
- sidecar implementation: `src-sidecar/qmd-bridge.ts`

### Practical rule

If you are changing:
- **status, collection lists, index metadata** -> start in Rust/SQLite command code
- **reindex, embed, search, file toggles, progress streaming** -> start in the sidecar path

---

## 10. Multi-index support is route-level, not process-level fan-out

QMD indexes are modeled as named workspaces (`/qmd/:index`), but Ariadne still keeps **one sidecar process**.

### Design choice

The sidecar opens one index at a time and switches via `switch_index`.

### Why

This avoids:
- process sprawl
- duplicated model/runtime overhead
- more complicated progress/event routing

The router expresses the active index in the URL, while the sidecar expresses it as the currently opened db path.

That separation is important:
- the **URL** is the user-facing navigation state
- the **sidecar current index** is the runtime execution state

---

## 11. QMD search is designed for observability, not just results

The QMD search UI does not only return hits. It exposes the pipeline.

### Current path

- frontend trigger/modal: `src/components/qmd-search-modal.tsx`
- frontend hook/event glue: `src/hooks/use-qmd-operation.ts`
- backend command: `qmd_search` in `src-tauri/src/commands/qmd.rs`
- sidecar implementation: `search` handler in `src-sidecar/qmd-bridge.ts`

### Important design choice

The sidecar emits progress stages for search expansion and search execution, then returns expanded queries, timing, and result traces.

That matches Ariadne's product philosophy: the user should be able to see **how** the search happened, not just the final ranked list.

---

## 12. QMD logs is a separate observability pipeline, not a QMD dashboard add-on

The `/qmd/logs` page is built from session logs, not from QMD's own database.

### Why the separate cache exists

Parsing session logs for QMD CLI calls is conceptually related to Ariadne's observation mission, but it is **not** part of Overview / Sessions / Usage startup.

So Ariadne keeps:
- `SessionCache` for analytics
- `QmdLogCache` for QMD CLI observability

### What the parser actually does

`src-tauri/src/parser/qmd_logs.rs`:
- scans assistant `bash` tool calls
- detects `qmd` CLI invocations, including env-var-prefixed forms
- correlates tool calls with later `toolResult` messages using the tool-call block `id` and the result `toolCallId`
- extracts raw command text, subcommand guesses, collection/index hints, and output

### Why this design is valuable

It gives Ariadne a feedback loop about documentation and knowledge-base quality without requiring any new agent instrumentation.

---

## 13. Documentation should point to code boundaries, not duplicate them

Ariadne's docs are now meant to follow the same design philosophy as the app:
- `ARCHITECTURE.md` gives the map
- `DESIGN.md` explains non-obvious choices
- focused docs cover page structure or integrations
- code remains the implementation source of truth

When updating docs, read `docs/documentation-maintenance.md` first.

---

## High-value files to read next

| Question | Read |
|---|---|
| How are routes and shared shell behavior wired? | `src/router.tsx`, `src/app.tsx` |
| How does project/time scope work? | `src/components/project-scope-provider.tsx`, `src/components/analytics-time-range-provider.tsx` |
| How does Usage share data? | `src/pages/usage/layout.tsx`, `src/pages/usage/usage-context.tsx` |
| How does session parsing/aggregation work? | `src-tauri/src/parser/session.rs`, `src-tauri/src/cache.rs` |
| How does session replay work? | `src/components/session-viewer/` |
| How does QMD integration work? | `src-tauri/src/commands/qmd.rs`, `src-tauri/src/sidecar.rs`, `src-sidecar/qmd-bridge.ts` |
| How do QMD logs work? | `src-tauri/src/parser/qmd_logs.rs`, `src-tauri/src/qmd_log_cache.rs`, `src/pages/qmd-logs.tsx` |
