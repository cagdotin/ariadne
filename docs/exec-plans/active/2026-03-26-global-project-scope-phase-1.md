# Global Project Scope — Phase 1 Execution Plan

Status: Complete
Owner: coding-agent
Created: 2026-03-26
Spec: `docs/specs/2026-03-26-global-project-scope-phase-1.md`

This ExecPlan is a living document and must be maintained in accordance with `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Deliver a shared analytics project scope that lives in the app shell instead of inside individual pages. After this phase, a user can choose a project once in the header, see Overview, Sessions, Usage, and Tool Detail automatically filter to that project, and reopen the app with the same scope restored. The app must use project path as the stable identity key so duplicate trailing folder names do not collide.

## Progress

- [x] (2026-03-26) Add root-level project scope provider with local storage persistence.
- [x] (2026-03-26) Add lightweight project-list backend/frontend API.
- [x] (2026-03-26) Make overview/time-breakdown/sessions/tool-detail commands accept optional project path filtering where needed.
- [x] (2026-03-26) Integrate header selector into `src/app.tsx` and hide it on QMD routes.
- [x] (2026-03-26) Remove local project filters from Sessions and Tool Detail and wire pages to shared scope.
- [x] (2026-03-26) Update Top Projects behavior and scoped visibility.
- [x] (2026-03-26) Validate: tsc --noEmit passes, bun run build passes, cargo check passes.

## Surprises & Discoveries

- Observation: The current code already stores both `project_path` and `project_name`, so the identity bug can be fixed mostly at the filtering and selector layers without redesigning the parser payload.
  Evidence: `src-tauri/src/parser/session.rs` populates both fields, and both are present in `src/schemas/session.ts` and `src/schemas/analytics.ts`.
- Observation: Sessions and Tool Detail each fetch the project list indirectly through `get_analytics_overview()`, which is heavier than necessary for a header selector.
  Evidence: `src/pages/sessions.tsx` and `src/pages/tool-detail.tsx` both load project options from overview data.
- Observation: The `get_analytics_overview` project grouping key was `project_name`, which would merge distinct projects with the same trailing folder name. Fixed to use `project_path` as the grouping key.
  Evidence: `src-tauri/src/cache.rs` line in `get_analytics_overview` using `project_map.entry(session.project_name.clone())`.
- Observation: The `projects.tsx` page also calls `get_analytics_overview()` to get the project list. Left as-is since it doesn't pass project scope — the `/projects` route is intentionally route-driven until Phase 2.

## Decision Log

- Decision: Use `project_path` as the actual scope key and keep `project_name` as the display label.
  Rationale: Last-segment project names are ambiguous across unrelated repositories.
  Date/Author: 2026-03-26 / coding-agent + user
- Decision: Keep `/projects` and `/projects/:name` alive during Phase 1.
  Rationale: Their unique project-detail analytics are being relocated in Phase 2.
  Date/Author: 2026-03-26 / coding-agent + user
- Decision: Hide the project selector on QMD routes.
  Rationale: QMD already has an unrelated global index selector and should not imply analytics scoping there.
  Date/Author: 2026-03-26 / coding-agent
- Decision: Reuse `ProjectSummary` shape for `list_projects` API rather than introducing a new lightweight type.
  Rationale: `ProjectSummary` already has both `name` and `path` plus small aggregates. The overhead is negligible and avoids a new schema/model type.
  Date/Author: 2026-03-26 / coding-agent
- Decision: Hide "By Project" section in Tool Detail when scoped to a single project.
  Rationale: Showing a single-project breakdown is meaningless when already filtered.
  Date/Author: 2026-03-26 / coding-agent

## Outcomes & Retrospective

Completed outcomes:
- One selector in the header controls analytics scope across all analytics pages.
- Persisted scope survives reloads via localStorage key `ariadne:project-scope`.
- Overview, Sessions, Usage, and Tool Detail agree on the selected scope.
- Duplicate project names no longer cause incorrect filtering (project_path used for all identity comparisons).
- Top Projects visible only in all-projects mode; clicks set scope instead of navigating.
- Local project dropdowns removed from Sessions and Tool Detail.

Remaining work after this phase:
- Move project-detail-only analytics into Usage.
- Remove Projects routes and sidebar entry.
- Update information architecture docs to reflect the new navigation model.

## Context and orientation

Relevant frontend files:
- `src/main.tsx` — provider mount point (wraps RouterProvider).
- `src/app.tsx` — app shell, header with project selector, breadcrumbs, and route-aware layout.
- `src/components/project-scope-provider.tsx` — **NEW** context provider + hook.
- `src/components/project-scope-selector.tsx` — **NEW** header selector component.
- `src/pages/dashboard.tsx` — Overview queries scoped, Top Projects conditional.
- `src/pages/sessions.tsx` — local project dropdown removed, consumes shared scope.
- `src/pages/usage.tsx` — all analytics scoped.
- `src/pages/tool-detail.tsx` — local project dropdown removed, consumes shared scope.
- `src/components/top-projects.tsx` — sets scope on click, no route navigation.
- `src/api/analytics.ts` — typed IPC wrappers with optional project_path.

Relevant backend files:
- `src-tauri/src/commands/analytics.rs` — updated command signatures + new `list_projects`.
- `src-tauri/src/cache.rs` — scope-aware filtering, `list_projects`, project_path grouping.
- `src-tauri/src/lib.rs` — `list_projects` registered in handler.
- `src-tauri/src/parser/session.rs` — unchanged (already had project_path).

## Validation and acceptance

Validation commands passed:
- `bun run tsc --noEmit` — clean
- `bun run build` — clean
- `cargo check --manifest-path src-tauri/Cargo.toml` — clean (only pre-existing warnings)

Manual verification still recommended:
- Open dashboard with no scope → Top Projects visible.
- Click a Top Projects card → scope changes, dashboard updates, Top Projects disappears.
- Navigate to Sessions, Usage, Tool Detail → same scope applied.
- Reload app → scope restored from localStorage.
- Clear scope → project columns and global aggregates return.
- Two projects with same folder name → distinguished by path in selector.
