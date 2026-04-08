# Information Architecture

Status: active  
Last updated: 2026-03-28

This document is the source-of-truth map for Ariadne's **pages, navigation, and route-level responsibilities**.

Use it before changing:
- routes
- top-level navigation
- breadcrumbs
- page ownership boundaries
- which views are global vs scoped vs detail-only

For code structure, see `docs/ARCHITECTURE.md`.

---

## Product questions Ariadne answers

Ariadne currently answers five kinds of questions:

| Question | Surface | Route family |
|---|---|---|
| "What's the pulse?" | **Overview** | `/` |
| "What did specific sessions do?" | **Sessions** | `/sessions` |
| "How are tools/cost/patterns/files distributed?" | **Usage** | `/usage/*` |
| "What is in my QMD knowledge base?" | **QMD** | `/qmd/:index`, `/qmd/:index/:collection` |
| "How are agents actually using QMD?" | **QMD Logs** | `/qmd/logs` |

These are intentionally different surfaces. QMD logs is not just a table inside the QMD index page; it is an observability page about agent behavior.

---

## Global navigation model

### Sidebar

The sidebar has four top-level destinations:

```text
Overview   -> /
Sessions   -> /sessions
Usage      -> /usage
QMD        -> /qmd
```

There is **no Projects top-level route** anymore. Project selection is a global scope control, not a destination.

### Breadcrumb model

Breadcrumbs are owned by the app shell in `src/app.tsx`.

Current breadcrumb patterns:

```text
/                      -> Overview
/sessions              -> Sessions
/sessions/:id          -> Sessions / {session-id…} (redirects to conversation)
/sessions/:id/conversation -> Sessions / {session-id…}
/sessions/:id/traces   -> Sessions / {session-id…} / Traces
/usage/cost            -> Usage / Cost
/usage/tools           -> Usage / Tools
/usage/tools/:tool     -> Usage / Tools / {tool}
/usage/patterns        -> Usage / Patterns
/usage/files           -> Usage / Files
/qmd/logs              -> QMD / Logs
/qmd/:index            -> QMD / {index}
/qmd/:index/:collection -> QMD / {index} / {collection}
```

Detail pages rely on breadcrumbs rather than page-local back buttons.

---

## Header model

The header is part of the information architecture, not just a visual shell.

### Left side

```text
Sidebar trigger -> Project scope selector -> Breadcrumbs
```

### Right side

```text
Analytics time range selector (when relevant) -> Sync -> Theme toggle
```

### Important scope behavior

#### Project scope selector

The project scope selector is globally visible in the header.

What it affects:
- **Overview**: filters analytics to one project, hides Top Projects when scoped
- **Sessions**: filters the session table
- **Usage**: filters the shared usage payloads; Files tab only appears when scoped
- **Tool Detail**: inherits Usage + project scope
- **QMD Logs**: filters rows and badge counts by project scope

What it does **not** directly scope:
- QMD index data
- QMD collection data
- QMD search results

So on QMD pages, the selector remains useful mainly because it scopes the **Logs** badge and `/qmd/logs` page.

#### Analytics time range selector

The analytics time-range selector is shown only on routes where it matters:
- `/`
- `/sessions`
- `/usage/*`

It is hidden on:
- `/sessions/:id`
- all `/qmd/*` routes

It is a **global analytics scope**, persisted in local storage.

---

## Route inventory

### Top-level routes

```text
/                          Overview
/sessions                  Sessions list
/sessions/:id              Session detail layout (redirects to conversation)
/usage                     Usage redirect
/qmd                       Redirect to last/default index
/qmd/logs                  QMD logs observability
/qmd/:index                QMD index overview
/qmd/:index/:collection    QMD collection detail
```

### Session detail sub-routes

```text
/sessions/:id/conversation    Conversation replay (default)
/sessions/:id/traces          Timeline / traces view
```

`/sessions/:id` itself redirects to `/sessions/:id/conversation`.

### Usage sub-routes

```text
/usage/cost
/usage/tools
/usage/tools/:tool_name
/usage/patterns
/usage/files   (only meaningful when a project scope is active)
```

`/usage` itself redirects to `/usage/cost`.

---

## Page ownership

## 1. Overview (`/`)

**Purpose:** fast pulse-check for overall or scoped activity.

### What lives here
- top-level metric cards
- daily trend
- Top Projects cards when no project is scoped
- activity heatmap

### What the page loads
- `get_analytics_overview(project_path?)`
- `get_time_breakdown(range_days, project_path?)`

### Important rules
- this page is summary-first
- it should stay scannable
- deep drill-down tables do not belong here
- Top Projects is an affordance for setting global scope, not a navigation card grid to project routes

---

## 2. Sessions (`/sessions`)

**Purpose:** browse session summaries for the current global scope and time range.

### What lives here
- session table
- toolbar filters/search
- responsive column visibility

### What the page loads
- `get_all_sessions(project_path?, range_days?)`

### Important rules
- in all-projects mode, keep the project column visible
- in scoped mode, hide redundant project labeling where appropriate
- this page is for list browsing, not full replay

### Session detail (`/sessions/:id`)

**Purpose:** inspect a single session through multiple lenses.

Session detail is a **layout route** with shared data context (`SessionDetailProvider`) and a tab nav switching between sub-views:

- **Conversation** (`/sessions/:id/conversation`) — branch-aware conversation replay via `SessionViewer`
- **Traces** (`/sessions/:id/traces`) — horizontal swim-lane timeline showing all session events on a time axis, with an inspector panel for selected events

Page split:
- `session-detail-layout.tsx` = scope guard + data fetch + tab nav + `<Outlet />`
- `session-detail-context.tsx` = shared context provider
- `session-detail-conversation.tsx` = renders `SessionViewer` from context
- `session-detail-traces.tsx` = renders `TracesView` from context

### What session detail loads
- `get_session_entries(session_id)`
- `get_session_detail(session_id)`

### Important rule

Session detail is the only place where full replay and traces belong. The main Sessions page should not accrete replay or trace UI.

---

## 3. Usage (`/usage/*`)

**Purpose:** analytics workspace for cost, tools, patterns, and scoped file analysis.

Usage is a **layout route**, not a loose set of unrelated pages.

`src/pages/usage/layout.tsx` owns:
- the tab nav
- shared data fetching
- shared context via `UsageProvider`
- conditional file-stats loading when a project is scoped

### Shared route data

The layout loads:
- `get_analytics_overview(project_path?, range_days)`
- `get_time_breakdown(range_days, project_path?)`
- `get_project_file_stats(project_path, range_days)` only when scoped

### Tabs

#### Cost (`/usage/cost`)
Answers: **how much am I spending?**

Lives here:
- usage summary cards
- cost breakdown
- token breakdown
- cost over time
- model distribution

#### Tools (`/usage/tools`)
Answers: **what is the agent doing?**

Lives here:
- tool summary cards
- tool usage chart
- error-rate view
- top bash/read/edit/write detail breakdown

#### Tool Detail (`/usage/tools/:tool_name`)
Answers: **how is one tool being used?**

Lives here:
- per-tool stat cards
- usage over time
- item table
- by-project view when not project-scoped

This is a detail page under Usage, not a separate top-level analytics surface.

#### Patterns (`/usage/patterns`)
Answers: **when am I using agents?**

Lives here:
- range-aware stat cards
- weekday distribution
- time-of-day distribution
- sessions-over-time trend

#### Files (`/usage/files`)
Answers: **what files are being touched inside the currently scoped project?**

This tab only appears when a project scope is active.

Lives here:
- file summary cards
- operation lens (`All / Read / Edit / Write`)
- exclude-path filter
- treemap explorer
- read-vs-change imbalance chart
- session breadth chart
- size-vs-activity scatter chart
- file activity grid

### Important rules for Usage

- keep shared fetch/state in the Usage layout
- keep tabs mostly presentational
- keep Files scoped-only; global file analytics is not currently the UX model
- do not reintroduce page-local time-range controls inside tabs

---

## 4. QMD redirect (`/qmd`)

**Purpose:** resolve the user's current index context.

Behavior:
- reads `ariadne:qmd:last-index` from local storage
- falls back to `default`
- can auto-create default on first visit if needed through the broader QMD flow

This route is a navigation helper, not a content surface.

---

## 5. QMD index overview (`/qmd/:index`)

**Purpose:** manage one QMD index.

### What lives here
- index selector
- search trigger
- logs entry point + scoped badge
- add-collection / reindex / embed / cleanup actions
- progress display during long-running operations
- health banner
- status cards
- global context editor
- collections table

### What the page loads
- `qmd_check_availability()`
- `qmd_list_indexes()`
- `qmd_get_status(index)`
- `qmd_list_collections(index)`
- `get_qmd_log_stats(project_path?)` independently for the Logs badge

### Important rules
- this page is index-scoped, not project-scoped
- the Logs badge is the bridge between QMD management and QMD CLI observability
- search is index-scoped and launched from here, but the search UI lives in its own modal component

---

## 6. QMD collection detail (`/qmd/:index/:collection`)

**Purpose:** manage one collection inside one index.

### What lives here
- index selector
- action buttons (reindex, embed, remove)
- collection stat cards
- settings summary
- context editor
- file tree / inclusion toggle workspace

### What the page loads
- `qmd_list_indexes()`
- `qmd_get_collection_detail(index, collection)`
- lazily, when the Files tab is active:
  - `qmd_scan_filesystem(index, collection)`
  - `qmd_get_indexed_paths(index, collection)`

### Important rules
- the file tree is intentionally lazy because filesystem scanning can be expensive
- file inclusion is collection-local, not a global QMD setting
- collection detail should stay focused on one collection; it should not become a second index overview

---

## 7. QMD Logs (`/qmd/logs`)

**Purpose:** inspect how agents used the QMD CLI during sessions.

### What lives here
- scoped stats cards
- toolbar for search / subcommand / error filtering
- logs table
- output dialog

### What the page loads
- `get_qmd_logs(project_path?)`
- `get_qmd_log_stats(project_path?)`

### Important rules
- this page is **global observability**, not index-scoped content
- project scope should affect it
- time range does not currently affect it
- it should stay isolated from Overview / Sessions / Usage load paths

---

## Shared structural components

### DataTable

Used as the common table shell across:
- Sessions
- QMD collections/documents
- QMD logs
- tool detail items
- file activity grid (via table-like structure where applicable)

### PageHeader / breadcrumbs

The shell owns breadcrumbs so detail pages do not each invent their own navigation model.

### Global selectors

The project scope selector and analytics time-range selector belong in the header because they affect multiple pages and should remain visible while navigating.

---

## Current backend command map for page work

### Analytics/session commands
- `list_projects` -> header project scope selector
- `get_analytics_overview(project_path?, range_days?)` -> Overview + Usage shared payload
- `get_all_sessions(project_path?, range_days?)` -> Sessions page
- `get_session_detail(session_id)` -> session metadata and scope guard
- `get_session_entries(session_id)` -> session replay
- `get_project_file_stats(project_path, range_days?)` -> Usage Files tab
- `get_file_sizes(paths[])` -> Usage Files scatter chart
- `get_time_breakdown(range_days, project_path?)` -> Overview + Usage Patterns
- `get_tool_details(tool_name, project_path?, range_days?)` -> Usage Tool Detail
- `resync_sessions` -> global sync action

### QMD commands
- `qmd_check_availability`
- `qmd_list_indexes`
- `qmd_get_status`
- `qmd_list_collections`
- `qmd_get_collection_detail`
- `qmd_add_collection`
- `qmd_remove_collection`
- `qmd_rename_collection`
- `qmd_add_context`
- `qmd_remove_context`
- `qmd_set_global_context`
- `qmd_reindex`
- `qmd_embed`
- `qmd_cleanup`
- `qmd_scan_filesystem`
- `qmd_get_indexed_paths`
- `qmd_toggle_files`
- `qmd_search`

### QMD logs commands
- `get_qmd_logs(project_path?)`
- `get_qmd_log_stats(project_path?)`

---

## IA guardrails

1. **Project selection is a scope control, not a page.** Do not reintroduce a top-level Projects destination casually.
2. **Usage is the analytics workspace.** Do not move tool/cost/pattern/file deep-dives back into Overview.
3. **Session replay stays on session detail.** The Sessions index remains a browsing surface.
4. **QMD management and QMD logs are related but distinct.** Index/collection management is index-scoped; QMD logs is global observability.
5. **Header controls must remain meaningful.** Project scope can stay visible globally; time range should only appear where it actually affects data.
6. **Route order matters under `/qmd`.** Static `/qmd/logs` must remain unambiguous relative to dynamic `/qmd/:index`.
