# Global Project Scope — Phase 2 Execution Plan

Status: Proposed
Owner: coding-agent
Created: 2026-03-26
Spec: `docs/specs/2026-03-26-global-project-scope-phase-2.md`
Depends on: `docs/exec-plans/active/2026-03-26-global-project-scope-phase-1.md`

This ExecPlan is a living document and must be maintained in accordance with `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Retire the old Projects-first navigation model after Phase 1 makes project selection global. After this phase, users no longer need `/projects` or `/projects/:name` to inspect one project. They choose a project in the header, browse sessions on the scoped Sessions page, and inspect project-specific file/tool analytics on Usage. The page may be temporarily crowded; correctness and continuity of access matter more than perfect organization in this phase.

## Progress

- [ ] (2026-03-26 00:00 local) Migrate project-detail-only analytics into Usage under scoped-only sections.
- [ ] (2026-03-26 00:00 local) Keep per-project session browsing exclusively on the scoped Sessions page.
- [ ] (2026-03-26 00:00 local) Remove Projects routes and sidebar entry.
- [ ] (2026-03-26 00:00 local) Remove remaining `/projects` links and convert them to scope-based actions.
- [ ] (2026-03-26 00:00 local) Retire obsolete project pages/files.
- [ ] (2026-03-26 00:00 local) Update information-architecture and architecture docs.
- [ ] (2026-03-26 00:00 local) Validate that all project-specific workflows still exist without project routes.

## Surprises & Discoveries

- Observation: `src/pages/project-detail.tsx` already contains mostly self-contained file analytics logic that can be moved into Usage with limited conceptual transformation.
  Evidence: It already isolates exclude-path parsing, directory-hotspot recomputation, and file-tab switching in one page module.
- Observation: The old `/projects/:name` route is path-identity-hostile because it keys by display name, not stable path.
  Evidence: parser and session schemas store both `project_name` and `project_path`, and duplicate last-segment names are possible.

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

## Outcomes & Retrospective

Planned outcomes for this phase:
- Project-specific file and directory analytics live in Usage.
- Scoped Sessions replaces the old project sessions table workflow.
- Projects disappears from the sidebar and route tree.
- No primary workflow depends on `/projects` routes anymore.

Remaining follow-up after this phase:
- Refine Usage information architecture once the migrated sections are in place.
- Consider more elegant scoped comparison and deep-link behavior later.

## Context and orientation

Relevant files expected to change:
- `src/pages/usage.tsx`
- possibly new Usage subcomponents extracted from `src/pages/project-detail.tsx`
- `src/router.tsx`
- `src/app.tsx`
- `src/components/top-projects.tsx` and any other components with lingering project-route links
- `src/pages/projects.tsx`
- `src/pages/project-detail.tsx`
- docs under `docs/`

Precondition:
- Phase 1 must already provide global project scope, scoped analytics APIs, and top-project scope-setting behavior.

Key migration boundary:
- Session browsing stays on `src/pages/sessions.tsx`.
- File/tool/path deep dive moves to `src/pages/usage.tsx`.

## Plan of work

Begin by extracting or reusing the file-analytics and directory-hotspot logic from `ProjectDetail` so Usage can render it only when a project scope is present. Once the migrated sections work in Usage, remove route and sidebar dependencies on Projects, update any lingering route-based interactions, then retire obsolete pages and refresh the documentation so the repo’s written architecture matches the shipped UI.

## Concrete steps

1. Inspect all `/projects` references before touching routes:
   ```bash
   rg -n '"/projects|`/projects|/projects/|projects_route|project_detail_route' src docs
   ```
   Expected: hits in router, app shell, top-projects, docs, and possibly column/link helpers.

2. Move or extract project-detail analytics into Usage.
   Expected: Usage renders scoped-only sections for exclude paths, directory hotspots, and file activity.

3. Confirm Sessions still covers per-project session browsing when scope is set.
   Expected: no need to preserve the project sessions table elsewhere.

4. Remove Projects routes from `src/router.tsx` and the sidebar/breadcrumb logic from `src/app.tsx`.
   Expected: app compiles without Projects references in primary navigation.

5. Replace lingering `/projects` interactions with scope-setting actions and appropriate destination behavior.
   Expected: no functional UI path depends on removed routes.

6. Delete or retire obsolete page modules after all references are gone.
   Expected: dead-code removal is clean and type-safe.

7. Update docs and architecture references.
   Expected: active docs no longer describe Projects as a top-level route.

8. Run validation commands:
   ```bash
   bun run tsc --noEmit
   bun run build
   ```

## Validation and acceptance

Acceptance criteria:
- With no scope selected, Overview, Sessions, and Usage work without a Projects page.
- With a project selected, Usage shows migrated project-specific analytics and Sessions shows the project’s sessions.
- Clearing scope hides scoped-only Usage deep-dive sections.
- No sidebar item or primary UI action navigates to `/projects` or `/projects/:name`.
- Docs describe the new scope-first navigation model accurately.

Recommended checks:
- From all-projects mode, set scope via Top Projects and inspect Usage.
- Clear scope and confirm Usage collapses back to global analytics only.
- Navigate through Sessions, Usage, Tool Detail, and Overview to confirm no stale project-route links remain.
- Grep the codebase for `/projects` references after cleanup and confirm only historical docs/specs remain where appropriate.

## Idempotence and recovery

- Migrate UI sections before removing routes so there is always a working place to inspect project analytics.
- Keep route removal as a distinct commit-sized step if possible, making rollback straightforward.
- If Usage becomes too unstable during migration, land extraction of reusable components first, then compose them into Usage before deleting old pages.
- If docs drift during implementation, update them in the same pass as route removal to avoid a half-migrated written architecture.

## Artifacts and notes

Expected retirements:
- `src/pages/projects.tsx`
- `src/pages/project-detail.tsx`

Expected long-lived surfaces after migration:
- `src/pages/dashboard.tsx`
- `src/pages/sessions.tsx`
- `src/pages/usage.tsx`
- `src/pages/tool-detail.tsx`
- header-level project selector/provider introduced in Phase 1

## Interfaces and dependencies

Interfaces expected at completion:
- Scoped-only project deep-dive section(s) inside Usage.
- No Projects routes in router.
- No Projects nav item in app shell.
- All project-selection interactions expressed through global scope state rather than route params.

Dependencies:
- Phase 1 provider and optional-scope analytics APIs.
- Existing `DirectoryHotspots`, `DataTable`, and file-activity column definitions.
- Updated docs that remain aligned with implementation.
