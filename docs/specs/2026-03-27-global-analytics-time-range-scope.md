# Global Analytics Time Range Scope

Status: Draft
Date: 2026-03-27
Execution plan: `docs/exec-plans/active/2026-03-27-global-analytics-time-range-scope.md`
Related: `docs/specs/2026-03-26-global-project-scope-phase-1.md`, `docs/information-architecture.md`

## 1. Problem statement

Ariadne currently treats time range as a page-local concern instead of an app-level analytics scope.

Today:
- `src/pages/dashboard.tsx` owns its own `range_days` state and renders a local `RangePicker` above Overview content.
- `src/pages/usage/layout.tsx` owns a separate `range_days` state and renders another local `RangePicker` above the Usage tabs.
- `src/pages/sessions.tsx` has no date-range filter at all.
- `src/pages/tool-detail.tsx` also does not consume a shared time range, even though it lives under Usage.
- `src/app.tsx` keeps the global header right side reserved for sync/theme controls, so the time selector is visually disconnected from the already-global project scope selector.

The user wants the time selector to behave like project selection:
- move it into the app header,
- place it on the right side immediately before the Refresh/Resync button,
- make it collapsible when the viewport or available header width is too small,
- and apply the chosen range consistently across analytics routes.

This is not only a layout change. It is a scope-model change: time range should become a first-class global analytics selection, just like project scope already is.

## 2. Goals and non-goals

### 2.1 Goals
- Introduce a shared analytics time-range scope with one source of truth.
- Move the selector from page content into the app header in `src/app.tsx`.
- Place it immediately before the sync button in the header action cluster.
- Keep the control compact in normal desktop layouts and collapse it gracefully on narrow/mobile widths.
- Make Overview and Usage consume the shared time-range state instead of page-local state.
- Add time-range filtering to Sessions so `/sessions` respects the same global selection.
- Make Tool Detail respect the same global range so Usage deep-dives stay consistent with the header control.
- Preserve the existing project scope model; project scope and time range should compose cleanly.
- Follow React/Vercel best practices for shared state, rendering, and responsive behavior.

### 2.2 Non-goals
- Introducing arbitrary calendar/date picking or custom start/end dates.
- Changing QMD routes to participate in the analytics time range in this phase.
- Filtering a single session replay page (`/sessions/:id`) by global time range.
- Redesigning the header beyond the control move and responsive collapse behavior.
- Reworking Overview’s existing all-time heatmap semantics in this phase.

## 3. System context

### 3.1 Current frontend state ownership

#### App shell
- `src/app.tsx` renders the top header.
- Left side: sidebar trigger, separator, project scope selector, breadcrumbs.
- Right side: sync button and theme toggle.
- There is no shared time-range control in the header today.

#### Overview
- `src/pages/dashboard.tsx` owns `range_days` locally with `useState(30)`.
- It renders `RangePicker` inline above the stat cards.
- It already fetches time-scoped data via `get_time_breakdown(range_days, project_path)`.
- This means Overview already has the concept of time range, but not as shared app state.

#### Usage
- `src/pages/usage/layout.tsx` owns a separate `range_days` state and exposes it through `UsageProvider`.
- It renders `RangePicker` inline above the Usage tabs.
- Usage already passes `range_days` into `get_analytics_overview(project_path, range_days)`, `get_time_breakdown(range_days, project_path)`, and `get_project_file_stats(project_path, range_days)`.
- The current Usage range is effectively global only inside Usage, not across the app.

#### Sessions
- `src/pages/sessions.tsx` only consumes project scope.
- It calls `get_all_sessions(project_path)` with no time parameter.
- Filtering is limited to client-side search, tool, and model filters via `use_session_filters()`.
- As a result, there is no way to answer “show me sessions from the last 7/30/90 days” while keeping parity with Overview/Usage.

#### Tool detail
- `src/pages/tool-detail.tsx` is nested under Usage routes but does not consume Usage’s `range_days`.
- `get_tool_details(tool_name, project_path?)` currently has no time-range parameter.
- If the header becomes the single time selector for analytics routes, Tool Detail should not become the one page that ignores it.

### 3.2 Current backend/API shape
- `src-tauri/src/commands/analytics.rs#get_analytics_overview(project_path?, range_days?)`
- `src-tauri/src/commands/analytics.rs#get_time_breakdown(range_days, project_path?)`
- `src-tauri/src/commands/analytics.rs#get_project_file_stats(project_path, range_days?)`
- `src-tauri/src/commands/analytics.rs#get_all_sessions(project_path?)`
- `src-tauri/src/commands/analytics.rs#get_tool_details(tool_name, project_path?)`

The first three already understand time range. `get_all_sessions` and `get_tool_details` do not.

### 3.3 Current backend filtering duplication
`src-tauri/src/cache.rs` repeats nearly identical date filtering logic in several methods:
- `get_analytics_overview()`
- `get_project_file_stats()`
- `get_time_breakdown()`

Adding sessions and tool detail filtering is straightforward, but this work is also a good moment to centralize the “project path + range_days” filtering path so behavior stays consistent.

### 3.4 Existing responsive primitives
The repo already has the pieces needed for a responsive header control:
- `src/components/range-picker.tsx` — compact segmented button group.
- `src/hooks/use-mobile.ts` — viewport-based mobile detection.
- `src/hooks/use-container-width.ts` — `ResizeObserver`-based available-width tracking.
- `src/components/ui/dropdown-menu.tsx` — compact collapsed-selector affordance.
- `src/components/ui/sheet.tsx` — available if a larger mobile presentation is needed.

### 3.5 Information architecture implications
`docs/information-architecture.md` currently documents:
- a page-level range picker on Overview,
- a Usage-level range picker shared by tabs,
- and no Sessions date range.

This feature shifts the model to:
- one global analytics time range in the header,
- shared across Overview, Sessions, Usage, and Usage tool details,
- with page-local filters still allowed for search/tool/model/file-specific concerns.

## 4. Conventions and style
- Follow the project-scope pattern: provider owns persistence and validation; UI components stay mostly presentational.
- Keep `RangePicker` itself dumb/presentational. Add a separate global selector wrapper for header placement and collapse behavior.
- Avoid effect-driven state mirroring between page-local state and global state. Pages should read the global time range directly.
- Keep route visibility derived from pathname during render (or via `useMemo`), not synced into extra local state.
- Use stable allowed values for range options (`1`, `7`, `30`, `90`, `0`) from a shared constant to avoid drift between pages and providers.
- Preserve Vercel React best practices already used in the repo: no inline component definitions for substantial UI, derived state in render, interaction logic in handlers, and responsive rendering via memoized booleans rather than effect chains.

## 5. Domain model

### 5.1 Analytics time range scope
Introduce a global analytics scope value:
- `1` → Today
- `7` → 7d
- `30` → 30d
- `90` → 90d
- `0` → All

This scope should be:
- persisted in local storage,
- validated against the allowed option set,
- independent from project scope,
- and available via a hook such as `use_analytics_time_range()`.

### 5.2 Route participation
The global time range should apply to aggregate analytics routes:
- `/`
- `/sessions`
- `/usage/*`
- `/usage/tools/:tool_name`

The selector should be hidden on routes where it does not materially affect the screen:
- `/sessions/:id`
- `/qmd/*`

The selected range still persists while hidden.

### 5.3 Composition with project scope
Project scope and time range are orthogonal global selections:
- project scope answers **which project?**
- time range answers **which period?**

All analytics data loaders should be able to compose both filters without either owning the other.

## 6. Detailed design

### 6.1 Add a global analytics time-range provider
Create a provider analogous to project scope, mounted near the root in `src/main.tsx`.

Recommended shape:
- file: `src/components/analytics-time-range-provider.tsx`
- exposed hook: `use_analytics_time_range()`
- persisted key: `ariadne:analytics-time-range-days`
- default value: `30`

Responsibilities:
- restore persisted selection on app load,
- validate stored values against the fixed option list,
- expose `range_days`, selected option metadata, and `set_range_days()`.

This keeps shared ownership where it belongs instead of duplicating `useState(30)` in multiple pages.

### 6.2 Move the control into the app header
Update `src/app.tsx` so the header right-side cluster becomes:
- global time-range selector
- sync/resync button
- theme toggle

Placement requirement:
- the selector sits immediately before the sync button,
- matching the user’s requested header order.

Recommended header behavior:
- continue showing project scope on the left side near breadcrumbs,
- keep time range on the right with other global app actions,
- hide the time-range selector on routes that do not participate in aggregate analytics.

### 6.3 Responsive / collapsible selector behavior
The control must not assume full segmented width is always available.

Recommended behavior:
- **Expanded mode**: show the existing segmented `RangePicker` when the selector container has enough room.
- **Collapsed mode**: replace it with a compact trigger button that opens a menu of the same five options.

Recommended implementation strategy:
- create a wrapper component such as `src/components/analytics-time-range-selector.tsx`
- use `useIsMobile()` plus `use_container_width()` on the selector container
- derive `should_collapse = is_mobile || container_width < threshold`
- render either the inline `RangePicker` or a compact `DropdownMenuRadioGroup`

Why this approach:
- it handles true mobile widths,
- it also handles desktop cases where header space shrinks because of long breadcrumbs or scoped project names,
- and it keeps the `RangePicker` reusable as a plain segmented control.

Default collapsed trigger behavior:
- show the current label (`30d`, `Today`, etc.) so state remains visible,
- avoid making the control disappear entirely,
- and keep the control as the first element in the right-side header action cluster so it is the first thing that yields space.

### 6.4 Overview integration
`src/pages/dashboard.tsx` should stop owning local range state.

Changes:
- remove local `useState(30)` for `range_days`
- read `range_days` from the new global provider
- remove the local page-level `RangePicker` render block
- keep the current Overview fetch pattern otherwise intact unless implementation uncovers a clear correctness issue

This intentionally preserves existing Overview semantics while changing only the state source and control location.

### 6.5 Usage integration
`src/pages/usage/layout.tsx` should stop owning local range state and stop rendering a local range picker.

Changes:
- read `range_days` from the global provider
- remove the inline `RangePicker` from the Usage header row
- keep `UsageProvider` as the cross-tab data transport for `overview`, `time_data`, `file_stats`, and `range_days`
- consider removing `set_range_days` from `UsageContextValue`, because after this change Usage tabs are no longer responsible for mutating the range

This is a React best-practice improvement as well: Usage tabs become pure consumers of shared global state instead of tunneling setter ownership from a route-local layout.

### 6.6 Sessions integration
Extend Sessions so the global time range becomes a real filter, not just a decorative header value.

Frontend changes:
- `src/pages/sessions.tsx` reads `range_days` from the global provider
- the fetch effect depends on `[project_path, range_days]`
- the page calls `get_all_sessions(project_path, range_days)`

Backend/API changes:
- extend `src/api/analytics.ts#get_all_sessions(project_path?, range_days?)`
- extend `src-tauri/src/commands/analytics.rs#get_all_sessions(project_path?, range_days?)`
- extend `src-tauri/src/cache.rs#get_all_sessions(project_path?, range_days)` to apply time filtering before sorting

UX recommendation for clarity:
- add a compact range badge or muted label in `SessionToolbar` when `range_days !== 0`, e.g. `Last 30d`
- keep search/tool/model filters local and client-side on top of the server-filtered base session set

This gives `/sessions` the missing distinction/filter the user explicitly called out.

### 6.7 Tool detail integration
To keep the header control truly global across analytics routes, Tool Detail should also adopt the shared range.

Changes:
- `src/pages/tool-detail.tsx` reads `range_days` from the global provider
- `get_tool_details(tool_name, project_path?, range_days?)` accepts the same time filter
- backend filters both summary totals and `by_date` with the selected range

This avoids a confusing state where the header says `30d` but `/usage/tools/bash` still shows all-time numbers.

### 6.8 Backend filtering helper
Refactor the repeated backend filtering logic in `src-tauri/src/cache.rs` into a shared helper.

Recommended shape:
- internal helper that filters sessions by optional `project_path` + `range_days`
- reused by `get_analytics_overview`, `get_all_sessions`, `get_project_file_stats`, `get_time_breakdown`, and `get_tool_details`

Why this is worth doing now:
- the same date math already exists in several places,
- Sessions and Tool Detail will otherwise copy it again,
- and centralization reduces future drift between pages.

The helper can remain internal to `SessionCache`; it does not need to become a public abstraction.

### 6.9 Route-aware visibility rules in the app shell
`src/app.tsx` should explicitly derive whether the time-range selector is visible.

Recommended default:
- visible on Overview, Sessions list, Usage tab pages, Tool Detail
- hidden on Session Detail and QMD

This keeps the control meaningful and prevents “dead” header actions on routes that do not aggregate multiple sessions.

### 6.10 Documentation alignment
Implementation should update:
- `docs/information-architecture.md`
- `docs/ARCHITECTURE.md`

Key doc changes:
- Top Header Bar should mention the global time-range selector on the right side.
- Overview and Usage should no longer describe page-local range pickers.
- Sessions should explicitly document that it respects the global time range.

## 7. Error handling and failure modes
- Invalid stored range values should fall back to the default (`30`) and clear the bad persisted value.
- If a selected range yields zero sessions for the current project scope, pages should show normal empty states rather than treating it as an error.
- Collapsed selector mode should still make the current selection visible; users should never lose awareness of the active range.
- Hiding the selector on detail/QMD routes must not reset the stored range.
- Backend range filtering must treat `0` as all-time consistently across all participating commands.

## 8. Security and safety considerations
- Time-range persistence is frontend-only local storage; no sensitive data is introduced.
- Backend filtering remains read-only over cached session data.
- Adding `range_days` parameters must continue using typed Tauri IPC inputs, not string interpolation or shell calls.

## 9. Testing strategy

### 9.1 Unit tests
- Validate range storage parsing and allowed-value fallback logic in the new provider/helpers.
- Validate any `should_show_time_range_selector(pathname)` helper.
- Validate any responsive collapse helper logic if extracted.
- Add Rust tests for shared session filtering if the cache helper is factored into testable logic.

### 9.2 Integration tests
- Manual verification that the selector appears in the header immediately before Sync.
- Manual verification that Overview no longer renders a page-local picker and still responds to range changes.
- Manual verification that Usage no longer renders a page-local picker and all tabs still update from the header selection.
- Manual verification that Sessions refetches and shows different row counts when the header range changes.
- Manual verification that Tool Detail respects the same range.
- Manual verification that the selector collapses on narrow widths while remaining usable.
- Manual verification that Session Detail and QMD hide the selector without losing the previously selected range.

## 10. Implementation checklist
- [ ] Add a global analytics time-range provider with local storage persistence.
- [ ] Add a header-level analytics time-range selector component.
- [ ] Place the selector in `src/app.tsx` immediately before the sync button.
- [ ] Implement responsive collapse behavior for narrow/mobile header widths.
- [ ] Remove page-local range state/UI from `src/pages/dashboard.tsx`.
- [ ] Remove page-local range state/UI from `src/pages/usage/layout.tsx`.
- [ ] Make `/sessions` consume the global range.
- [ ] Extend `get_all_sessions` frontend/backend API to support `range_days`.
- [ ] Make `/usage/tools/:tool_name` consume the global range.
- [ ] Extend `get_tool_details` frontend/backend API to support `range_days`.
- [ ] Factor shared backend session filtering to avoid duplicated date logic.
- [ ] Update IA/architecture docs after implementation.

## 11. Open questions
- Whether the collapsed trigger should always show text (`30d`) or become icon-only at the very smallest widths. Default recommendation: keep text visible.
- Whether Sessions should show the active range only in the global header or also repeat it as a small badge in the toolbar. Default recommendation: add a small toolbar badge for local clarity.
