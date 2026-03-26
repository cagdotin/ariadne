# Ariadne — Rebuild Spec 08: Frontend Components

> All custom components: charts, tables, analytics widgets, and QMD management UI.

## Component Inventory

### Data Display Components

| Component | File | Used by |
|---|---|---|
| StatCard | `stat-card.tsx` | Dashboard, Project Detail, Usage, Tool Detail, QMD |
| DataTable | `data-table/` | Projects, Sessions, Project Detail, Tool Detail, QMD |
| ActivityHeatmap | `activity-heatmap.tsx` | Dashboard |
| DailyTrend | `daily-trend.tsx` | Dashboard |
| TopProjects | `top-projects.tsx` | Dashboard |
| ToolUsageBar | `tool-usage-bar.tsx` | Usage |
| ModelDistribution | `model-distribution.tsx` | Usage |
| CostBreakdown | `cost-breakdown.tsx` | Usage |
| DirectoryHotspots | `directory-hotspots.tsx` | Project Detail |
| ToolDetailBreakdown | `tool-detail-breakdown.tsx` | Usage |
| InfoTip | `info-tip.tsx` | Various |

### QMD Components

| Component | File | Used by |
|---|---|---|
| IndexSelector | `index-selector.tsx` | QMD, QMD Collection |
| QmdHealthBanner | `qmd-health-banner.tsx` | QMD |
| QmdSearchModal | `qmd-search-modal.tsx` | QMD |
| QmdProgress | `qmd-progress.tsx` | QMD, QMD Collection |
| CollectionFileTree | `collection-file-tree.tsx` | QMD Collection |
| ContextEditor | `context-editor.tsx` | QMD Collection |
| GlobalContextEditor | `global-context-editor.tsx` | QMD |
| AddCollectionDialog | `add-collection-dialog.tsx` | QMD |
| CreateIndexDialog | `create-index-dialog.tsx` | QMD |
| DeleteIndexDialog | `delete-index-dialog.tsx` | QMD |

### Column Definitions

| File | Used by |
|---|---|
| `columns/project-columns.tsx` | Projects page |
| `columns/session-columns.tsx` | Sessions page, Project Detail |
| `columns/file-activity-columns.tsx` | Project Detail |
| `columns/tool-item-columns.tsx` | Tool Detail |
| `columns/qmd-collection-columns.tsx` | QMD index page |
| `columns/qmd-document-columns.tsx` | QMD collection page |

---

## StatCard

**Props:** `{ label: string, value: string | number, sub_label?: string, href?: string, icon?: ReactNode }`

Compact metric card using shadcn `Card`. Shows:
- Label (muted text, small)
- Value (large, bold)
- Optional sub-label (muted, small)
- Optional link wrapping (makes card clickable)

Grid layout: 4-column on `sm`, 2-column on `xs`.

---

## DataTable

Reusable sortable/filterable table built on TanStack Table + shadcn Table.

### Structure
```
data-table/
├── data-table.tsx              # Main component
├── data-table-column-header.tsx # Sortable column headers
└── index.ts                    # Re-export
```

### Props
```typescript
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filter_column?: string;       // column to use for text filter
  filter_placeholder?: string;
}
```

### Features
- Sortable columns (click header to cycle asc/desc/none)
- Optional text filter input
- Responsive — horizontal scroll on narrow viewports
- Empty state message when no data

### Column header component
Shows column label + sort indicator (↑ ↓ or ↕). Clicking toggles sort direction.

---

## ActivityHeatmap

52-week GitHub-style contribution heatmap.

**Props:** `{ data: { date: string, count: number }[] }`

### Implementation
- Pure CSS grid layout (no canvas/SVG library)
- 7 rows (Sun–Sat) × ~53 columns (weeks)
- 5 color intensity levels based on count percentiles
- Tooltip on hover showing date + count
- Month labels along the top
- Day labels (Mon, Wed, Fri) along the left

### Color levels
- Level 0: `bg-secondary` (no activity)
- Level 1-4: Increasing intensity of `chart-1` color with opacity

---

## DailyTrend

**Props:** `{ daily_sessions: DayCount[], daily_cost: DayCost[] }`

Recharts `AreaChart` with two series:
- Sessions (area, left Y-axis)
- Cost (area, right Y-axis)

Has a range toggle: 7d / 30d / 90d / All. Changing the range calls `get_time_breakdown(range_days)` to get filtered data.

---

## TopProjects

**Props:** `{ projects: ProjectSummary[] }`

Shows 3-5 most active projects as compact clickable cards:
- Project name
- Session count
- Total cost (formatted)
- Last active (relative date)

Cards link to `/projects/$name`.

---

## ToolUsageBar

**Props:** `{ tools: ToolAggregate[] }`

Horizontal bar chart where each tool gets a row:
- Tool name (left)
- Colored bar proportional to call count
- Count label (right)

Bars are clickable — navigate to `/tools/$tool_name`.

Sorted by call count descending.

---

## ModelDistribution

**Props:** `{ models: ModelAggregate[] }`

Horizontal bar chart similar to ToolUsageBar:
- Model ID (left)
- Provider badge
- Bar proportional to message count
- Count label (right)

---

## CostBreakdown

**Props:** `{ input_cost, output_cost, cache_read_cost, cache_write_cost }`

Recharts `PieChart` (donut style) with 4 slices:
- Input tokens cost
- Output tokens cost
- Cache read cost
- Cache write cost

Legend shows each category with color swatch and formatted dollar amount.

---

## DirectoryHotspots

**Props:** `{ directory_stats: DirectoryStat[] }`

Stacked horizontal bars per directory:
- Directory path (left, shortened)
- Stacked bar with 3 segments: Read (blue), Edit (yellow), Write (green)
- Total count (right)

Sorted by total activity descending. Top ~15 directories shown.

---

## ToolDetailBreakdown

**Props:** `{ top_bash, top_read, top_edit, top_write }`

4-card grid, each card shows a ranked list:
- **Top Bash Commands** — program names with counts
- **Most Read Files** — file paths (shortened) with counts
- **Most Edited Files** — file paths with counts
- **Most Written Files** — file paths with counts

Top 5-10 items per card.

---

## IndexSelector

**Props:** `{ indexes: QmdIndex[], active_index: string, on_select: (name) => void, on_create: () => void }`

Horizontal scrollable bar showing all QMD indexes as pill buttons:
- Active index has `ring-1 ring-primary` border
- Non-active indexes have `border-border` border
- Hovering non-default indexes shows a `⋯` menu (rename, delete)
- "+ New Index" button at the end with an `InfoTip` tooltip

---

## QmdHealthBanner

**Props:** `{ availability: QmdAvailability, status: QmdStatus }`

Shows warning banners as `Alert` components:
- 🔴 "QMD not installed" — if `installed === false`
- 🟡 "N documents need embedding" — if `needs_embedding > 0`
- 🟡 "Index may be stale" — if `days_since_update > 7`

---

## QmdSearchModal

Full-featured search UI. Opens as a modal/dialog.

### Sections

1. **Query input** — text field with search button
2. **Collection filter** — pills for each collection, toggleable
3. **Pipeline progress**:
   - "Expanding query..." with spinner (stage: expanding)
   - Shows expanded queries with type badges (lex/vec/hyde) (stage: expanded)
   - "Searching..." with elapsed time (stage: searching)
4. **Results list** — cards with:
   - File path + title
   - Collection badge
   - Score badge
   - Best chunk snippet
   - Expandable "Explain" section showing RRF contributions, rerank score, blended score
   - Expandable full document preview

### Search flow
1. User types query, clicks search
2. Call `qmd_search(index, query, selected_collections)`
3. Listen for Tauri events (`qmd:search-progress`) to update pipeline stages
4. Display results when complete

---

## CollectionFileTree

**Props:** `{ filesystem_paths: string[], indexed_paths: string[], on_apply: (adds, removes) => void }`

Tree view with file inclusion management.

### Implementation
1. Call `build_file_tree(filesystem_paths, indexed_set)` to build tree
2. Initialize `ToggleState` from indexed_paths
3. Render tree with `flatten_tree(roots, collapsed_set)`
4. Each node shows:
   - Expand/collapse icon (directories only)
   - Status indicator (●, ◐, ○, ◉, ◎)
   - File/directory name
   - File count badge (directories only)
5. Click status indicator to toggle inclusion
6. "Apply N changes" button when `toggle_state.has_pending()`

### Status indicators

| Symbol | Color | Meaning |
|---|---|---|
| `●` | accent | Fully indexed |
| `◐` | accent | Partially indexed (dir with some descendants) |
| `○` | muted | Not indexed |
| `◉` | accent | Pending add |
| `◎` | warning | Pending remove |

---

## ContextEditor

**Props:** `{ contexts: QmdContext[], on_add: (path, text) => void, on_remove: (path) => void }`

Key-value editor for collection contexts:
- Each row: path prefix (left), description text (right), delete button
- "Add context" button opens inline inputs for new path + text
- Changes are persisted immediately via `qmd_add_context()` / `qmd_remove_context()`

---

## GlobalContextEditor

**Props:** `{ text: string | null, on_save: (text) => void }`

Single editable text area for the index-level global context:
- Shows current value
- Editable inline
- Saves on blur or Enter via `qmd_set_global_context()`

---

## AddCollectionDialog

Dialog for adding a new collection:
- Name input
- Path input (with folder picker via `@tauri-apps/plugin-dialog`)
- Pattern input (default: `**/*.md`)
- Submit calls `qmd_add_collection()`

---

## shadcn/ui Components Used

These are standard shadcn/ui components installed via the CLI:

| Component | Notes |
|---|---|
| Button | Variants: default, ghost, outline, destructive. Sizes: default, sm, icon |
| Card | CardHeader, CardTitle, CardDescription, CardContent |
| Table | TableHeader, TableBody, TableRow, TableHead, TableCell |
| Sidebar | Full sidebar with collapsible icon mode, rail, trigger |
| Sheet | Used for mobile sidebar |
| DropdownMenu | Used for mode toggle, index actions |
| Popover | Used for search modal anchoring |
| Badge | Used for model names, tool names, statuses |
| Breadcrumb | Used in page header |
| Input | Standard text input |
| Separator | Horizontal dividers |
| Skeleton | Loading placeholders |
| Tooltip | Hover tooltips |
| Chart | Recharts wrapper with theme integration |

### Additional third-party components

| Component | Package | Usage |
|---|---|---|
| Contribution graph | `kibo-ui/contribution-graph` | Alternative heatmap (may be used alongside custom one) |
| Tree | `kibo-ui/tree` | Alternative tree component |
