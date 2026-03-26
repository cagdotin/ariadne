# Project Scope Selector — Decomposition Analysis

**File:** `src/components/project-scope-selector.tsx` (369 lines)  
**Date:** 2026-03-26  
**Based on:** Vercel React Best Practices + component inspection

---

## 1. Current Structure

The component packs **five concerns** into a single file:

| Concern | Lines | Description |
|---------|-------|-------------|
| Types | ~15 | `ProjectFilterMode`, `ProjectGroup`, `ProjectScopeItemProps` |
| Pure helpers | ~70 | Path normalization, sorting, grouping, matching |
| Sub-component | ~30 | `ProjectScopeItem` (list row) |
| Hook-level logic | ~50 | State, memos, handlers for search/filter/select |
| Popover JSX | ~170 | Trigger button + search header + project list + empty state |

**Total: 369 lines** — not catastrophic, but the mixing of utilities, types, stateful logic, and multiple UI sections makes it harder to test, reuse, and reason about independently.

---

## 2. Vercel Best Practices Audit

### ✅ Things Already Done Well

| Rule | Status | Notes |
|------|--------|-------|
| `rerender-no-inline-components` (5.4) | ✅ | `ProjectScopeItem` defined at module level, not inside render |
| `rerender-derived-state-no-effect` (5.1) | ✅ | `normalized_query`, `selected_project`, `trigger_label` all derived during render |
| `rendering-conditional-render` (6.9) | ✅ | Uses ternary `? ... : null` patterns, not `&&` with risky falsy values |
| `rerender-split-combined-hooks` (5.9) | ✅ | Memos have reasonably split dependency chains |
| `rerender-move-effect-to-event` (5.8) | ✅ | All interaction logic is in event handlers, no effects |

### ⚠️ Improvement Opportunities

| Rule | Issue | Fix |
|------|-------|-----|
| `js-tosorted` (7.14) | `[...projects].sort()` mutates copy — should use `.toSorted()` | Replace in `sort_projects_by_recent` and `sort_projects_by_activity` |
| `rerender-use-deferred-value` (5.14) | Search query triggers immediate re-filter on every keystroke | Use `useDeferredValue(query)` for filtered list; keep input snappy |
| `rerender-memo` (5.6) | `ProjectScopeItem` is not memoized — re-renders all rows when any state changes | Wrap with `React.memo()` since props are primitives + callback |
| `rerender-functional-setstate` (5.11) | N/A — state setters already use direct values (correct for this case) | — |
| `rendering-content-visibility` (6.2) | Project list can have many items; no virtualization or `content-visibility` | Add `content-visibility: auto` CSS to list items for large lists |

### 📌 Minor Notes

| Rule | Note |
|------|------|
| `bundle-barrel-imports` (2.1) | Imports from `lucide-react` — fine with Vite tree-shaking, no action needed |
| `rerender-simple-expression-in-memo` (5.3) | `normalized_query` is a simple `.trim().toLowerCase()` — correctly NOT wrapped in `useMemo` |
| `js-set-map-lookups` (7.13) | `projects.find(p => p.path === scope.project_path)` could use a Map for O(1), but list is typically small |

---

## 3. Proposed Folder Structure

```
src/components/project-scope-selector/
├── index.tsx                        # Re-export of ProjectScopeSelector
├── project-scope-selector.tsx       # Main orchestrator component (slim)
├── project-scope-trigger.tsx        # Popover trigger button
├── project-scope-search.tsx         # Search input + filter tabs header
├── project-scope-list.tsx           # Scrollable project list with groups
├── project-scope-item.tsx           # Individual project row
├── project-scope-empty.tsx          # Empty search state
├── use-project-scope-selector.ts    # Hook: state, memos, handlers
├── types.ts                         # ProjectFilterMode, ProjectGroup, ProjectScopeItemProps
└── utils.ts                         # Pure helpers (path, sort, filter, group)
```

---

## 4. Detailed Breakdown

### `types.ts` — Shared types

```ts
export type ProjectFilterMode = "all" | "recent" | "active"

export interface ProjectGroup {
  id: string
  label: string
  projects: ProjectSummary[]
}
```

No `ProjectScopeItemProps` here — that stays local to `project-scope-item.tsx`.

---

### `utils.ts` — Pure functions (fully testable)

Move all helpers here:

- `normalize_path_segments(path)`
- `get_workspace_label(path)`
- `get_project_subtitle(path)`
- `get_project_meta(project)`
- `matches_project_query(project, query)`
- `sort_projects_by_recent(projects)` → **use `.toSorted()` instead of `[...].sort()`**
- `sort_projects_by_activity(projects)` → **use `.toSorted()` instead of `[...].sort()`**
- `build_workspace_groups(projects)`
- `is_filter_mode(value)`

**Best practice applied:** `js-tosorted` (7.14) — prevents mutation bugs.

This file becomes independently unit-testable with zero React dependency.

---

### `use-project-scope-selector.ts` — Custom hook

Extracts all stateful logic from the main component:

```ts
export function use_project_scope_selector() {
  const { scope, projects, loading, set_scope } = use_project_scope()
  const [open, set_open] = useState(false)
  const [query, set_query] = useState("")
  const [filter_mode, set_filter_mode] = useState<ProjectFilterMode>("all")

  const deferred_query = useDeferredValue(query)      // ← NEW: 5.14
  const normalized_query = deferred_query.trim().toLowerCase()

  // ... all useMemo chains ...
  // ... handle_open_change, handle_filter_change, select_all, select_project ...

  return {
    // State
    open, query, filter_mode, loading, scope,
    // Derived
    selected_project, project_groups, trigger_label, trigger_description,
    filtered_projects, is_stale: query !== deferred_query,
    // Actions
    set_query, set_open, handle_open_change, handle_filter_change,
    select_all, select_project,
  }
}
```

**Best practices applied:**
- `rerender-use-deferred-value` (5.14) — keeps input responsive while list filters catch up
- All logic tested independently of JSX rendering

---

### `project-scope-item.tsx` — Memoized row component

```tsx
export const ProjectScopeItem = memo(function ProjectScopeItem({
  label, subtitle, meta, selected, on_select, title
}: ProjectScopeItemProps) {
  // ... same JSX ...
})
```

**Best practice applied:** `rerender-memo` (5.6) — prevents re-render of every row when parent state changes. All props are primitives or stable callbacks.

---

### `project-scope-trigger.tsx` — Trigger button

Isolates the `PopoverTrigger` + button layout. Receives:

```ts
interface ProjectScopeTriggerProps {
  loading: boolean
  label: string
  description: string
  full_path: string | null
}
```

Small, focused, no state.

---

### `project-scope-search.tsx` — Search header

The search input + clear button + filter tabs + count badge. Receives:

```ts
interface ProjectScopeSearchProps {
  query: string
  filter_mode: ProjectFilterMode
  visible_count: number
  on_query_change: (query: string) => void
  on_filter_change: (value: string) => void
}
```

Self-contained UI section. No awareness of project data.

---

### `project-scope-list.tsx` — Scrollable grouped list

Orchestrates the "All projects" row, pinned selection, grouped items, and empty state. Receives groups + selection state + callbacks. This is the densest JSX section and benefits most from isolation.

---

### `project-scope-empty.tsx` — Empty state

Tiny component:

```tsx
export function ProjectScopeEmpty() {
  return (
    <div className="px-4 py-6 text-center">
      <Search className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">No matching projects</p>
    </div>
  )
}
```

Can be hoisted as static JSX per `rendering-hoist-jsx` (6.3) since it has no props.

---

### `project-scope-selector.tsx` — Slim orchestrator

After decomposition, the main component becomes ~40 lines:

```tsx
export function ProjectScopeSelector() {
  const state = use_project_scope_selector()

  return (
    <Popover open={state.open} onOpenChange={state.handle_open_change}>
      <ProjectScopeTrigger ... />
      <PopoverContent align="start" className="w-[22rem] overflow-hidden p-0 gap-0">
        <ProjectScopeSearch ... />
        <ProjectScopeList ... />
      </PopoverContent>
    </Popover>
  )
}
```

Clean composition. Each piece testable and understandable in isolation.

---

### `index.tsx` — Public API

```ts
export { ProjectScopeSelector } from "./project-scope-selector"
```

Keeps the import path identical for consumers: `@/components/project-scope-selector`

---

## 5. Additional Recommendations

### Add `content-visibility` for large project lists

Per `rendering-content-visibility` (6.2), add to the list item CSS:

```css
.project-scope-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 40px;
}
```

### Consider `useDeferredValue` visual feedback

When `query !== deferred_query`, the list is stale. Add subtle opacity:

```tsx
<div style={{ opacity: is_stale ? 0.7 : 1 }}>
  <ProjectScopeList ... />
</div>
```

### Unit test the `utils.ts` independently

The pure functions are the highest-value test targets:
- `build_workspace_groups` — grouping logic
- `matches_project_query` — search matching
- `sort_projects_by_*` — sort stability
- `get_workspace_label` — path segment edge cases

---

## 6. Summary

| Metric | Before | After |
|--------|--------|-------|
| Files | 1 (369 lines) | 10 (~40-70 lines each) |
| Testable units | 1 (integration only) | Utils, hook, and components independently |
| Memoization | None on list items | `memo()` on `ProjectScopeItem` |
| Search responsiveness | Immediate re-render | `useDeferredValue` deferred filtering |
| Sort safety | `[...].sort()` | `.toSorted()` |
| Reusability | Monolithic | Trigger, search, list, item all reusable |
