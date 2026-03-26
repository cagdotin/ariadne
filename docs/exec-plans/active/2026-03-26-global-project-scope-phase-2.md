# Global Project Scope — Phase 2 Execution Plan

Status: Complete
Owner: coding-agent
Created: 2026-03-26
Spec: `docs/specs/2026-03-26-global-project-scope-phase-2.md`
Depends on: `docs/exec-plans/active/2026-03-26-global-project-scope-phase-1.md`

This ExecPlan is a living document and must be maintained in accordance with `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Retire the old Projects-first navigation model after Phase 1 makes project selection global. After this phase, users no longer need `/projects` or `/projects/:name` to inspect one project. They choose a project in the header, browse sessions on the scoped Sessions page, and inspect project-specific file/tool analytics on Usage. The page may be temporarily crowded; correctness and continuity of access matter more than perfect organization in this phase.

## Progress

- [x] (2026-03-26) Migrate project-detail-only analytics into Usage under scoped-only sections.
- [x] (2026-03-26) Keep per-project session browsing exclusively on the scoped Sessions page.
- [x] (2026-03-26) Remove Projects routes and sidebar entry.
- [x] (2026-03-26) Remove remaining `/projects` links and convert them to scope-based actions.
- [x] (2026-03-26) Retire obsolete project pages/files.
- [x] (2026-03-26) Update information-architecture and architecture docs.
- [x] (2026-03-26) Validate that all project-specific workflows still exist without project routes.

## Surprises & Discoveries

- Observation: `src/pages/project-detail.tsx` already contains mostly self-contained file analytics logic that can be moved into Usage with limited conceptual transformation.
  Evidence: It already isolates exclude-path parsing, directory-hotspot recomputation, and file-tab switching in one page module.
- Observation: The old `/projects/:name` route is path-identity-hostile because it keys by display name, not stable path.
  Evidence: parser and session schemas store both `project_name` and `project_path`, and duplicate last-segment names are possible.
- Observation: The backend `get_project_file_stats` was filtering by `project_name` (ambiguous). Updated to use `project_path` for correct identity.
  Evidence: cache.rs filter was `s.project_name == project_name`, changed to `s.project_path == project_path`.
- Observation: `get_project_sessions` API was only used by the now-deleted `project-detail.tsx`. Removed from frontend API since `get_all_sessions(project_path?)` covers the same need.
  Evidence: grep confirmed no other callers in src/.

## Decision Log

- Decision: Usage is the temporary landing area for migrated project-deep-dive analytics even if the page becomes dense.
  Rationale: The user prefers shipping the unified scope model quickly and iterating on organization later.
  Date/Author: 2026-03-26 / coding-agent + user
- Decision: Sessions remains the source of truth for per-project session browsing; the old project sessions table will not be duplicated in Usage.
  Rationale: Scoped Sessions already covers that need once the header selector exists.
  Date/Author: 2026-03-26 / coding-agent + user
- Decision: Do not preserve `/projects/:name` with a redirect.
  Rationale: The route encodes ambiguous `project_name` identity and should not survive the path-key migration.
  Date/Author: 2026-03-26 / coding-agent
- Decision: Extracted file analytics into `ScopedFileAnalytics` component rather than inlining all logic in Usage.
  Rationale: Keeps Usage page manageable and the scoped section self-contained with its own loading/error state.
  Date/Author: 2026-03-26 / coding-agent
- Decision: Updated backend `get_project_file_stats` to filter by `project_path` instead of `project_name`.
  Rationale: Aligns with Phase 1's path-based identity model and eliminates the last ambiguous name-based filter.
  Date/Author: 2026-03-26 / coding-agent

## Outcomes & Retrospective

Completed outcomes:
- Project-specific file and directory analytics live in Usage (scoped-only sections via `ScopedFileAnalytics`).
- Scoped Sessions replaces the old project sessions table workflow.
- Projects disappeared from the sidebar and route tree.
- No primary workflow depends on `/projects` routes anymore.
- Dashboard "Projects" stat card no longer links to `/projects`.
- Backend `get_project_file_stats` uses path-based identity.
- `project-columns.tsx` column definitions removed (dead code).
- All active docs updated to reflect scope-first model.

Remaining follow-up after this phase:
- Refine Usage information architecture once the migrated sections are in place (e.g., better visual separation or collapsible sections).
- Consider whether `get_project_sessions` backend command should also be retired from Rust (currently still registered but no frontend caller).
- Consider more elegant scoped comparison and deep-link behavior later.
- `docs/DESIGN.md` still has legacy references in some sections — a full DESIGN.md refresh is separate work.

## Context and orientation

Files changed:
- `src/pages/usage.tsx` — added ScopedFileAnalytics import and render
- `src/components/scoped-file-analytics.tsx` — NEW: extracted project file deep-dive component
- `src/router.tsx` — removed Projects and ProjectDetail routes
- `src/app.tsx` — removed Projects sidebar item, FolderOpen import, and project breadcrumbs
- `src/pages/dashboard.tsx` — removed `href="/projects"` from Projects stat card
- `src/api/analytics.ts` — updated `get_project_file_stats` to use `project_path`, removed `get_project_sessions`
- `src/schemas/analytics.ts` — changed `ProjectFileStats.project_name` to `project_path`
- `src-tauri/src/commands/analytics.rs` — changed `get_project_file_stats` param to `project_path`
- `src-tauri/src/cache.rs` — changed file stats filtering from `project_name` to `project_path`
- `src-tauri/src/models/analytics.rs` — changed `ProjectFileStats.project_name` to `project_path`
- `docs/information-architecture.md` — removed Projects sections, updated navigation, added scope-first model docs
- `docs/ARCHITECTURE.md` — removed project pages from codemap, added scoped-file-analytics
- `docs/DESIGN.md` — removed Projects/ProjectDetail sections, updated Usage and Sessions descriptions

Files deleted:
- `src/pages/projects.tsx`
- `src/pages/project-detail.tsx`
- `src/components/columns/project-columns.tsx`

## Validation and acceptance

- [x] `bun run tsc --noEmit` passes
- [x] `bun run build` succeeds
- [x] No `/projects` route references remain in `src/`
- [x] No `/projects` references remain in active docs (only in specs/exec-plans as historical references)
- [x] All project-specific analytics available via Usage when scoped
- [x] Sessions serves as per-project session browser when scoped
