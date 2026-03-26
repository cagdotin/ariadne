# Information Architecture

> The guiding document for Ariadne's frontend structure, navigation, and information hierarchy.
> Referenced from `AGENTS.md`. Any page or component changes should align with this architecture.

## Design Philosophy

Ariadne answers **four distinct questions** for developers observing their AI agents:

| Question | Page | Icon |
|---|---|---|
| "What's the pulse?" | **Overview** | `LayoutDashboard` |
| "What did specific sessions do?" | **Sessions** | `List` |
| "How are tools/models/costs distributed?" | **Usage** | `BarChart3` |
| "What's in my knowledge base?" | **QMD** | `Search` |

Each question gets its own top-level sidebar entry. No data should require more than 2 clicks to reach. Detail pages use breadcrumbs for navigation — no manual back buttons.

### Scope-first project model

Project selection is a global scope concern, not a page-level destination. The header project selector controls which project's data appears across all analytics pages. When a project is selected:
- **Overview** shows scoped stat cards, trend, and heatmap; Top Projects is hidden.
- **Sessions** shows only sessions for the selected project.
- **Usage** shows scoped tool/model/cost analytics plus project-specific file analytics (directory hotspots, file activity, tool distribution, exclude-path filtering).

When no project is selected (all-projects mode), Usage shows global analytics only and project-specific file sections are hidden.

---

## Navigation

### Sidebar (always visible)
```
├── Overview        /
├── Sessions        /sessions
├── Usage           /usage
└── QMD             /qmd
```

### Detail Routes (breadcrumb-navigated)
```
/tools/:tool_name            →  breadcrumb: Usage / {tool_name}
/sessions/:id                →  breadcrumb: Sessions / {id…}
/qmd/:index                  →  breadcrumb: QMD / {index}
/qmd/:index/:collection      →  breadcrumb: QMD / {index} / {collection}
```

### Top Header Bar
- Left: `SidebarTrigger` + breadcrumbs (when on a detail page) + project scope selector (on analytics routes)
- Right: Sync button + Theme toggle

---

## Pages

### 1. Overview (`/`)

**Purpose**: Morning pulse check. Scannable in 5 seconds. Minimal scrolling.

| Section | Component | Description |
|---|---|---|
| Range picker | Button group | Today / 7d / 30d / 90d / All — controls stat card and trend time range |
| Stat cards | `StatCard` × 7 | Sessions, Total Cost, Total Tokens, Avg/Session, Projects, Tool Calls, Disk Usage. Time-filtered values show all-time totals as sub-labels. |
| Daily trend | `DailyTrend` | Area chart showing sessions and cost over selected range |
| Top projects | `TopProjects` | 3–5 most active projects as compact clickable cards. Click sets global scope. Hidden when a project is selected. |
| Activity heatmap | `ActivityHeatmap` | 52-week GitHub-style contribution graph (always all-time) |

**What is NOT here**: Tool usage, model distribution, cost breakdown, session tables, file breakdowns. Those live on Usage and Sessions.

---

### 2. Sessions (`/sessions`)

**Purpose**: Browse sessions. Shows all sessions in all-projects mode, or the selected project's sessions when scoped.

| Section | Component | Description |
|---|---|---|
| Session table | `DataTable` | Title, Project (all-projects mode only), Duration, Cost, Tokens, Tools, Model. Sortable, filterable |

Session detail (`/sessions/:id`) provides full session timeline, tool calls, conversation flow.

---

### 3. Usage (`/usage`)

**Purpose**: Analytics deep-dive — tools, models, costs, time patterns, and project-scoped file analytics.

Organized in clear card sections, 2-column grid where sensible. When a project is selected via the global scope, additional project-specific sections appear.

| Section | Component | Scope | Description |
|---|---|---|---|
| Tools | `ToolUsageBar` | Global + scoped | Horizontal bar chart. Click bash/read/edit/write → tool detail |
| Models | `ModelDistribution` | Global + scoped | Horizontal bar chart of model usage |
| Cost breakdown | `CostBreakdown` | Global + scoped | Donut chart + legend (input/output/cache read/cache write) |
| Time patterns | `TimePatterns` | Global + scoped | Weekday + time-of-day horizontal bars |
| Tool details | `ToolDetailBreakdown` | Global + scoped | 4-card grid: top bash programs, most read/edited/written files |
| Exclude filter | Input | Scoped only | Comma-separated path exclusions for file analytics |
| Tool distribution | Horizontal bars | Scoped only | Per-project tool call counts |
| Directory hotspots | `DirectoryHotspots` | Scoped only | Stacked R/E/W bars by directory |
| File activity | `DataTable` with tabs | Scoped only | Read / Edit / Write tabs, each a sortable table |

---

### 4. Tool Detail (`/tools/:tool_name`)

**Purpose**: Deep-dive into a specific tool (bash, read, edit, write).

| Section | Component | Description |
|---|---|---|
| Breadcrumb | `Breadcrumb` | Usage / {tool_name} |
| Stat cards | `StatCard` × 3 | Total Calls, Errors, Unique Items |
| Usage over time | Area chart | Daily usage trend |
| Items table | `DataTable` | All files/programs with count bars |
| By project | Bar chart + table | Usage broken down by project |

---

## Shared Components

### DataTable (reusable)
Based on [shadcn data table pattern](https://ui.shadcn.com/docs/components/radix/data-table) with TanStack Table.

- Column definitions separated from table component
- Sorting, filtering built-in
- Consistent styling across all tables
- Used by: Sessions, Usage (scoped file activity), Tool Detail (items)

### StatCard
Compact metric display. Label + value + optional sub-label.

### Breadcrumb
Uses shadcn `Breadcrumb` component. Shows on all detail pages below the top header bar.

---

## Layout Rules

1. **Consistent content area**: All pages use the same padded container. No mix of full-width and constrained sections.
2. **Cards for all chart sections**: Every chart/visualization is wrapped in a shadcn `Card`.
3. **Responsive grid**: 2-column on `lg`, single column on smaller. Stat cards: 4-column on `sm`, 2-column below.
4. **No redundant data**: If data appears in a bar chart, don't also show it in a table below. Pick one representation.
5. **Section spacing**: Consistent `gap-6` between major sections.

---

## Data Flow

```
~/.pi/agent/sessions/**/*.jsonl
        │
        ▼
  Rust (Tauri backend)           ← Parse, extract, aggregate
        │
        ▼
  Tauri IPC Commands             ← Structured data to frontend
        │
        ▼
  React Pages                    ← Render with shadcn + recharts
```

### API Commands (existing)
- `list_projects` → Lightweight project list for scope selector
- `get_analytics_overview(project_path?)` → Overview, Usage data (global or scoped)
- `get_all_sessions(project_path?)` → Sessions list (global or scoped)
- `get_project_file_stats(project_path)` → File/tool stats for scoped Usage deep-dive
- `get_time_breakdown(range_days, project_path?)` → Weekday, time-of-day, daily trend
- `get_tool_details(tool_name, project_path?)` → Per-tool deep-dive
- `get_session_detail(session_id)` → Single session detail
- `get_session_entries(session_id)` → Session replay entries
- `resync_sessions` → Re-parse all sessions
- `qmd_search` → Hybrid search (expansion + BM25 + vector + reranking) with explain traces

---

### 5. QMD Root (`/qmd`)

**Purpose**: Redirect to the last-visited index or the default index.

Reads `localStorage` key `ariadne:qmd:last-index`. Redirects to `/qmd/{last_index}` if it exists, otherwise `/qmd/default`.

---

### 6. QMD Index Overview (`/qmd/:index`)

**Purpose**: Manage and monitor a single QMD index — its collections, contexts, index health.

An **index** is a named, independent knowledge base. Each index has its own collections, documents, embeddings, and global context. The existing default index (`index.sqlite`) is displayed as `default`.

| Section | Component | Description |
|---|---|---|
| Index selector | `IndexSelector` | Horizontal bar showing all indexes. Active index highlighted with solid primary-color border (`ring-1 ring-primary`). "+ New Index" button with adjacent info tip at end. Hover `⋯` on non-default indexes for rename/delete. |
| Health banner | `QmdHealthBanner` | Warnings: not installed, needs embedding, stale index |
| Stat cards | `StatCard` × 4 | Total Documents, Embedded Chunks, Collections, DB Size |
| Global context | `GlobalContextEditor` | Inline editable text field |
| Collections table | `DataTable` | Name, Path, Pattern, Docs, Embedded, Last Updated, Default. Click → collection detail |
| Actions | Button group | Search trigger, Add Collection, Re-index All, Embed All, Cleanup |
| Search modal | `QmdSearchModal` | Self-contained modal: query input, collection filter pills, pipeline progress (expansion + search timing), ranked result cards with scores/snippets, expandable score breakdown + full document preview. Opens from search trigger in actions bar. |

---

### 7. QMD Collection Detail (`/qmd/:index/:collection`)

**Purpose**: Deep-dive into a single QMD collection — settings, contexts, files.

| Section | Component | Description |
|---|---|---|
| Index selector | `IndexSelector` | Same bar as index overview, active index highlighted |
| Breadcrumb | `Breadcrumb` | QMD / {index} / {collection} |
| Stat cards | `StatCard` × 3 | Documents, Needing Embedding, Last Updated |
| Settings card | `CollectionSettings` | Path, Pattern, Ignore, Include By Default, Update Command |
| Context editor | `ContextEditor` | Key-value list: path prefix → description. Add/edit/remove. |
| File tree | `CollectionFileTree` | Tree view with inclusion indicators and toggle |
| Actions | Button group | Re-index, Embed, Rename, Remove |

---

## Future Considerations

- **Cost Trends**: Cost over time chart (daily/weekly), cost by project trend
- **Live Updates**: File watcher for new sessions, real-time dashboard updates
- **Search**: Global search across sessions, projects, files
- **Export**: Export analytics data as CSV/JSON
- **Usage page reorganization**: Refine the scoped vs. global section layout after the Phase 2 migration stabilizes
