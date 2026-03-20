# Frontend Restructure — Execution Plan

> Restructure Ariadne's frontend to match the [Information Architecture](../../information-architecture.md).
> Move from 2-nav-item monolithic dashboard to 4-page architecture with proper navigation.

## Overview of Changes

### What's Changing
1. Dashboard → slim **Overview** (remove tool/model/cost/session sections)
2. New **Sessions** page (standalone, filterable)
3. New **Usage** page (tools + models + costs + time patterns)
4. **Sidebar**: 2 items → 4 items
5. **Breadcrumbs** on all detail pages
6. **DataTable**: reusable TanStack Table component replaces all ad-hoc tables
7. **TimeBreakdown** split: daily trend → Overview, patterns → Usage, duplicate tables → removed

### What's NOT Changing
- Theme, colors, fonts (already selected)
- Backend API (no Rust changes needed)
- Existing shadcn components (Card, Badge, Chart, etc.)
- ActivityHeatmap, DirectoryHotspots (work well as-is)

---

## Phase 1: Foundation — DataTable + Dependencies

### 1.1 Install TanStack Table
```bash
bun add @tanstack/react-table
```

### 1.2 Create reusable DataTable component
Based on [shadcn data table pattern](https://ui.shadcn.com/docs/components/radix/data-table).

**Files to create:**
- `src/components/data-table/data-table.tsx` — generic table renderer
- `src/components/data-table/data-table-column-header.tsx` — sortable column headers
- `src/components/data-table/index.ts` — barrel export

The DataTable accepts:
- `columns: ColumnDef<T>[]`
- `data: T[]`
- Optional: `filter_column`, `filter_placeholder` for built-in text filter
- Optional: `on_row_click` handler

### 1.3 Define column files for each table use-case
- `src/components/columns/session-columns.tsx`
- `src/components/columns/project-columns.tsx`
- `src/components/columns/tool-item-columns.tsx`
- `src/components/columns/file-activity-columns.tsx`

---

## Phase 2: Navigation — Sidebar + Breadcrumbs

### 2.1 Update sidebar in `app.tsx`
Add 4 nav items: Overview, Projects, Sessions, Usage.
Icons: `LayoutDashboard`, `FolderOpen`, `List`, `BarChart3`.

### 2.2 Add breadcrumb bar
Create `src/components/page-header.tsx`:
- Renders breadcrumbs using shadcn `Breadcrumb` component
- Shows on detail pages: Project Detail, Tool Detail
- Sits below the top header bar (SidebarTrigger + Sync + Theme)

### 2.3 Add new routes in `app.tsx`
```tsx
<Route path="/sessions" element={<Sessions />} />
<Route path="/usage" element={<Usage />} />
```

---

## Phase 3: New Pages

### 3.1 Sessions page (`src/pages/sessions.tsx`)
- Fetch all sessions (need to use `get_analytics_overview` → `recent_sessions`, or add API)
- Project filter dropdown at the top
- DataTable with session columns (Title, Project, Duration, Cost, Tokens, Tools, Model)
- `show_project={true}` always

### 3.2 Usage page (`src/pages/usage.tsx`)
Move these FROM dashboard TO usage:
- `ToolUsageBar` (tool usage chart)
- `ModelDistribution` (model chart)
- `CostBreakdown` (cost pie chart)
- Time patterns (weekday + time-of-day bars from `TimeBreakdown`, without tables)
- `ToolDetailBreakdown` (top bash/read/edit/write)

Layout: organized sections with clear headings, 2-column grid for Tools+Models row.

---

## Phase 4: Slim Down Dashboard → Overview

### 4.1 Simplify dashboard.tsx
Keep:
- Stat cards (4)
- ActivityHeatmap
- Daily trend (extract just the area chart from TimeBreakdown as new `DailyTrend` component)

Add:
- Top projects section (3-5 most active projects as compact clickable cards)

Remove:
- ToolUsageBar (→ Usage)
- ModelDistribution (→ Usage)
- CostBreakdown (→ Usage)
- ToolDetailBreakdown (→ Usage)
- TimeBreakdown full component (→ split: trend stays, patterns → Usage)
- SessionTable (→ Sessions page)

### 4.2 Create `DailyTrend` component
- Area chart with 7d/30d/90d/All toggle
- Extracted from TimeBreakdown's daily trend section
- Simpler: no weekday/time-of-day data, just the trend line

### 4.3 Create `TopProjects` component
- Shows top 3-5 projects by session count
- Each as a compact card: name, session count, cost, last active
- Click → navigates to project detail

---

## Phase 5: Migrate Existing Tables to DataTable

### 5.1 Projects page
Replace custom table with `DataTable` + `project-columns.tsx`.

### 5.2 Project Detail page
- Add breadcrumb: `Projects / {name}`
- Replace file activity raw table with `DataTable` + `file-activity-columns.tsx`
- Replace sessions section with `DataTable` + `session-columns.tsx`
- Use shadcn components consistently (Card for tool distribution section)

### 5.3 Tool Detail page
- Replace breadcrumb: `Usage / {tool_name}` (remove manual back arrow)
- Replace items table with `DataTable` + `tool-item-columns.tsx`

### 5.4 Remove old SessionTable component
After all migrations, delete `src/components/session-table.tsx`.

---

## Phase 6: Cleanup

### 6.1 Remove unused TimeBreakdown component
The full `time-breakdown.tsx` is replaced by:
- `DailyTrend` (on Overview)
- Inline weekday/time-of-day bars (on Usage)

### 6.2 Consistent layout
- Verify all pages use consistent padding, max-width, spacing
- All chart sections in Cards
- No raw HTML tables remaining

### 6.3 Test all routes
- `/` — Overview with stats, heatmap, trend, top projects
- `/projects` — Project list with search
- `/projects/:name` — Project detail with breadcrumb
- `/sessions` — All sessions with project filter
- `/usage` — Tools, models, costs, time patterns
- `/tools/:name` — Tool detail with breadcrumb

---

## File Change Summary

### New Files
- `src/components/data-table/data-table.tsx`
- `src/components/data-table/data-table-column-header.tsx`
- `src/components/data-table/index.ts`
- `src/components/columns/session-columns.tsx`
- `src/components/columns/project-columns.tsx`
- `src/components/columns/tool-item-columns.tsx`
- `src/components/columns/file-activity-columns.tsx`
- `src/components/page-header.tsx`
- `src/components/daily-trend.tsx`
- `src/components/top-projects.tsx`
- `src/pages/sessions.tsx`
- `src/pages/usage.tsx`

### Modified Files
- `src/app.tsx` — sidebar (4 items), routes, breadcrumb integration
- `src/pages/dashboard.tsx` — slim down to Overview
- `src/pages/projects.tsx` — migrate to DataTable
- `src/pages/project-detail.tsx` — add breadcrumb, migrate tables
- `src/pages/tool-detail.tsx` — add breadcrumb, migrate table, remove back arrow

### Deleted Files
- `src/components/session-table.tsx` — replaced by DataTable + session-columns
- `src/components/time-breakdown.tsx` — split into DailyTrend + inline patterns

---

## Dependencies to Add
```bash
bun add @tanstack/react-table
```

## Estimated Effort
- Phase 1 (DataTable): ~1 session
- Phase 2 (Navigation): ~30 min
- Phase 3 (New pages): ~1 session
- Phase 4 (Slim dashboard): ~30 min
- Phase 5 (Migrate tables): ~1 session
- Phase 6 (Cleanup): ~30 min
