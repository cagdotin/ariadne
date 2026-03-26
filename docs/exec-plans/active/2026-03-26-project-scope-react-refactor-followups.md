# Project Scope React Refactor — Remaining Phases (Delegation Plan)

Status: Ready for delegation  
Date: 2026-03-26  
Owner: coding-agent  
Context: Follows Phase A completion (duplicate fetch fix in `dashboard.tsx` and `usage.tsx`)

## Purpose

This document breaks down the **remaining React best-practices refactor work** for the Global Project Scope implementation into delegation-friendly phases.

Phase A is already complete.

Remaining phases:
- **Phase B** — Decompose `scoped-file-analytics.tsx`
- **Phase C** — Extract shared UI components
- **Phase D** — Add targeted memoization + hoist static config
- **Phase E** — Minor cleanup and polish

---

## Constraints / repo rules

- Use **Bun** only.
- Preserve existing user-facing behavior.
- Do not change information architecture or route behavior in this refactor.
- Prefer **small, behavior-preserving refactors**.
- Keep import paths stable where possible by using `index.ts` re-exports.
- Run validation after each phase:
  - `bunx tsc --noEmit`
  - `bun run build`

---

## Phase A — Already complete

Completed:
- Removed duplicate `get_time_breakdown()` fetches on scope change in:
  - `src/pages/dashboard.tsx`
  - `src/pages/usage.tsx`

Do not rework unless needed by later phases.

---

# Phase B — Decompose `scoped-file-analytics.tsx`

## Goal

Break the current 253-line `src/components/scoped-file-analytics.tsx` monolith into focused, testable files with isolated concerns.

## Why

Current issues:
- Mixed concerns in one file: helpers, fetch logic, local UI state, filtering, and multiple rendering sections
- Harder to test pure logic separately
- Harder to reason about render/update behavior
- Mirrors the same problem that was already fixed in `project-scope-selector`

## Source file

- `src/components/scoped-file-analytics.tsx`

## Target structure

```text
src/components/scoped-file-analytics/
├── index.ts
├── scoped-file-analytics.tsx
├── use-scoped-file-analytics.ts
├── utils.ts
├── tool-distribution-card.tsx
├── file-activity-tabs.tsx
└── types.ts                # optional, only if useful
```

## Responsibilities by file

### `index.ts`
Re-export public component:
```ts
export { ScopedFileAnalytics } from "./scoped-file-analytics";
```

### `utils.ts`
Move pure helpers here:
- `parse_excludes(raw)`
- `is_excluded(path, excludes)`
- `recompute_directory_stats(...)`
- optional helper: `get_active_file_list(...)`
- optional helper: `get_hidden_count(...)`

These should have **zero React dependency**.

### `use-scoped-file-analytics.ts`
Own all stateful logic:
- fetch `get_project_file_stats(project_path)`
- local UI state:
  - `exclude_paths`
  - `active_tab`
- reset local state when `project_path` changes
- loading + error state
- memos:
  - `excludes`
  - `filtered_read`
  - `filtered_edit`
  - `filtered_write`
  - `filtered_dirs`
  - `hidden_count`
  - `active_file_list`

Return a compact state object for the UI layer.

### `tool-distribution-card.tsx`
Render only the Tool Distribution card.

Props should be narrowly scoped:
```ts
interface ToolDistributionCardProps {
  tools: NameCount[];
}
```

### `file-activity-tabs.tsx`
Render only:
- tab buttons (read/edit/write)
- counts per tab
- file activity data table

Props example:
```ts
interface FileActivityTabsProps {
  active_tab: FileTab;
  filtered_read: NameCount[];
  filtered_edit: NameCount[];
  filtered_write: NameCount[];
  active_file_list: NameCount[];
  on_tab_change: (tab: FileTab) => void;
}
```

### `scoped-file-analytics.tsx`
Become a slim orchestrator that:
- calls `use_scoped_file_analytics(project_path)`
- handles loading / error / empty state
- renders:
  - section title
  - exclude-path filter bar
  - `ToolDistributionCard`
  - directory hotspots card
  - `FileActivityTabs`

Target size: roughly **40–90 lines**.

## Implementation notes

- Preserve the current UI and wording.
- Preserve the current behavior of resetting excludes + active tab on project change.
- Preserve the current `active_file_list.slice(0, 50)` behavior unless there is a compelling reason to change it.
- Prefer keeping current prop and variable naming style (`snake_case`).

## Acceptance criteria

- `src/components/scoped-file-analytics.tsx` is replaced by folder-based structure.
- Consumer import path remains valid:
  - `@/components/scoped-file-analytics`
- Pure helper logic lives outside React components.
- Fetch/state logic is isolated in a custom hook.
- UI sections are split into focused components.
- `bunx tsc --noEmit` passes.
- `bun run build` passes.
- Behavior remains unchanged.

## Suggested executor notes

If you need a model to follow, mirror the structure used in:
- `src/components/project-scope-selector/`

---

# Phase C — Extract shared UI components

## Goal

Remove repeated inline UI patterns used across project-scope pages.

## Why

Current duplication:
- Range picker button groups exist in both `dashboard.tsx` and `usage.tsx`
- `tool-detail-breakdown.tsx` uses an internal JSX-producing helper that should be a standalone component

## Sub-phase C1 — Extract `RangePicker`

### Source files
- `src/pages/dashboard.tsx`
- `src/pages/usage.tsx`

### Target file
Suggested:
- `src/components/range-picker.tsx`

### Proposed API
```ts
interface RangeOption {
  label: string;
  value: number;
}

interface RangePickerProps {
  options: RangeOption[];
  value: number;
  on_change: (value: number) => void;
  className?: string;
}
```

### Requirements
- Preserve current styling and active/inactive states.
- Support both current option sets:
  - Dashboard: Today / 7d / 30d / 90d / All
  - Usage: 7d / 30d / 90d / All
- Avoid over-generalizing.
- Keep component presentational only.

### Acceptance criteria
- Both pages use shared `RangePicker`.
- No visual regression.
- No behavior change.

---

## Sub-phase C2 — Extract `RankedListCard` from `tool-detail-breakdown.tsx`

### Source file
- `src/components/tool-detail-breakdown.tsx`

### Problem
Current file defines an internal render helper:
- `render_list(items, max_count, title)`

This mixes layout + repeated JSX in a render-time helper.

### Target file
Suggested:
- `src/components/ranked-list-card.tsx`

### Proposed API
```ts
interface RankedListCardProps {
  title: string;
  items: NameCount[];
  max_count: number;
  empty_label?: string;
}
```

### Requirements
- Preserve current empty state
- Preserve current badge/count/progress bar styling
- Keep title configurable
- Keep list truncation behavior (`slice(0, 10)`) consistent

### Acceptance criteria
- `tool-detail-breakdown.tsx` no longer contains `render_list`
- Repeated card markup is extracted into reusable component
- `tool-detail-breakdown.tsx` becomes mostly composition

---

# Phase D — Add targeted memoization + hoist static config

## Goal

Reduce unnecessary recomputation and align more closely with React best practices without premature over-optimization.

## Important note

Do **not** add `useMemo` everywhere. Only add it where there is meaningful derived work:
- sorting
- slicing
- mapping to chart data/config
- repeated array transforms

Do **not** wrap simple primitive expressions in `useMemo`.

---

## Sub-phase D1 — `top-projects.tsx`

### File
- `src/components/top-projects.tsx`

### Current issue
Sort + slice happens on every render:
```ts
const top = [...projects].sort(...).slice(0, 5)
```

### Change
Wrap in `useMemo([projects])`.

### Acceptance
- Same UI/behavior
- Memoized derived list

---

## Sub-phase D2 — `tool-usage-bar.tsx`

### File
- `src/components/tool-usage-bar.tsx`

### Current issue
Derived arrays recreated every render:
- `sorted_tools`
- `chart_data`

### Change
Use `useMemo([tools])` for derived chart data.

### Acceptance
- Same rendering
- No navigation behavior changes

---

## Sub-phase D3 — `model-distribution.tsx`

### File
- `src/components/model-distribution.tsx`

### Current issue
Derived work recreated every render:
- `sorted_models`
- `chart_config`
- `chart_data`

### Change
Use `useMemo([models])`.

### Acceptance
- Same rendering
- Same colors/order

---

## Sub-phase D4 — `tool-detail.tsx`

### File
- `src/pages/tool-detail.tsx`

### Current issue
Static chart configs are declared inside the component:
- `area_config`
- `bar_config`

### Change
Hoist them to module level.

### Acceptance
- No behavior change
- Constants no longer recreated per render

---

## Sub-phase D5 — `app.tsx`

### File
- `src/app.tsx`

### Current issue
Breadcrumb array is rebuilt every render.

### Change
- Wrap breadcrumb computation in `useMemo([location.pathname])`
- It is fine to keep `is_active()` inline unless you want to tidy it opportunistically

### Acceptance
- Breadcrumb behavior unchanged
- No route behavior changes

---

# Phase E — Minor cleanup / polish

## Goal

Apply small cleanup tasks that improve maintainability without broad restructuring.

## Candidate items

### E1 — Re-check for hoistable static config / constants
Search for chart config objects or static arrays declared inside component bodies where they do not depend on props/state.

### E2 — Verify conditional rendering style
Prefer explicit ternary / `null` where clarity improves. No broad mechanical rewrite needed.

### E3 — Small readability cleanup
Only if encountered naturally during other phases:
- simplify comments
- reduce nested ternaries if local extraction helps
- keep functions at module level where possible

## Acceptance criteria
- No user-facing changes
- No unnecessary abstraction
- Build remains green

---

# Recommended delegation order

1. **Phase B** — biggest structural payoff, isolated file
2. **Phase C** — shared components
3. **Phase D** — memoization + hoists
4. **Phase E** — final cleanup

This order minimizes merge conflicts.

---

# Suggested agent assignments

## Agent 1 — Phase B
Owns:
- `src/components/scoped-file-analytics*`

## Agent 2 — Phase C
Owns:
- `src/components/range-picker.tsx`
- `src/components/ranked-list-card.tsx`
- updates to `dashboard.tsx`, `usage.tsx`, `tool-detail-breakdown.tsx`

## Agent 3 — Phase D
Owns:
- `top-projects.tsx`
- `tool-usage-bar.tsx`
- `model-distribution.tsx`
- `tool-detail.tsx`
- `app.tsx`

## Agent 4 — Phase E / integration check
Owns:
- consistency pass
- final validation
- smoke test of scope flows

---

# Validation checklist for every delegated PR

- [ ] `bunx tsc --noEmit`
- [ ] `bun run build`
- [ ] No import path regressions
- [ ] No behavior change in project scope flows
- [ ] Loading / error states preserved
- [ ] Existing route behavior preserved

---

# Smoke test checklist

After all phases land:
- [ ] Overview still updates when project scope changes
- [ ] Usage still updates when project scope changes
- [ ] Sessions still filters by selected project
- [ ] Tool Detail still respects selected project
- [ ] Scoped File Analytics still resets local filters on project change
- [ ] Top Projects still sets global scope
- [ ] QMD routes still hide project selector
- [ ] Header selector still works after refactors
