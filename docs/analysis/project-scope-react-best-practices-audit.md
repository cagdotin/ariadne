# Project Scope — React Best Practices Audit

**Date:** 2026-03-26  
**Scope:** All files changed or introduced by Phase 1 + Phase 2 of Global Project Scope  
**Based on:** Vercel React Best Practices (65 rules, 8 categories)

---

## Files Analyzed (1,921 lines total)

| File | Lines | Role |
|------|-------|------|
| `src/pages/dashboard.tsx` | 207 | Overview page — scope consumer |
| `src/pages/usage.tsx` | 165 | Usage page — scope consumer |
| `src/pages/tool-detail.tsx` | 239 | Tool detail — scope consumer |
| `src/pages/sessions.tsx` | 64 | Sessions — scope consumer |
| `src/app.tsx` | 205 | App shell / layout |
| `src/components/project-scope-provider.tsx` | 111 | Context provider |
| `src/components/scoped-file-analytics.tsx` | 253 | File deep-dive (Phase 2) |
| `src/components/top-projects.tsx` | 46 | Top projects cards |
| `src/components/stat-card.tsx` | 33 | Stat card |
| `src/components/daily-trend.tsx` | 106 | Daily trend chart |
| `src/components/activity-heatmap.tsx` | 122 | Activity heatmap |
| `src/components/tool-usage-bar.tsx` | 107 | Tool usage bar chart |
| `src/components/model-distribution.tsx` | 77 | Model distribution chart |
| `src/components/cost-breakdown.tsx` | 98 | Cost pie chart |
| `src/components/tool-detail-breakdown.tsx` | 88 | Tool detail breakdown cards |
| `src/api/analytics.ts` | — | Tauri IPC wrappers |
| `src/main.tsx` | 28 | Entry point |

---

## 1. CRITICAL — Duplicate Fetch on Scope Change

### Affected: `dashboard.tsx`, `usage.tsx`

Both pages have **two effects** that overlap on `project_path`:

**dashboard.tsx:**
```tsx
// Effect 1: fetches overview + time_breakdown when project_path changes
useEffect(() => {
  const [ov, tb] = await Promise.all([
    get_analytics_overview(project_path),
    get_time_breakdown(range_days, project_path),  // ← fetches time_breakdown
  ]);
  ...
}, [project_path]);

// Effect 2: re-fetches time_breakdown when range OR project_path changes
useEffect(() => {
  if (!overview) return;
  get_time_breakdown(range_days, project_path)...  // ← ALSO fetches time_breakdown
}, [range_days, project_path]);
```

When `project_path` changes, **both effects fire**, causing two redundant `get_time_breakdown()` calls. This is an IPC round-trip to the Rust backend that returns identical data.

**usage.tsx** has the exact same pattern.

**Rule violated:** `async-parallel` (1.4) — wasted parallel work  
**Rule violated:** `rerender-split-combined-hooks` (5.9) — effects with shared deps  

**Fix:** Split the concern cleanly:
- Effect 1 → triggers on `[project_path]` → fetches overview + time_breakdown (initial)
- Effect 2 → triggers on `[range_days]` **only** → re-fetches just time_breakdown
- Use a ref or guard to prevent Effect 2 from firing on mount

---

## 2. HIGH — `scoped-file-analytics.tsx` Monolith (253 lines)

This file mixes **five concerns** in one component, identical to the pattern we just refactored in `project-scope-selector`:

| Concern | Lines | Description |
|---------|-------|-------------|
| Helper functions | ~50 | `parse_excludes`, `is_excluded`, `recompute_directory_stats` |
| Fetch + state | ~30 | Effect, loading/error state, project_path dep |
| Filter memos | ~30 | 4 separate `useMemo` chains for filtered data |
| Tool distribution UI | ~20 | Bar chart for tool distribution |
| Directory hotspots + file table UI | ~60 | Two major card sections |

**Rules implicated:**
- Component is not decomposable or testable in isolation
- Helper functions have zero React dependency → should be in `utils.ts`
- The file tab switching logic (read/edit/write) is a self-contained sub-component

**Proposed decomposition:**
```
src/components/scoped-file-analytics/
├── index.ts
├── scoped-file-analytics.tsx     # Slim orchestrator
├── use-scoped-file-analytics.ts  # Fetch + filter hook
├── file-activity-tabs.tsx        # read/edit/write tab switcher + table
├── tool-distribution-card.tsx    # Tool distribution bar chart
├── utils.ts                      # parse_excludes, is_excluded, recompute_directory_stats
```

---

## 3. HIGH — Shared Range Picker Not Extracted

**Affected:** `dashboard.tsx`, `usage.tsx`

Both pages define nearly identical range picker UIs with the same button styling, options, and state pattern:

**dashboard.tsx:**
```tsx
const RANGE_OPTIONS = [
  { label: "Today", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];
// ... inline button rendering
```

**usage.tsx:**
```tsx
{[{ label: '7d', value: 7 }, { label: '30d', value: 30 },
  { label: '90d', value: 90 }, { label: 'All', value: 0 }].map(opt => (
  <button ... >{opt.label}</button>
))}
```

**Rule:** DRY principle + `rendering-hoist-jsx` (6.3) — extract a `<RangePicker>` component.

---

## 4. MEDIUM — Missing `useMemo` on Derived Computations

### `top-projects.tsx`
```tsx
// Sorts + slices on EVERY render — no memo
const top = [...projects]
  .sort((a, b) => b.session_count - a.session_count)
  .slice(0, 5);
```
**Rule:** `rerender-memo` (5.6), `rerender-split-combined-hooks` (5.9)

### `tool-usage-bar.tsx`
```tsx
// Both recreated every render
const sorted_tools = [...tools].sort(...).slice(0, 12);
const chart_data = sorted_tools.map(...);
```

### `model-distribution.tsx`
```tsx
// All three recreated every render
const sorted_models = [...models].sort(...).slice(0, 8);
const chart_config = Object.fromEntries(sorted_models.map(...));
const chart_data = sorted_models.map(...);
```

### `cost-breakdown.tsx`
```tsx
// Recreated every render
const raw_categories = [...].filter((c) => c.cost > 0);
```

**Rule:** `rerender-split-combined-hooks` (5.9) — these are derived computations that should be in `useMemo` with their source data as dependency.

**Note:** For `cost-breakdown.tsx`, the computation is simple enough that `useMemo` overhead may not be worth it per rule 5.3. But for the sort+slice chains in `top-projects`, `tool-usage-bar`, and `model-distribution`, the array operations justify memoization.

---

## 5. MEDIUM — Static Chart Configs Recreated Every Render

### `tool-detail.tsx`
```tsx
// These are constants but defined inside the component
const area_config: ChartConfig = {
  count: { label: "Calls", color: "var(--chart-1)" },
};
const bar_config: ChartConfig = { ... };
```

### `tool-usage-bar.tsx`
```tsx
// Already hoisted ✅
const chart_config = { ... } satisfies ChartConfig;
```

### `model-distribution.tsx`
```tsx
// Depends on data — can't hoist, but should memoize
const chart_config = Object.fromEntries(sorted_models.map(...));
```

**Rule:** `rendering-hoist-jsx` (6.3) — hoist static configs to module level  
**Rule:** `rerender-simple-expression-in-memo` (5.3) — don't memo trivial literals

**Fix:** In `tool-detail.tsx`, hoist `area_config` and `bar_config` to module level since they're completely static.

---

## 6. MEDIUM — `tool-detail-breakdown.tsx` — Inline Render Function

```tsx
export function ToolDetailBreakdown({ ... }) {
  const render_list = (items, max_count, title) => { ... };
  //                   ↑ recreated every render

  return (
    <div>
      {render_list(bash_commands, max_bash_count, "Most Used Bash Programs")}
      {render_list(read_files, max_read_count, "Most Read Files")}
      ...
    </div>
  );
}
```

While `render_list` is a function (not a component), it returns JSX and behaves like one. Per `rerender-no-inline-components` (5.4), this should be extracted as a standalone `<RankedList>` component.

---

## 7. LOW — `app.tsx` — `is_active` + `get_breadcrumbs` Redefined Every Render

```tsx
export function AppLayout() {
  const location = useLocation();

  // Both recreated on every render
  const is_active = (path: string) => { ... };
  const get_breadcrumbs = () => { ... };
```

**Rule:** `rerender-derived-state-no-effect` (5.1) — these are derived values, correctly computed during render. But `get_breadcrumbs` allocates arrays every render.

**Fix:** Wrap `get_breadcrumbs()` result in `useMemo` keyed on `location.pathname`. The `is_active` helper is trivial and fine as-is.

---

## 8. LOW — `main.tsx` — Global Event Listener

```tsx
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key === '[') { ... }
  if (e.metaKey && e.key === ']') { ... }
});
```

This runs at module level which is fine for a one-time init. Per `advanced-init-once` (8.1), module-level is the correct pattern. No action needed.

---

## 9. Already Correct ✅

| File | Pattern | Rule |
|------|---------|------|
| `project-scope-provider.tsx` | Lazy state init: `useState(read_stored_scope)` | 5.12 ✅ |
| `project-scope-provider.tsx` | `useCallback` for stable `set_scope` | 5.11 ✅ |
| `sessions.tsx` | Clean cancel pattern with `cancelled` flag | — ✅ |
| `dashboard.tsx` | `Promise.all` for parallel fetches | 1.4 ✅ |
| `usage.tsx` | `Promise.all` for parallel fetches | 1.4 ✅ |
| `daily-trend.tsx` | Pure helper `fill_daily_range` at module level | 6.3 ✅ |
| `activity-heatmap.tsx` | Pure helper `to_activities` at module level | 6.3 ✅ |
| `stat-card.tsx` | Small, focused, props-only component | — ✅ |
| All pages | Scope consumed via hook, not prop drilling | — ✅ |
| All pages | `cancelled` flag in effects prevents stale updates | — ✅ |
| `tool-usage-bar.tsx` | Static `chart_config` hoisted to module level | 6.3 ✅ |
| `cost-breakdown.tsx` | Static `chart_config` hoisted to module level | 6.3 ✅ |
| `scoped-file-analytics.tsx` | Helpers at module level (not inside component) | 5.4 ✅ |

---

## Refactoring Plan — Prioritized

### Phase A: Fix Duplicate Fetches (CRITICAL) — `dashboard.tsx`, `usage.tsx`

**Goal:** Eliminate the double `get_time_breakdown` call when `project_path` changes.

1. **dashboard.tsx** — Refactor the two effects into one that handles both initial load and range changes:
   - Single effect depends on `[project_path, range_days]`
   - Always fetches overview + time_breakdown together
   - Use `Promise.all` for both
   - Remove the separate range-only effect

2. **usage.tsx** — Same refactor.

**Estimated impact:** Eliminates 1 redundant IPC call per scope change on 2 pages.

### Phase B: Decompose `scoped-file-analytics.tsx` (HIGH)

**Goal:** Break the 253-line monolith into focused, testable pieces.

1. Extract `utils.ts` — `parse_excludes`, `is_excluded`, `recompute_directory_stats`
2. Extract `use-scoped-file-analytics.ts` — fetch, loading/error state, filter memos
3. Extract `file-activity-tabs.tsx` — tab switcher + data table
4. Extract `tool-distribution-card.tsx` — tool distribution bar chart
5. Slim `scoped-file-analytics.tsx` → orchestrator (~40 lines)
6. Add `index.ts` re-export

### Phase C: Extract Shared Components (MEDIUM)

**Goal:** DRY up repeated UI patterns across pages.

1. **`<RangePicker>`** — Extract from `dashboard.tsx` and `usage.tsx`
   - Props: `options`, `value`, `on_change`
   - Replaces 2 inline button loops

2. **`<RankedList>`** — Extract from `tool-detail-breakdown.tsx`
   - Props: `items`, `max_count`, `title`
   - Replaces the inline `render_list` function

### Phase D: Add Missing Memoization (MEDIUM)

**Goal:** Prevent unnecessary re-computation on re-renders.

| File | Change |
|------|--------|
| `top-projects.tsx` | Wrap sort+slice in `useMemo([projects])` |
| `tool-usage-bar.tsx` | Wrap `sorted_tools` + `chart_data` in `useMemo([tools])` |
| `model-distribution.tsx` | Wrap `sorted_models` + `chart_config` + `chart_data` in `useMemo([models])` |
| `tool-detail.tsx` | Hoist `area_config` and `bar_config` to module level |
| `app.tsx` | Wrap `get_breadcrumbs()` result in `useMemo([location.pathname])` |

### Phase E: Minor Cleanups (LOW)

1. Hoist static config objects to module level where possible
2. Verify conditional rendering uses ternary (already mostly correct)

---

## Summary Table

| # | Severity | Rule(s) | File(s) | Issue |
|---|----------|---------|---------|-------|
| 1 | **CRITICAL** | 1.4, 5.9 | dashboard, usage | Duplicate fetch on scope change |
| 2 | **HIGH** | — | scoped-file-analytics | 253-line monolith, mixed concerns |
| 3 | **HIGH** | 6.3 | dashboard, usage | Shared range picker not extracted |
| 4 | **MEDIUM** | 5.6, 5.9 | top-projects, tool-usage-bar, model-distribution | Missing useMemo on sort+slice |
| 5 | **MEDIUM** | 6.3 | tool-detail | Static chart configs inside component |
| 6 | **MEDIUM** | 5.4 | tool-detail-breakdown | Inline render function |
| 7 | **LOW** | 5.1 | app | get_breadcrumbs not memoized |
| 8 | **LOW** | — | main | Module-level listener (already correct) |
