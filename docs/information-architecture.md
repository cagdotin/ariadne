# Information Architecture

> The guiding document for Ariadne's frontend structure, navigation, and information hierarchy.
> Referenced from `AGENTS.md`. Any page or component changes should align with this architecture.

## Design Philosophy

Ariadne answers **four distinct questions** for developers observing their AI agents:

| Question | Page | Icon |
|---|---|---|
| "What's the pulse?" | **Overview** | `LayoutDashboard` |
| "What's happening in my projects?" | **Projects** | `FolderOpen` |
| "What did specific sessions do?" | **Sessions** | `List` |
| "How are tools/models/costs distributed?" | **Usage** | `BarChart3` |

Each question gets its own top-level sidebar entry. No data should require more than 2 clicks to reach. Detail pages use breadcrumbs for navigation — no manual back buttons.

---

## Navigation

### Sidebar (always visible)
```
├── Overview        /
├── Projects        /projects
├── Sessions        /sessions
└── Usage           /usage
```

### Detail Routes (breadcrumb-navigated)
```
/projects/:name     →  breadcrumb: Projects / {name}
/tools/:tool_name   →  breadcrumb: Usage / {tool_name}
```

### Top Header Bar
- Left: `SidebarTrigger` + breadcrumbs (when on a detail page)
- Right: Sync button + Theme toggle

---

## Pages

### 1. Overview (`/`)

**Purpose**: Morning pulse check. Scannable in 5 seconds. Minimal scrolling.

| Section | Component | Description |
|---|---|---|
| Stat cards | `StatCard` × 4 | Total Sessions, Total Cost, Total Tokens, Projects |
| Activity heatmap | `ActivityHeatmap` | 52-week GitHub-style contribution graph |
| Daily trend | `DailyTrend` | Area chart with 7d/30d/90d/All toggle. Simplified from `TimeBreakdown` — chart only, no tables |
| Top projects | `TopProjects` | 3–5 most active projects as compact clickable cards (name, sessions, cost, last active) |

**What is NOT here**: Tool usage, model distribution, cost breakdown, session tables, file breakdowns. Those live on Usage and Sessions.

---

### 2. Projects (`/projects`)

**Purpose**: Browse and compare all projects.

| Section | Component | Description |
|---|---|---|
| Search/filter | Text input | Filter projects by name |
| Project table | `DataTable` | Sortable columns: Name, Sessions, Cost, Tokens, Last Active. Click → project detail |

---

### 3. Project Detail (`/projects/:name`)

**Purpose**: Deep-dive into a specific project's agent activity.

| Section | Component | Description |
|---|---|---|
| Breadcrumb | `Breadcrumb` | Projects / {name} |
| Stat cards | `StatCard` × 4 | Sessions, Total Cost, Total Tokens, Files Touched |
| Exclude filter | Input with tags | Comma-separated path exclusions |
| Tool distribution | Horizontal bars | Per-project tool call counts |
| Directory hotspots | `DirectoryHotspots` | Stacked R/E/W bars by directory |
| File activity | `DataTable` with tabs | Read / Edit / Write tabs, each a sortable table |
| Sessions | `DataTable` | All sessions for this project |

---

### 4. Sessions (`/sessions`)

**Purpose**: Browse all sessions across all projects. Future: click → session detail page.

| Section | Component | Description |
|---|---|---|
| Filters | Project dropdown + date range | Filter sessions by project and time |
| Session table | `DataTable` | Title, Project, Duration, Cost, Tokens, Tools, Model. Sortable, filterable |

**Future**: `/sessions/:id` detail page showing the full session timeline, tool calls, conversation flow.

---

### 5. Usage (`/usage`)

**Purpose**: Analytics deep-dive — tools, models, costs, time patterns.

Organized in clear card sections, 2-column grid where sensible.

| Section | Component | Description |
|---|---|---|
| Tools | `ToolUsageBar` | Horizontal bar chart. Click bash/read/edit/write → tool detail |
| Models | `ModelDistribution` | Horizontal bar chart of model usage |
| Cost breakdown | `CostBreakdown` | Donut chart + legend (input/output/cache read/cache write) |
| Time patterns | `TimePatterns` | Weekday + time-of-day horizontal bars (no duplicate tables) |
| Tool details | `ToolDetailBreakdown` | 4-card grid: top bash programs, most read/edited/written files |

---

### 6. Tool Detail (`/tools/:tool_name`)

**Purpose**: Deep-dive into a specific tool (bash, read, edit, write).

| Section | Component | Description |
|---|---|---|
| Breadcrumb | `Breadcrumb` | Usage / {tool_name} |
| Project filter | Dropdown | Filter by project |
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
- Used by: Sessions, Projects, Project Detail (files + sessions), Tool Detail (items)

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
- `get_analytics_overview` → Overview, Projects, Usage data
- `get_project_sessions` → Sessions for a project
- `get_project_file_stats` → File/tool stats per project
- `get_time_breakdown` → Weekday, time-of-day, daily trend
- `get_tool_details` → Per-tool deep-dive
- `get_session_detail` → Single session (future: session detail page)
- `resync_sessions` → Re-parse all sessions

---

## Future Considerations

- **Session Detail Page** (`/sessions/:id`): Full session timeline, conversation flow, tool call visualization
- **Cost Trends**: Cost over time chart (daily/weekly), cost by project trend
- **Live Updates**: File watcher for new sessions, real-time dashboard updates
- **Search**: Global search across sessions, projects, files
- **Export**: Export analytics data as CSV/JSON
