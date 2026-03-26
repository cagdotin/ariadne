# Ariadne — Rebuild Spec 06: Frontend Pages

> Complete behavior specification for every page component.

## State Management Pattern

No external state library. Each page:
1. Has local state via `useState`
2. Fetches data in `useEffect` on mount
3. Shows loading skeletons while fetching
4. Shows error state with destructive styling on failure
5. The global "Sync" button triggers cache resync + full page reload

---

## 1. Dashboard (`/`) — `src/pages/dashboard.tsx`

**Purpose:** Morning pulse check. Scannable in 5 seconds.

### Data source
Calls `get_analytics_overview()` on mount.

### Sections (top to bottom)

1. **Stat cards** (4 cards in a responsive grid — 4-col on sm, 2-col below):
   - Total Sessions (`total_sessions`)
   - Total Cost (`total_cost`, formatted as $)
   - Total Tokens (`total_tokens`, formatted as K/M)
   - Projects (`total_projects`)

2. **Activity heatmap** — 52-week GitHub-style contribution grid. Uses `sessions_by_date`. Always shows all-time data.

3. **Daily trend** — Recharts area chart showing sessions and cost over time. Has a range toggle (7d / 30d / 90d / All) that fetches `get_time_breakdown(range_days)` and uses `daily_sessions` + `daily_cost`.

4. **Top projects** — 3-5 most active projects as clickable cards. Shows name, session count, cost, last active. Sorted by session count descending. Links to `/projects/$name`.

---

## 2. Projects (`/projects`) — `src/pages/projects.tsx`

**Purpose:** Browse and compare all projects.

### Data source
Uses `projects` from `get_analytics_overview()`.

### Sections

1. **Text search input** — filters projects by name (case-insensitive substring match)
2. **DataTable** with sortable columns:
   - Name (links to `/projects/$name`)
   - Sessions (count)
   - Cost (formatted $)
   - Tokens (formatted K/M)
   - Last Active (relative date)

---

## 3. Project Detail (`/projects/$name`) — `src/pages/project-detail.tsx`

**Purpose:** Deep-dive into a specific project.

### Data sources
- `get_project_file_stats(project_name)` for file/tool data
- `get_project_sessions(project_name)` for session list

### Sections

1. **Stat cards** (4 cards): Sessions, Total Cost, Total Tokens, Files Touched (unique read+edit+write files)

2. **Exclude filter** — text input with comma-separated path patterns. When set, filters out matching file paths from all file-related displays.

3. **Tool distribution** — horizontal bars showing per-project tool call counts (from `tool_distribution`)

4. **Directory hotspots** — stacked horizontal bars (read/edit/write) per directory, sorted by total activity. From `directory_stats`. Applies exclude filter.

5. **File activity** — DataTable with 3 tabs (Read / Edit / Write). Each tab shows a sortable table with File path and Count columns. Applies exclude filter.

6. **Sessions** — DataTable of all sessions for this project. Columns: Title, Started, Duration, Cost, Tokens, Model. Links to `/sessions/$id`.

---

## 4. Sessions (`/sessions`) — `src/pages/sessions.tsx`

**Purpose:** Browse all sessions across all projects.

### Data source
Calls `get_all_sessions(project_name)` on mount and when filter changes.

### Sections

1. **Project dropdown filter** — shows all available projects. "All Projects" is default.
2. **DataTable** with sortable columns:
   - Title (or "Untitled" if null, links to `/sessions/$id`)
   - Project (links to `/projects/$name`)
   - Started (formatted date)
   - Duration (formatted)
   - Cost (formatted $)
   - Tokens (formatted K/M)
   - Model (primary model from models_used)
   - Tools (total tool call count)

---

## 5. Session Detail (`/sessions/$id`) — `src/pages/session-detail.tsx`

**Purpose:** Full session replay.

Delegates entirely to the `SessionViewer` component (see spec 07). This page:
1. Reads `$id` from route params
2. Calls `get_session_entries(id)` and `get_session_detail(id)` on mount
3. Passes data to `<SessionViewer />`
4. Uses `overflow-hidden` in the app layout to let the viewer manage its own scrolling

---

## 6. Usage (`/usage`) — `src/pages/usage.tsx`

**Purpose:** Cross-project analytics dashboard.

### Data sources
- `get_analytics_overview()` for tools, models, costs
- `get_time_breakdown(range_days)` for time patterns

### Sections

1. **Tool usage** — `ToolUsageBar` horizontal bar chart. Each tool (bash, read, edit, write, etc.) shows total calls. Clicking a bar navigates to `/tools/$tool_name`.

2. **Model distribution** — `ModelDistribution` horizontal bars showing message count per model/provider pair.

3. **Cost breakdown** — `CostBreakdown` donut/pie chart with 4 slices: Input, Output, Cache Read, Cache Write.

4. **Time patterns** — Weekday distribution (Mon-Sun horizontal bars) + time-of-day distribution (5 buckets). Shows sessions and cost shares.

5. **Tool detail cards** — 4-card grid:
   - Top bash commands (from `top_bash_commands`)
   - Most read files (from `top_read_files`)
   - Most edited files (from `top_edit_files`)
   - Most written files (from `top_write_files`)

---

## 7. Tool Detail (`/tools/$tool_name`) — `src/pages/tool-detail.tsx`

**Purpose:** Per-tool deep-dive.

### Data source
Calls `get_tool_details(tool_name, project_name)`. Refetches when project filter changes.

### Sections

1. **Project dropdown filter** — same as sessions page
2. **Stat cards** (3 cards): Total Calls, Errors, Unique Items
3. **Usage over time** — Recharts area chart from `by_date`
4. **Items table** — DataTable of all files/programs with count column (shows horizontal bar proportional to max count)
5. **By project breakdown** — cards per project showing top items

---

## 8. QMD Redirect (`/qmd`) — `src/pages/qmd-redirect.tsx`

Reads `localStorage` key `ariadne:qmd:last-index`. Redirects to `/qmd/{last_index}` if set, otherwise `/qmd/default`.

---

## 9. QMD Index (`/qmd/$index`) — `src/pages/qmd.tsx`

**Purpose:** Manage and monitor a single QMD index.

### Data sources
- `qmd_list_indexes()` for index list
- `qmd_get_status(index)` for stats
- `qmd_list_collections(index)` for collection table
- `qmd_check_availability()` for health info

### Sections

1. **Index selector** — horizontal bar showing all indexes. Active index has solid primary border (`ring-1 ring-primary`). "+ New Index" button at end. Non-default indexes have a `⋯` hover menu for rename/delete.

2. **Health banner** — warning banners for:
   - QMD not installed
   - Documents needing embedding
   - Stale index (days_since_update > 7)

3. **Stat cards** (4 cards): Total Documents, Embedded Chunks, Collections, DB Size

4. **Global context editor** — inline editable text field for `global_context`. Saves on blur via `qmd_set_global_context()`.

5. **Collections table** — DataTable with columns: Name (links to `/qmd/$index/$collection`), Path, Pattern, Documents, Embedded, Last Updated

6. **Action buttons**: Search (opens modal), Add Collection (opens dialog), Re-index All, Embed All, Cleanup

7. **Search modal** — `QmdSearchModal` with:
   - Query input + collection filter pills
   - Pipeline progress visualization (expanding → searching)
   - Result cards with score, snippet, collection tag
   - Expandable score breakdown (RRF contributions, rerank score)
   - Full document preview

### Side effects
- Saves current index to `localStorage` key `ariadne:qmd:last-index`
- Create/delete/rename index operations refetch the index list

---

## 10. QMD Collection (`/qmd/$index/$collection`) — `src/pages/qmd-collection.tsx`

**Purpose:** Manage a single QMD collection.

### Data sources
- `qmd_get_collection_detail(index, collection)` for settings + documents
- `qmd_scan_filesystem(index, collection)` for filesystem file tree
- `qmd_get_indexed_paths(index, collection)` for indexed paths

### Sections

1. **Index selector** — same bar as QMD index page

2. **Stat cards** (3 cards): Documents, Needing Embedding, Last Updated

3. **Settings card** — displays Path, Pattern, Ignore patterns, Include By Default

4. **Context editor** — key-value list where each entry is `path → description`. Add/edit/remove contexts via `qmd_add_context()` / `qmd_remove_context()`.

5. **File tree** — `CollectionFileTree` showing all files from filesystem scan. Each file/directory has an inclusion indicator:
   - `●` accent — fully indexed
   - `◐` accent — partially indexed (directory with some descendants)
   - `○` dim — not indexed
   - `◉` accent — pending add
   - `◎` warning — pending remove

   Toggle checkboxes allow batch changes. "Apply" button sends `qmd_toggle_files()` with pending adds/removes.

6. **Action buttons**: Re-index, Embed, Rename, Remove (with confirmation)
