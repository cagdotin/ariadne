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
- **Usage** shows scoped tool/model/cost analytics plus a project-specific file analytics workspace (operation-lens treemap explorer, companion analysis charts, file activity grid, exclude-path filtering).

When no project is selected (all-projects mode), Usage shows global analytics only and project-specific file sections are hidden.

---

## Navigation

### Sidebar (always visible)
```
├── Overview        /
├── Sessions        /sessions
├── Usage           /usage  (redirects to /usage/cost)
└── QMD             /qmd
```

### Usage Sub-Routes (tab-navigated)
```
/usage/cost                   →  Cost analytics
/usage/tools                  →  Tool usage overview
/usage/tools/:tool_name       →  breadcrumb: Usage / {tool_name}
/usage/patterns               →  Activity patterns
/usage/files                  →  File analytics (scoped only)
```

### Detail Routes (breadcrumb-navigated)
```
/sessions/:id                →  breadcrumb: Sessions / {id…}
/qmd/:index                  →  breadcrumb: QMD / {index}
/qmd/:index/:collection      →  breadcrumb: QMD / {index} / {collection}
```

### Top Header Bar
- Left: `SidebarTrigger` + project scope selector + breadcrumbs
- Right: Global analytics time-range selector (Today / 7d / 30d / 90d / All) + Sync button + Theme toggle

The time-range selector is a global analytics scope control, persisted in local storage. It applies to Overview, Sessions, Usage tabs, and Tool Detail. It collapses into a compact dropdown on narrow/mobile widths. It is hidden on Session Detail and QMD routes.

---

## Pages

### 1. Overview (`/`)

**Purpose**: Morning pulse check. Scannable in 5 seconds. Minimal scrolling.

| Section | Component | Description |
|---|---|---|
| Stat cards | `StatCard` × 7 | Sessions, Total Cost, Total Tokens, Avg/Session, Projects, Tool Calls, Disk Usage. Time-filtered values show all-time totals as sub-labels. Time range is controlled by the global header selector. |
| Daily trend | `DailyTrend` | Area chart showing sessions and cost over selected range |
| Top projects | `TopProjects` | 3–5 most active projects as compact clickable cards. Click sets global scope. Hidden when a project is selected. |
| Activity heatmap | `ActivityHeatmap` | 52-week GitHub-style contribution graph (always all-time) |

**What is NOT here**: Tool usage, model distribution, cost breakdown, session tables, file breakdowns. Those live on Usage and Sessions.

---

### 2. Sessions (`/sessions`)

**Purpose**: Browse sessions. Shows all sessions in all-projects mode, or the selected project's sessions when scoped. Respects the global analytics time-range selector in the header.

| Section | Component | Description |
|---|---|---|
| Session table | `DataTable` | Title, Project (all-projects mode only), Duration, Cost, Tokens, Tools, Model. Sortable, filterable. Time-range filtered server-side via the global header selector. |

Session detail (`/sessions/:id`) provides full session timeline, tool calls, conversation flow.

---

### 3. Usage (`/usage`)

**Purpose**: Analytics deep-dive — costs, tools, activity patterns, and project-scoped file analytics.

Organized as a **4-tab layout**. The global time-range selector in the header (Today / 7d / 30d / 90d / All) applies to all tabs. The time range is passed to backend endpoints so filtering happens server-side. When a project is selected via the global scope, a Files tab appears.

#### Tab 1: Cost — *"How much am I spending?"*

| Section | Component | Description |
|---|---|---|
| Stat cards | `MiniStat` × 4 | Total Cost, Sessions, Avg/Session, Total Tokens |
| Cost breakdown | `CostBreakdown` | Donut chart + legend (input/output/cache read/cache write) |
| Token breakdown | `TokenBreakdown` | Horizontal bars showing input/output/cache token distribution + cache hit rate |
| Cost over time | `CostTrend` | Area chart of daily cost |
| Model distribution | `ModelDistribution` | Horizontal bar chart of model usage by message count |

#### Tab 2: Tools — *"What is the agent doing?"*

| Section | Component | Description |
|---|---|---|
| Stat cards | `MiniStat` × 4 | Total Calls, Errors, Error Rate, Unique Tools |
| Tool usage | `ToolUsageBar` | Horizontal bar chart. Click bash/read/edit/write → tool detail |
| Error rates | `ToolErrorRates` | Tools sorted by failure rate with bars |
| Tool details | `ToolDetailBreakdown` | 4-card grid: top bash programs, most read/edited/written files |

#### Tab 3: Patterns — *"When am I using agents?"*

| Section | Component | Description |
|---|---|---|
| Stat cards | `MiniStat` × 4 | Sessions, Total Cost, Avg/Session, Total Tokens (range-labeled) |
| Day of week | `WeekdayChart` | Horizontal bars |
| Time of day | `TimeOfDayChart` | Horizontal bars |
| Sessions over time | `SessionsTrend` | Area chart of daily session count |

#### Tab 4: Files — *"What files are being touched?"* (scoped only)

A file analytics workspace with shared controls and multiple complementary views. All views share the same project scope, date range, exclude-path filter, and operation lens.

| Section | Component | Description |
|---|---|---|
| Stat cards | `MiniStat` × 4 | Sessions, Files Read, Files Edited, Files Written |
| Operation lens | `OperationLensPicker` | All / Read / Edit / Write — shared control that drives treemap area sizing and companion chart filtering |
| Exclude filter | Input | Comma-separated path exclusions for file analytics, with hidden-count badge |
| File treemap | `FileHotspotTreemap` | Primary explorer. Rectangle area = selected operation count. Color hue = dominant op type (All) or fixed op hue (single-op). Intensity = GitHub-style bucketed activity level. Click directories to drill down; breadcrumb bar navigates back. Tooltip shows R/E/W counts, percentages, and total. Legend explains area, color, and intensity semantics. |
| Read vs change imbalance | `FileImbalanceChart` | Horizontal stacked bars per file showing read ratio vs change (edit+write) ratio. Sorted by skew from 50/50 — most imbalanced files surface first. Lens-independent. |
| Session breadth | `FileSessionBreadthChart` | Bar chart ranking files by distinct session count. Bar width = sessions, intensity = ops/session under active lens. Distinguishes broadly important files from one-session noise. |
| Size vs activity scatter | `FileSizeActivityScatter` | Scatter plot with log-log axes: X = file size, Y = selected operation count. Fetches file sizes asynchronously (two-phase). Reports count of files excluded due to missing size metadata. |
| File activity grid | `FileHotspotGrid` | Precise lookup table. Sortable by R/E/W/Total, searchable, paginated. Heat-colored cells show relative frequency per column. |

---

### 4. Tool Detail (`/usage/tools/:tool_name`)

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

### API Commands
- `list_projects` → Lightweight project list for scope selector
- `get_analytics_overview(project_path?, range_days?)` → Overview, Usage data (global or scoped)
- `get_all_sessions(project_path?, range_days?)` → Sessions list (global or scoped, time-range filtered)
- `get_project_file_stats(project_path, range_days?)` → File/tool stats for scoped Usage deep-dive. Returns unified `file_insights` with per-file read/edit/write/total counts and distinct session counts, plus legacy separate arrays for backward compatibility.
- `get_file_sizes(paths[])` → Async file size lookup. Stats each path on disk, returns `null` for deleted/inaccessible files. Called separately from `get_project_file_stats` to keep the main response fast (two-phase pattern).
- `get_time_breakdown(range_days, project_path?)` → Weekday, time-of-day, daily trend
- `get_tool_details(tool_name, project_path?, range_days?)` → Per-tool deep-dive (time-range filtered)
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

- **Live Updates**: File watcher for new sessions, real-time dashboard updates
- **Search**: Global search across sessions, projects, files
- **Export**: Export analytics data as CSV/JSON
- **Session Efficiency Metrics**: Cost per turn, cache savings estimate, duration distributions
- **Error Trends**: Error rate over time, most error-prone operations
