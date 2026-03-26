# ARCHITECTURE

Status: active
Last updated: 2026-03-25

---

## Bird's eye

Ariadne is a **desktop observation layer for AI coding agents**. Named after the mythological figure who gave Theseus the thread to navigate the Minotaur's labyrinth — Ariadne gives developers the thread to navigate what their agents are actually doing across complex codebases.

It is a **Tauri v2 desktop application** with a Rust backend and React frontend. It currently observes **pi** coding agent sessions by parsing JSONL session logs, and integrates with **QMD** (Query Markup Documents) for semantic search over knowledge bases.

### What it does

- **Session analytics** — parses pi agent session files (`~/.pi/agent/sessions/**/*.jsonl`), extracts cost, token, tool, model, and file activity data, aggregates across projects
- **Session replay** — renders full conversation trees with branching, tool calls, thinking blocks, compactions, and model changes
- **Project analytics** — per-project drill-downs into file hotspots, directory activity, tool distribution
- **Usage analytics** — cross-project tool/model/cost/time-pattern breakdowns
- **QMD integration** — manages QMD semantic search indexes, collections, contexts, file inclusion, and runs hybrid search (BM25 + vector + reranking)

---

## Technology Stack

### Backend (Rust / Tauri)

| Technology | Purpose | Version |
|---|---|---|
| Tauri v2 | Desktop app framework (Rust backend, webview frontend) | 2.x |
| Rust | Backend language | 2021 edition |
| rusqlite | Direct SQLite reads for QMD index data | 0.34 (bundled) |
| serde / serde_json | Serialization for all IPC data | 1.x |
| walkdir | Recursive session file discovery | 2.x |
| chrono | Date/time parsing and arithmetic | 0.4 |
| tokio | Async runtime (RwLock for cache, spawn_blocking) | 1.x |
| dirs | Home directory resolution | 6.x |
| regex | Input validation (index naming) | 1.x |

### Frontend (React / TypeScript)

| Technology | Purpose | Version |
|---|---|---|
| React | UI framework | 19.x |
| TypeScript | Type safety | 5.8 |
| Vite | Build tool and dev server | 7.x |
| TanStack Router | Client-side routing | 1.168+ |
| TanStack Table | Data tables with sorting/filtering | 8.x |
| Tailwind CSS v4 | Utility-first styling | 4.x |
| shadcn/ui | Component library (Button, Card, Table, Sidebar, etc.) | 4.x |
| Recharts | Charting (area, bar, pie, heatmap) | 2.15 |
| Zod | Runtime schema validation at IPC boundary | 4.x |
| Lucide React | Icon library | 0.577+ |
| react-markdown | Markdown rendering in session viewer | 10.x |
| react-syntax-highlighter | Code block syntax highlighting | 16.x |
| Motion (Framer) | Animations | 12.x |
| date-fns | Date utilities | 4.x |
| Geist | Font family | — |

### Sidecar (TypeScript / Bun)

| Technology | Purpose |
|---|---|
| Bun | Runtime for sidecar process |
| @tobilu/qmd v2 | QMD SDK — semantic search, indexing, embedding |
| fast-glob | Filesystem scanning for file tree |
| node-llama-cpp | LLM inference (via QMD, for embeddings/reranking/expansion) |

### Development

| Tool | Purpose |
|---|---|
| Bun | Package manager and script runner |
| Cargo | Rust build system |
| Tauri CLI | App building and dev mode |

---

## Codemap

### `src/` — Frontend (React)

```
src/
├── main.tsx                 Entry point, keyboard shortcuts, router mount
├── app.tsx                  Root layout — sidebar, header, breadcrumbs, theme
├── router.tsx               All route definitions (TanStack Router)
├── api/                     Tauri IPC wrappers with Zod validation
│   ├── analytics.ts         Session/project/usage analytics commands
│   └── qmd.ts              QMD index/collection/search commands
├── schemas/                 Zod schemas mirroring Rust model types
│   ├── session.ts           SessionSummary, ToolCallSummary, ModelUsage
│   ├── analytics.ts         AnalyticsOverview, TimeBreakdown, ProjectFileStats, etc.
│   └── qmd.ts              QmdAvailability, QmdIndex, QmdCollection, QmdSearchResult, etc.
├── pages/                   Route components (one per page)
│   ├── dashboard.tsx        Overview / landing page
│   ├── projects.tsx         All projects table
│   ├── project-detail.tsx   Per-project drill-down
│   ├── sessions.tsx         All sessions table
│   ├── session-detail.tsx   Session replay viewer
│   ├── usage.tsx            Tool/model/cost/time analytics
│   ├── tool-detail.tsx      Per-tool drill-down
│   ├── qmd.tsx              QMD index overview
│   ├── qmd-redirect.tsx     Redirect /qmd → /qmd/{last_index}
│   └── qmd-collection.tsx   QMD collection detail
├── components/
│   ├── session-viewer/      Session replay subsystem (~2000 LOC)
│   │   ├── session-viewer.tsx    Main viewer — tree + message pane
│   │   ├── session-tree.tsx      Conversation tree sidebar
│   │   ├── message-renderer.tsx  Entry→component routing
│   │   ├── assistant-message.tsx Markdown + tool call rendering
│   │   ├── user-message.tsx      User message rendering
│   │   ├── thinking-block.tsx    Thinking/reasoning block
│   │   ├── bash-execution-block.tsx  Bash output with expandable output
│   │   ├── tool-call-renderer.tsx    Generic tool call rendering
│   │   ├── compaction-block.tsx      Compaction event display
│   │   ├── branch-summary-block.tsx  Branch summary display
│   │   ├── model-change-block.tsx    Model switch event
│   │   ├── custom-message-block.tsx  Custom/extension messages
│   │   ├── expandable-output.tsx     Collapsible long output
│   │   ├── markdown-content.tsx      Markdown renderer with syntax highlighting
│   │   ├── raw-entry-inspector.tsx   JSON inspector for debugging
│   │   ├── session-detail-header.tsx Stats bar above viewer
│   │   ├── session-tree-node.tsx     Tree node rendering
│   │   ├── types.ts                 All JSONL entry types
│   │   └── utils.ts                 Tree building and path resolution
│   ├── data-table/          Reusable sortable/filterable table
│   ├── columns/             Column definitions for each data table
│   ├── ui/                  shadcn/ui primitives
│   ├── activity-heatmap.tsx GitHub-style contribution heatmap
│   ├── daily-trend.tsx      Area chart with range toggle
│   ├── stat-card.tsx        Compact metric card
│   ├── top-projects.tsx     Most active projects cards
│   ├── tool-usage-bar.tsx   Horizontal tool usage bars
│   ├── model-distribution.tsx  Model usage breakdown
│   ├── cost-breakdown.tsx   Donut chart for cost categories
│   ├── directory-hotspots.tsx  Stacked R/E/W bars by directory
│   ├── qmd-search-modal.tsx Search modal with pipeline stages
│   ├── qmd-health-banner.tsx  Warning banners for QMD state
│   ├── collection-file-tree.tsx  File tree with toggle UI
│   ├── index-selector.tsx   Horizontal index switcher bar
│   ├── context-editor.tsx   Key-value context editor
│   └── ...                  Theme, logo, mode toggle, etc.
├── hooks/                   Custom React hooks
├── lib/                     Utility functions (format, utils, qmd-tree, toggle-state)
└── styles/global.css        Tailwind imports and custom styles
```

### `src-tauri/` — Backend (Rust)

```
src-tauri/
├── src/
│   ├── main.rs              Windows entry point
│   ├── lib.rs               App builder — plugins, state, command registration
│   ├── cache.rs             SessionCache — in-memory cache with RwLock, all analytics aggregation
│   ├── sidecar.rs           QmdSidecar — child process manager, JSON-RPC protocol
│   ├── models/
│   │   ├── mod.rs
│   │   ├── session.rs       SessionSummary, ToolCallSummary, ModelUsage, SessionEntriesResponse
│   │   ├── analytics.rs     AnalyticsOverview, ProjectSummary, TimeBreakdown, etc.
│   │   └── qmd.rs           QmdAvailability, QmdIndex, QmdCollection, QmdStatus, etc.
│   ├── parser/
│   │   ├── mod.rs
│   │   ├── discovery.rs     Walks ~/.pi/agent/sessions/ to find .jsonl files
│   │   └── session.rs       Line-by-line JSONL parser → SessionSummary
│   └── commands/
│       ├── mod.rs
│       ├── analytics.rs     Tauri IPC commands for session/project/usage data
│       └── qmd.rs           Tauri IPC commands for QMD (reads + sidecar mutations)
├── tauri.conf.json          App config — window size, build commands, CSP
├── capabilities/            Tauri permission capabilities
├── Cargo.toml               Rust dependencies
└── icons/                   App icons for all platforms
```

### `src-sidecar/` — QMD Bridge (TypeScript)

```
src-sidecar/
├── qmd-bridge.ts            JSON-RPC bridge wrapping @tobilu/qmd SDK
├── package.json             Dependencies: @tobilu/qmd, fast-glob
└── tsconfig.json
```

### `docs/` — Documentation

```
docs/
├── README.md                This documentation map
├── ARCHITECTURE.md          Codemap, stack, boundaries (this file)
├── DESIGN.md                Detailed design — every subsystem explained
├── information-architecture.md  Frontend page structure and layout rules
├── knowledge/               Reference docs for external integrations
├── specs/                   Implementation specs
└── exec-plans/              Execution plans
```

### Root files

```
AGENTS.md                    Agent entry point — coding styles, skills, git rules
package.json                 Frontend dependencies, scripts (dev/build/tauri)
vite.config.ts               Vite config with Tauri integration
tsconfig.json                TypeScript config
components.json              shadcn/ui config
index.html                   HTML entry point
```

---

## Boundaries

### Frontend ↔ Backend

All communication uses **Tauri IPC** (`invoke`). The frontend never reads files directly — it calls Tauri commands and receives structured data. Every IPC response is validated with Zod schemas before use.

### Backend ↔ QMD (reads)

**Direct SQLite access** via `rusqlite` in read-only mode. Fast, no extra processes. The Rust backend queries QMD's SQLite tables directly for collection listings, document counts, status, etc.

### Backend ↔ QMD (writes/search)

**Sidecar process** — a long-lived Bun child process running `qmd-bridge.ts`. Communicates via **newline-delimited JSON-RPC over stdin/stdout**. Handles collection CRUD, indexing, embedding, file toggling, and hybrid search. The Rust side manages lifecycle (spawn, health check, respawn on crash, kill on exit).

### Session data ↔ App

**Read-only observation.** Ariadne never writes to `~/.pi/agent/sessions/`. It only reads and parses the JSONL session logs.

---

## Invariants

1. **Bun only.** Use `bun`, `bun run`, and `bunx` throughout code and docs. The sidecar also prefers Bun, falling back to Node + tsx.
2. **Read-only observation.** Ariadne never modifies pi session data. It is a pure observation layer.
3. **Zod at the IPC boundary.** Every Tauri command response is validated with a Zod schema on the frontend before use.
4. **Rust models mirror frontend schemas.** The `models/` Rust types and `schemas/` Zod types must stay in sync. Both use `snake_case` field names.
5. **Single sidecar process.** Only one QMD sidecar runs at a time. It switches indexes via `switch_index` rather than spawning multiple processes.
6. **QMD reads in read-only mode.** Rust opens QMD SQLite with `SQLITE_OPEN_READ_ONLY` to avoid WAL contention with the sidecar.
7. **Progressive disclosure in docs.** `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/DESIGN.md` → focused docs → source.

---

## Cross-cutting concerns

### Naming conventions

- Files and directories: `kebab-case`
- Functions and variables: `snake_case`
- Types and classes: `CamelCase`

### Theme system

Dark/light mode via `ThemeProvider`. Stored in `localStorage` key `ariadne-ui-theme`. Default is dark. Tailwind CSS v4 with CSS custom properties.

### Data validation

Zod schemas at IPC boundaries. Rust uses `serde` with `#[serde(rename_all = "snake_case")]` for consistent field naming across the IPC bridge.

### Keyboard shortcuts

- `Cmd+[` / `Cmd+]` — browser-style back/forward navigation
- Standard sidebar collapse/expand via trigger button

### Error handling

- Frontend: try/catch around all IPC calls, error states shown in-page with destructive styling
- Backend: `Result<T, String>` on all Tauri commands, errors propagated as strings
- Sidecar: JSON-RPC error responses with code and message, Rust respawns on crash
