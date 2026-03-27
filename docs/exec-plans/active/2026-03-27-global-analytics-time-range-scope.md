# Global analytics time range scope

Status: Active
Owner: coding-agent
Created: 2026-03-27
Spec: `docs/specs/2026-03-27-global-analytics-time-range-scope.md`

This ExecPlan is a living document and must be maintained in accordance with `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Move Ariadne’s analytics time-range control out of individual pages and into the app header so it behaves like a true global scope. After this work, a user will be able to:
- change the analytics time range once in the header,
- see Overview, Sessions, Usage, and Usage tool details respond to the same selection,
- find the control immediately before the sync button,
- and still use it when the header is narrow because it collapses into a compact menu mode.

Observable verification will be: change the header control from `30d` to `7d`, watch Overview update, navigate to Sessions and see the row set change, navigate to Usage and see the same range preserved, then shrink the window and verify the selector collapses instead of breaking the header layout.

## Progress

- [x] (2026-03-27 21:00 local) Research current header, Overview, Usage, Sessions, Tool Detail, and backend analytics commands.
- [x] (2026-03-27 21:00 local) Write spec and execution plan artifacts for the global time-range feature.
- [ ] (2026-03-27 21:00 local) Add global analytics time-range provider and shared option definitions.
- [ ] (2026-03-27 21:00 local) Add header-level responsive time-range selector and place it before Sync in `src/app.tsx`.
- [ ] (2026-03-27 21:00 local) Remove page-local range picker ownership from Overview and Usage.
- [ ] (2026-03-27 21:00 local) Extend Sessions frontend/backend data flow to respect global `range_days`.
- [ ] (2026-03-27 21:00 local) Extend Tool Detail frontend/backend data flow to respect global `range_days`.
- [ ] (2026-03-27 21:00 local) Refactor shared backend session filtering to avoid duplicated date logic.
- [ ] (2026-03-27 21:00 local) Validate responsive behavior and update docs.

## Surprises & Discoveries

- Observation: Overview and Usage already use the same conceptual range options (`Today`, `7d`, `30d`, `90d`, `All`) but keep separate local state owners.
  Evidence: `src/pages/dashboard.tsx` and `src/pages/usage/layout.tsx` each declare local `range_days` state and render their own `RangePicker`.
- Observation: Sessions has no time-range filtering today, so turning the header control global requires real backend/API work instead of just moving UI.
  Evidence: `src/pages/sessions.tsx` calls `get_all_sessions(project_path)` and `src-tauri/src/commands/analytics.rs#get_all_sessions` accepts only `project_path`.
- Observation: Tool Detail would become inconsistent if left untouched because it lives under Usage routes but currently has no range filter.
  Evidence: `src/pages/tool-detail.tsx` calls `get_tool_details(tool_name, project_path)` and the backend command has no `range_days` parameter.
- Observation: the repo already has the primitives needed for a responsive collapse mode.
  Evidence: `src/hooks/use-mobile.ts`, `src/hooks/use-container-width.ts`, and `src/components/ui/dropdown-menu.tsx` already exist.
- Observation: `src-tauri/src/cache.rs` already duplicates nearly identical date filtering logic in multiple methods.
  Evidence: `get_analytics_overview`, `get_project_file_stats`, and `get_time_breakdown` all parse `started_at` and compare against `range_days` separately.

## Decision Log

- Decision: model time range as a true global analytics scope, parallel to project scope.
  Rationale: The user explicitly wants the date-range selection to behave globally like the project selector instead of remaining page-local.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: place the selector in the header action cluster immediately before Sync.
  Rationale: This matches the requested UI placement and keeps global controls grouped in one predictable place.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: use a responsive collapse mode rather than trying to force the segmented control to fit every width.
  Rationale: The project scope selector, breadcrumbs, and sync/theme actions already compete for header space; collapsing the time selector is safer than allowing the header to overflow.
  Date/Author: 2026-03-27 / coding-agent
- Decision: include Sessions and Tool Detail in the scope of the global range feature.
  Rationale: A header-level global selector should not become route-dependent decoration; aggregate analytics routes must respond consistently.
  Date/Author: 2026-03-27 / coding-agent
- Decision: keep Session Detail and QMD out of scope for this phase.
  Rationale: Session Detail is not an aggregate analytics surface, and QMD follows a different information architecture path.
  Date/Author: 2026-03-27 / coding-agent

## Outcomes & Retrospective

Completed outcomes so far:
- current-state research across header layout, Overview, Usage, Sessions, Tool Detail, and backend analytics filtering
- written implementation spec and living execution plan

Intended final outcomes:
- one persisted analytics time range shared across analytics routes
- one header selector located before Sync
- responsive collapse behavior under narrow widths
- Sessions and Tool Detail brought into range parity with Overview/Usage
- cleaner backend filtering reuse

## Context and orientation

Relevant frontend files:
- `src/app.tsx` — top header layout and route-aware UI visibility
- `src/main.tsx` — root provider composition
- `src/components/range-picker.tsx` — current segmented control primitive
- `src/hooks/use-mobile.ts` — viewport-level mobile detection
- `src/hooks/use-container-width.ts` — container-width observer for collapse behavior
- `src/pages/dashboard.tsx` — Overview page with local range state today
- `src/pages/usage/layout.tsx` — Usage route layout with local range state today
- `src/pages/usage/usage-context.tsx` — cross-tab data context that currently exposes `set_range_days`
- `src/pages/sessions.tsx` — session table page that needs new range support
- `src/components/sessions/session-toolbar.tsx` — likely location for optional local range badge/copy
- `src/pages/tool-detail.tsx` — usage deep-dive that should adopt the global range

Relevant backend files:
- `src/api/analytics.ts` — typed Tauri wrappers that need new optional `range_days` params
- `src-tauri/src/commands/analytics.rs` — command signatures for `get_all_sessions` and `get_tool_details`
- `src-tauri/src/cache.rs` — session filtering and aggregation logic

Relevant docs:
- `docs/information-architecture.md` — canonical IA that must reflect the new header-level control
- `docs/ARCHITECTURE.md` — codemap and route ownership doc
- `docs/specs/2026-03-27-global-analytics-time-range-scope.md` — source of product/architecture decisions for this feature

## Plan of work

### Milestone 1 — Establish a single global state owner

Add a provider for analytics time range near the app root. It should own persistence, validation, and the currently selected option. Reuse the project-scope pattern: provider owns global selection; consumers read it via a hook. Keep the allowed option list centralized so the header selector and page fetch logic cannot drift.

### Milestone 2 — Add the responsive header selector

Build a header-specific selector wrapper that reuses the existing `RangePicker` in wide layouts and falls back to a compact menu trigger in narrow layouts. This wrapper should be route-aware only through `src/app.tsx`; the component itself should just render the selection UI.

Use `useIsMobile()` and `use_container_width()` so collapse happens both on true mobile widths and on cramped desktop headers.

### Milestone 3 — Convert Overview and Usage to consumers

Remove page-local range state and inline picker UI from Overview and Usage. Both routes should read `range_days` from the global provider instead. Usage tabs may still consume `range_days` via `UsageContext`, but `UsageLayout` should stop exposing a local setter if the header is now the only mutation surface.

### Milestone 4 — Extend Sessions and Tool Detail backend contracts

Add optional `range_days` parameters to `get_all_sessions` and `get_tool_details` across:
- Rust commands
- frontend API wrappers
- page-level callers

At the same time, factor out the shared backend date filtering logic so this feature does not add another copy/paste variant.

### Milestone 5 — Wire Sessions and Tool Detail UI behavior

Make Sessions and Tool Detail refetch on `[project_path, range_days]`. Keep search/tool/model filters in Sessions local and layered on top of the range-filtered base data. Optionally add a small range badge in `SessionToolbar` so the table still communicates its scope locally even though the control lives in the header.

### Milestone 6 — Validate and document

Verify header placement, responsiveness, and route consistency. Then update the IA and architecture docs so the current product model matches the implemented one.

## Concrete steps

1. Create shared time-range model + provider.
   - Add `src/components/analytics-time-range-provider.tsx`.
   - Define allowed option values and storage validation.
   - Wrap `RouterProvider` with the new provider in `src/main.tsx`.
   - Expected result: any analytics page can read a persisted `range_days` value.

2. Create the header selector.
   - Add `src/components/analytics-time-range-selector.tsx` (or a small folder if it grows).
   - Reuse `RangePicker` for expanded mode.
   - Use `DropdownMenuRadioGroup` for collapsed mode.
   - Expected result: one reusable header control that can expand/collapse based on available width.

3. Integrate the selector into the app shell.
   - Update `src/app.tsx` to render the selector before Sync.
   - Add route-based visibility rules for analytics vs non-analytics routes.
   - Expected result: header order matches the requested placement and no dead control appears on QMD or session detail.

4. Remove local picker ownership from Overview and Usage.
   - Update `src/pages/dashboard.tsx` to consume global `range_days`.
   - Update `src/pages/usage/layout.tsx` and `src/pages/usage/usage-context.tsx` to consume global `range_days` and remove the local picker render.
   - Expected result: no duplicate range pickers remain in page content.

5. Extend Sessions and Tool Detail APIs.
   - Update `src/api/analytics.ts` signatures.
   - Update `src-tauri/src/commands/analytics.rs` signatures.
   - Update `src-tauri/src/cache.rs` filtering logic and extract shared helper.
   - Expected result: both routes can request range-filtered data using the same semantics as other analytics endpoints.

6. Wire page fetches.
   - Update `src/pages/sessions.tsx` and `src/pages/tool-detail.tsx` effects to depend on `range_days`.
   - Optionally update `src/components/sessions/session-toolbar.tsx` to show a small active-range badge.
   - Expected result: route data updates when the header range changes.

7. Validate and document.
   - Run type/build checks.
   - Manually verify header layout at wide and narrow widths.
   - Update `docs/information-architecture.md` and `docs/ARCHITECTURE.md`.
   - Expected result: implementation and docs match.

Recommended commands from repo root:

```bash
bun run tsc --noEmit
bun run build
cd src-tauri && cargo check
```

For behavior validation, run the Tauri app in local dev mode and manually test Overview, Sessions, Usage, and Tool Detail while resizing the window.

## Validation and acceptance

This work is acceptable when all of the following are true:

- The time-range selector is visible in the header immediately before Sync on participating analytics routes.
- The selector is no longer rendered inside Overview or Usage page content.
- The selector collapses gracefully on narrow widths while remaining usable.
- Overview responds to header range changes.
- Sessions responds to header range changes and fetches different row sets where applicable.
- Usage tabs continue responding to header range changes.
- Tool Detail responds to the same header range.
- Session Detail and QMD hide the selector without resetting the stored range.
- `bun run tsc --noEmit` passes.
- `bun run build` succeeds.
- `cargo check` succeeds.

## Idempotence and recovery

- Provider/storage work is additive and can land before route wiring.
- If responsive collapse logic proves finicky, keep the expanded control working first and then layer on width-aware collapse as a second step in the same branch.
- If Tool Detail range support takes longer than Sessions support, do not ship the header control as visible on Tool Detail until the backend/API work is complete.
- If backend filter refactoring introduces risk, first add tests or a small internal helper and then migrate existing callers incrementally.

## Artifacts and notes

Planning artifacts created for this work:
- `docs/specs/2026-03-27-global-analytics-time-range-scope.md`
- `docs/exec-plans/active/2026-03-27-global-analytics-time-range-scope.md`

Primary implementation references:
- `src/app.tsx`
- `src/main.tsx`
- `src/components/range-picker.tsx`
- `src/pages/dashboard.tsx`
- `src/pages/usage/layout.tsx`
- `src/pages/sessions.tsx`
- `src/pages/tool-detail.tsx`
- `src/api/analytics.ts`
- `src-tauri/src/commands/analytics.rs`
- `src-tauri/src/cache.rs`

## Interfaces and dependencies

Expected interfaces at completion:
- a global analytics time-range provider + hook
- a shared allowed-option definition for time range values
- a responsive header selector component
- `get_all_sessions(project_path?, range_days?)`
- `get_tool_details(tool_name, project_path?, range_days?)`

Dependencies and rationale:
- **ProjectScopeProvider** remains separate and composes with the new time-range provider.
- **RangePicker** remains the reusable segmented UI primitive rather than becoming header-specific.
- **DropdownMenu** provides a compact fallback UI in collapsed mode.
- **SessionCache** remains the backend aggregation owner and should centralize shared time filtering.
