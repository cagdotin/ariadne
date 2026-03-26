# DESIGN

Status: active
Last updated: 2026-03-25

This document explains **how** each subsystem of Ariadne works, the design decisions behind them, and the data flows connecting them. For the high-level codemap, see `ARCHITECTURE.md`. For frontend page structure, see `information-architecture.md`.

---

## 1. Session Parsing Pipeline

Ariadne's core capability is parsing pi agent session logs and extracting structured analytics.

### Data source

Pi stores session logs as JSONL files at `~/.pi/agent/sessions/{encoded_project_dir}/{session_id}.jsonl`. Each project directory is a URL-encoded path. Each `.jsonl` file contains one JSON object per line representing a session event.

### JSONL event types

| Type | Description | Key fields |
|---|---|---|
| `session` | Header — first line of every file | `id`, `timestamp`, `cwd` |
| `session_info` | Session metadata (set later) | `name` (title) |
| `message` | Conversation entry | `message.role` (user/assistant/toolResult/bashExecution/custom) |
| `model_change` | Model switch event | `provider`, `modelId` |
| `compaction` | Context window compaction | `summary`, `tokensBefore` |
| `branch_summary` | Branch summary after navigation | `summary`, `fromId` |
| `custom` | Extension-generated event | `customType`, `data` |
| `custom_message` | Extension-generated displayable message | `customType`, `content` |
| `label` | Branch label | `targetId`, `label` |

### Discovery (`parser/discovery.rs`)

`discover_session_files()` walks `~/.pi/agent/sessions/` looking for `.jsonl` files. For each file it records the path, parent directory name (used as session_dir), filename, and file size. Results are sorted by filename for consistent ordering.

### Parsing (`parser/session.rs`)

`parse_session_file()` reads a single JSONL file line by line and builds a `SessionSummary`. The parser:

1. **Extracts session metadata** from the `session` header (id, cwd, timestamp, project name)
2. **Counts messages** by role (user, assistant, toolResult)
3. **Extracts tool call parameters** from assistant message content blocks:
   - `bash` → extracts first token as program name
   - `read`/`Read` → extracts file path
   - `edit`/`Edit` → extracts file path
   - `write`/`Write` → extracts file path
4. **Accumulates token and cost data** from `usage` objects on assistant messages
5. **Tracks model usage** (model + provider pairs with message counts)
6. **Counts compactions** as a signal of long sessions
7. **Calculates duration** from first to last timestamp

### Why parse in Rust?

Pi session files can be large (100K+ lines). Parsing in Rust is fast and avoids sending raw JSONL over IPC. The Rust parser handles malformed lines gracefully — it logs warnings and continues, never failing the entire file.

---

## 2. Session Cache (`cache.rs`)

All parsed session data lives in an in-memory cache behind a `tokio::RwLock<Option<Vec<SessionSummary>>>`.

### Design

- **Lazy initialization** — the cache starts empty. `get_or_init()` checks if data exists; if not, it calls `resync()`.
- **Full resync** — `resync()` re-parses every session file from disk. There's no incremental update; the assumption is that session files are append-only and reparse is fast enough (~1-2 seconds for hundreds of sessions).
- **All aggregation in Rust** — the cache doesn't just store sessions. It computes analytics on demand: `get_analytics_overview()`, `get_project_file_stats()`, `get_time_breakdown()`, `get_tool_details()`. This keeps the frontend thin.

### Analytics computed

| Method | What it computes |
|---|---|
| `get_analytics_overview()` | Total stats, per-project summaries, sessions/cost by date, model/tool aggregates, top files/commands, recent sessions |
| `get_project_sessions()` | Filtered + sorted sessions for one project |
| `get_project_file_stats()` | Per-project tool distribution, file R/E/W counts, directory stats, activity timeline |
| `get_time_breakdown()` | Time-range-filtered stats: weekday distribution, time-of-day buckets, daily sessions/cost |
| `get_tool_details()` | Per-tool breakdown: total calls/errors, items list, by-project, by-date |
| `get_session_entries()` | Raw JSONL entries for session replay (not cached — reads file on demand) |

### Why not a database?

Session data is derived (parsed from JSONL) and relatively small in aggregate. An in-memory cache avoids SQLite setup complexity and is fast for the read patterns we need. If session volume grows past ~10K sessions, we might need to add a persistent cache.

---

## 3. Session Viewer

The session viewer (`src/components/session-viewer/`) is the most complex frontend subsystem at ~2000 lines. It renders a full conversation tree from raw JSONL entries.

### Architecture

```
SessionDetail (page)
  └── SessionViewer
       ├── SessionDetailHeader    stats bar (messages, tokens, cost, model)
       ├── SessionTree            collapsible tree sidebar (left)
       │   └── SessionTreeNode    individual tree node
       └── MessageRenderer        message pane (right)
            ├── UserMessage
            ├── AssistantMessage
            │   ├── ThinkingBlock
            │   ├── MarkdownContent
            │   └── ToolCallRenderer
            ├── BashExecutionBlock
            ├── CompactionBlock
            ├── BranchSummaryBlock
            ├── ModelChangeBlock
            ├── CustomMessageBlock
            └── RawEntryInspector
```

### Tree building

Pi sessions support **branching** — the same parent entry can have multiple children (e.g., when the user retries a message). The session viewer:

1. Builds a tree from `parentId` chains
2. Resolves the current **path** from root to a chosen leaf
3. Renders the path as a linear conversation in the message pane
4. Shows the full tree structure in a collapsible sidebar
5. Allows navigating to any branch by clicking tree nodes

### Tool call resolution

Tool calls in assistant messages are paired with their results. The viewer builds a `tool_result_map` (toolCallId → ToolResultMessage) so each tool call block can display its result inline.

### Rendering pipeline

`MessageRenderer` routes each entry to the correct component based on `type` and `message.role`. Special handling:

- **Thinking blocks** — collapsible, rendered from `thinking` content blocks
- **Bash execution** — shows command, exit code, output with expandable overflow
- **Markdown content** — rendered with `react-markdown`, `remark-gfm`, `rehype-raw`, and `react-syntax-highlighter` for code blocks
- **Compaction events** — shown as a divider with token reduction info
- **Model changes** — inline badge showing provider → model switch

---

## 4. QMD Integration

QMD (Query Markup Documents) is a local semantic search engine for markdown files. Ariadne provides a full GUI for managing QMD indexes, collections, and search.

### Hybrid architecture

QMD's data lives in SQLite databases. Its SDK is TypeScript. Ariadne bridges this gap with two strategies:

| Operation type | Strategy | Why |
|---|---|---|
| **Reads** (status, collections, documents) | Rust reads SQLite directly via `rusqlite` | Fast, no extra process needed |
| **Writes** (add/remove collections, reindex, embed, search) | Sidecar process via JSON-RPC | QMD SDK is TypeScript-only; mutations need its internal APIs |

### Sidecar (`src-sidecar/qmd-bridge.ts`)

A long-lived child process spawned by the Rust backend:

1. **Startup** — Rust finds the bridge script, detects runtime (Bun preferred, Node+tsx fallback), spawns with stdin/stdout pipes
2. **macOS SQLite patch** — On macOS + Bun, patches in Homebrew's SQLite (Apple's system SQLite lacks extension loading needed for sqlite-vec)
3. **Protocol** — Newline-delimited JSON-RPC over stdin/stdout. Each request has `{id, method, params}`, responses have `{id, result}` or `{id, error}`. Progress events have `{id, event, data}`.
4. **Single store** — Keeps one QMD store open at a time. Switches via `switch_index` command.
5. **Health check** — Rust sends `ping` after spawn and checks `{ok: true}` response.
6. **Lifecycle** — Auto-respawn on crash. Clean shutdown on app exit (drops stdin, waits, kills).

### Sidecar methods

| Method | Purpose |
|---|---|
| `ping` | Health check |
| `switch_index` | Close current store, open different database |
| `create_index` | Create empty QMD store at path |
| `add_collection` / `remove_collection` / `rename_collection` | Collection CRUD |
| `add_context` / `remove_context` / `set_global_context` | Context management |
| `update` | Scan filesystem, update document index (streams progress) |
| `embed` | Generate vector embeddings for documents (streams progress) |
| `cleanup` | Clear caches, orphaned data, vacuum |
| `scan_filesystem` | Return file paths matching collection pattern |
| `toggle_files` | Add/remove individual files from index |
| `search` | Full hybrid search pipeline (expand → search → rerank) |

### Multi-index support

QMD supports multiple named indexes, each an independent SQLite database at `~/.cache/qmd/{name}.sqlite`. Ariadne:

- Discovers indexes by scanning `~/.cache/qmd/*.sqlite`
- Shows an index selector bar on all QMD pages
- Routes as `/qmd/:index` and `/qmd/:index/:collection`
- Stores last-visited index in `localStorage`
- The "default" index maps to `index.sqlite` (historical convention)

### Search pipeline

The QMD search modal implements a multi-stage pipeline with live progress:

1. **Query expansion** — LLM generates typed sub-queries (lex, vec, hyde)
2. **Parallel search** — BM25 full-text + vector similarity, run in parallel
3. **RRF fusion** — Reciprocal Rank Fusion merges results from all sub-queries
4. **LLM reranking** — Fine-tuned reranker scores final relevance
5. **Results** — Displayed with scores, snippets, collection tags, and expandable explain traces

### File tree management

Collections can have individual files toggled in/out. The UI shows a file tree with status indicators:

| Indicator | Meaning |
|---|---|
| `●` accent | Fully indexed |
| `◐` accent | Partially indexed (some descendants) |
| `○` dim | Not indexed |
| `◉` accent | Pending add |
| `◎` warning | Pending remove |

Changes are batched as pending operations and applied in one `toggle_files` call. The sidecar handles file reading, hashing, content insertion, and auto-embedding.

---

## 5. Frontend Data Flow

```
                          ┌─────────────────────┐
                          │    React Pages       │
                          │  (dashboard, etc.)   │
                          └────────┬────────────┘
                                   │ calls
                          ┌────────▼────────────┐
                          │    src/api/*.ts      │
                          │  invoke() + Zod      │
                          └────────┬────────────┘
                                   │ Tauri IPC
                          ┌────────▼────────────┐
                          │  commands/*.rs       │
                          │  #[tauri::command]   │
                          └────────┬────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
           ┌───────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
           │ SessionCache │ │ rusqlite │ │ QmdSidecar │
           │  (in-memory) │ │ (read)   │ │ (JSON-RPC) │
           └───────┬──────┘ └────┬─────┘ └─────┬──────┘
                   │             │              │
           ┌───────▼──────┐ ┌───▼──────┐ ┌────▼──────┐
           │   JSONL      │ │ QMD      │ │  Bun      │
           │   files      │ │ SQLite   │ │  sidecar  │
           └──────────────┘ └──────────┘ └───────────┘
```

### IPC pattern

Every Tauri command follows the same pattern:

1. **Frontend** calls `invoke("command_name", { camelCaseParams })` via `src/api/*.ts`
2. **Tauri** auto-converts camelCase params to the Rust function's snake_case params
3. **Rust command** accesses `State<SessionCache>` or `State<QmdSidecar>`, computes result
4. **Rust** returns `Result<T, String>` where T is a `#[derive(Serialize)]` struct
5. **Frontend** validates response with Zod schema, returns typed data

### State management

No external state library. Each page manages its own state with `useState` / `useEffect`. Data is fetched on mount and cached locally per page. The global "Sync" button in the header triggers `resync_sessions()` which clears the Rust cache and re-parses all files, then reloads the page.

---

## 6. Frontend Sections

### Overview (`/`)

The landing page for daily pulse checks. Shows:
- **7 stat cards** with time-range filtering (Today / 7d / 30d / 90d / All)
- **Daily trend** area chart showing sessions and cost over time
- **Top projects** cards ranked by activity
- **Activity heatmap** 52-week GitHub-style contribution grid (always all-time)

Stat cards respond to the range picker — they show range-filtered sessions/cost/tokens alongside all-time totals.

### Sessions (`/sessions`)

Session table scoped by the global project selector. Shows all sessions in all-projects mode, or the selected project's sessions when scoped. The project column is hidden when a single project is selected. Columns: Title, Project (all-projects only), Started, Duration, Cost, Tokens, Model, Tools. Links to session detail.

### Session Detail (`/sessions/:id`)

Full session replay viewer (see Section 3). Two-pane layout: tree sidebar + message pane. Supports branching navigation, tool call expansion, thinking block collapse, and raw JSON inspection.

### Usage (`/usage`)

Analytics deep-dive, scoped by the global project selector:
- Tool usage horizontal bars (bash, read, edit, write, etc.)
- Model distribution bars
- Cost breakdown donut chart (input/output/cache read/cache write)
- Time patterns (weekday + time-of-day distributions)
- Tool detail cards (top bash commands, most read/edited/written files)

When a project is selected, additional scoped-only sections appear:
- Exclude-path filter (comma-separated patterns)
- Per-project tool distribution bars
- Directory hotspots (stacked R/E/W bars per directory)
- File activity tables with Read/Edit/Write tabs

### Tool Detail (`/tools/:tool_name`)

Per-tool deep-dive with project filter:
- Stat cards (total calls, errors, unique items)
- Usage over time area chart
- Items table (all files/programs with count bars)
- By-project breakdown

### QMD (`/qmd/:index`)

QMD index management:
- Index selector bar (switch between indexes)
- Health banner (warnings for missing install, stale data, unembedded docs)
- Stat cards (documents, chunks, collections, DB size)
- Global context editor
- Collections table
- Action buttons (search, add collection, reindex, embed, cleanup)
- Search modal with pipeline visualization

### QMD Collection (`/qmd/:index/:collection`)

Collection management:
- Settings display (path, pattern, ignore patterns)
- Context editor (hierarchical path → description)
- File tree with toggle checkboxes and status indicators
- Action buttons (reindex, embed, rename, remove)

---

## 7. Component Library

Ariadne uses **shadcn/ui** components as the base layer, customized with Tailwind CSS v4.

### Core components from shadcn/ui

Button, Card, Table, Sidebar, Sheet, Dropdown Menu, Popover, Badge, Breadcrumb, Input, Separator, Skeleton, Tooltip.

### Custom components

| Component | Description |
|---|---|
| `DataTable` | Generic sortable/filterable table wrapping TanStack Table + shadcn Table |
| `StatCard` | Compact metric display (label + value + optional sub-label + optional link) |
| `ActivityHeatmap` | 52-week GitHub-style contribution heatmap using CSS grid |
| `DailyTrend` | Recharts area chart with session/cost dual series |
| `TopProjects` | Ranked project cards with activity metrics |
| `ToolUsageBar` | Horizontal bar chart for tool call counts |
| `ModelDistribution` | Horizontal bar chart for model usage |
| `CostBreakdown` | Recharts pie/donut chart for cost categories |
| `DirectoryHotspots` | Stacked horizontal bars (read/edit/write) per directory |
| `QmdSearchModal` | Full search UI with expansion → search → results pipeline |
| `QmdHealthBanner` | Warning banners for QMD state issues |
| `CollectionFileTree` | Tree view with inclusion status indicators |
| `IndexSelector` | Horizontal bar for switching QMD indexes |
| `ContextEditor` | Key-value editor for collection/global contexts |
| `PageHeader` | Breadcrumb navigation component |
| `LabyrinthLogo` | Custom SVG logo |
| `ModeToggle` | Dark/light theme switcher |
| `InfoTip` | Tooltip-based info icons |
| `QmdProgress` | Progress display for indexing/embedding operations |

---

## 8. Schemas and Type Safety

Types flow through three layers that must stay in sync:

```
Rust structs (src-tauri/src/models/)
    ↕ serde serialize (snake_case)
Tauri IPC JSON
    ↕ Zod parse
TypeScript types (src/schemas/)
```

### Pattern

1. Rust defines `#[derive(Serialize)] #[serde(rename_all = "snake_case")]` structs
2. Frontend defines Zod schemas that mirror the Rust shapes exactly
3. `src/api/*.ts` wrappers call `invoke()` and parse with Zod before returning
4. Pages receive fully typed, validated data

### Why Zod at the boundary?

Tauri `invoke()` returns `unknown`. Without validation, type assertions would mask runtime mismatches (e.g., after a Rust refactor). Zod catches these at the earliest possible point with clear error messages.

---

## 9. Build and Development

### Development

```bash
# Install frontend dependencies
bun install

# Install sidecar dependencies
cd src-sidecar && bun install && cd ..

# Run in dev mode (starts both Vite dev server and Tauri)
bun run tauri dev
```

Tauri dev mode runs `bun run dev` (Vite) as the frontend, connects to `http://localhost:1420`, and enables HMR.

### Production build

```bash
bun run tauri build
```

This runs `bun run build` (TypeScript check + Vite production build), then compiles the Rust backend and bundles everything into a native app.

### Key scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start Vite dev server only (port 1420) |
| `bun run build` | TypeScript check + Vite production build |
| `bun run tauri dev` | Full development mode with HMR |
| `bun run tauri build` | Production build → native app bundle |

---

## 10. Design Decisions Log

### Why Tauri over Electron?

Tauri uses the system webview (WebKit on macOS) instead of bundling Chromium. This gives us:
- ~10MB app size vs ~200MB for Electron
- Lower memory usage
- Native Rust backend with direct SQLite access
- First-class sidecar support

### Why a sidecar instead of WASM or direct FFI?

QMD's SDK depends on `node-llama-cpp` for local LLM inference (embeddings, reranking, query expansion). This requires native Node.js addons that can't run in WASM or be called from Rust. The sidecar pattern (JSON-RPC over stdio) is the simplest bridge with minimal overhead.

### Why in-memory cache instead of persistent storage?

The analytics data is derived from JSONL files that are the source of truth. Caching in SQLite would add schema management complexity with minimal benefit — full reparse takes ~1-2 seconds. If this becomes a bottleneck, adding an incremental persistent cache is a straightforward optimization.

### Why Zod over just TypeScript types?

TypeScript types are erased at runtime. Tauri IPC returns `unknown`. Without runtime validation, a Rust refactor (e.g., renaming a field) would cause silent undefined values in the frontend rather than a clear parse error.

### Why TanStack Router over React Router?

TanStack Router provides type-safe routing with full TypeScript inference for route params. The `$id` and `$tool_name` params in routes like `/sessions/$id` and `/tools/$tool_name` are typed at the component level.

### Why direct SQLite reads for QMD?

Read operations are frequent (every page load) and latency-sensitive. Going through the sidecar would add ~5-10ms per call and require the sidecar to be running. Direct SQLite reads via `rusqlite` in read-only mode are near-instant and don't conflict with the sidecar's write operations (QMD uses WAL mode).
