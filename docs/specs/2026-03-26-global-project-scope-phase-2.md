# Global Project Scope — Phase 2: Usage Consolidation and Projects Route Removal

Status: Implemented
Date: 2026-03-26
Execution plan: `docs/exec-plans/completed/2026-03-26-global-project-scope-phase-2.md`
Depends on: `docs/specs/2026-03-26-global-project-scope-phase-1.md`

## 1. Problem statement

Phase 1 introduces a shared app-level project scope but deliberately leaves the legacy Projects surfaces in place. After that phase, Ariadne still has a route and sidebar model that reflects the old “navigate into a project detail page” workflow. The user’s desired interaction model is different: project selection should happen globally, and project-specific analytics should live in the most relevant app areas, with Usage becoming the primary home for project-scoped file and tool analytics.

Phase 2 removes `/projects` and `/projects/:name` as primary user flows, relocates the remaining project-detail-only content into Usage, and updates the navigation model so “Projects” is no longer a top-level destination.

## 2. Goals and non-goals

### 2.1 Goals
- Remove the dependency on `/projects` and `/projects/:name` for normal app use.
- Move project-detail-only analytics from `src/pages/project-detail.tsx` into the Usage page.
- Keep project-specific sections hidden in all-projects mode when they do not make sense globally.
- Make Usage the temporary catch-all home for project-scoped deep-dive analytics, even if it becomes crowded in the short term.
- Remove the Projects sidebar item and related breadcrumb handling.
- Update top-project interactions and any remaining project links to set global scope instead of routing.
- Update docs to reflect the new navigation model.

### 2.2 Non-goals
- A final polished re-organization of Usage; Phase 2 prioritizes relocation over perfect layout.
- A compatibility redirect for `/projects/:name` based on the legacy `project_name` route param.
- Redesigning session detail replay.
- Introducing advanced multi-project comparison views.

## 3. System context

### 3.1 Current project-detail-only content
`src/pages/project-detail.tsx` currently owns:
- a project-specific stat row
- exclude-path filtering
- tool distribution
- directory hotspots
- file activity tabs/tables
- a project sessions table

After Phase 1, the project sessions table is already logically covered by the scoped Sessions page. The remaining tool/file/path analytics belong in Usage.

### 3.2 Current route and navigation coupling
- `src/router.tsx` still defines `/projects` and `/projects/$name`.
- `src/app.tsx` still includes a Projects sidebar item and project-specific breadcrumb logic.
- `src/components/top-projects.tsx` will already set scope after Phase 1, but route references may still remain in older pages, column definitions, or docs.

### 3.3 Information architecture implications
The current `docs/information-architecture.md` treats Projects as a top-level answer to “What’s happening in my projects?”. Phase 2 changes this to a scope-first model:
- the header selector answers “which project am I looking at?”
- Sessions answers session browsing
- Usage answers deep project/tool/file analytics
- Overview remains the pulse page

## 4. Conventions and style
- Preserve the existing card-and-table visual language in Usage even if the page becomes denser.
- Reuse existing `DirectoryHotspots`, `DataTable`, and column-definition patterns instead of inventing new one-off widgets.
- Scoped-only sections should disappear cleanly in all-projects mode rather than rendering empty placeholders.
- Prefer explicit route removal over ambiguous name-based redirects.

## 5. Domain model

### 5.1 Scoped-only analytics sections
Certain analytics are only meaningful when a single project is selected:
- exclude-path filtering for file analytics
- directory hotspots
- read/edit/write file activity tables
- project-scoped tool distribution if presented as a dedicated project deep-dive section

These sections should render only when scope is a concrete project, not `null`.

### 5.2 Usage page responsibility after Phase 2
Usage becomes the temporary home for:
- global or scoped tool usage
- model distribution
- cost breakdown
- time patterns
- top bash/read/edit/write breakdowns
- scoped file analytics migrated from Project Detail
- scoped directory hotspots migrated from Project Detail
- any additional project-deep-dive summaries needed to make the migration usable

### 5.3 Sessions page responsibility after Phase 2
Sessions remains the canonical place to browse session lists. When a project is selected globally, it implicitly functions as the former “project sessions” view.

## 6. Detailed design

### 6.1 Remove Projects from primary navigation
Phase 2 removes the Projects sidebar item and the `/projects` and `/projects/:name` routes from the main route tree.

Consequences:
- `src/router.tsx` no longer exposes Projects routes.
- `src/app.tsx` no longer renders the Projects nav button.
- Breadcrumb generation no longer needs `/projects` handling.

### 6.2 No compatibility redirect for `/projects/:name`
The old detail route uses `project_name`, which is known to be ambiguous. Because Phase 1 establishes path-based identity as the correct model, Phase 2 should not preserve a redirect that continues relying on ambiguous names.

Simple route removal is preferable to encoding the wrong identity model into redirect behavior.

### 6.3 Usage page consolidation
Usage gains a dedicated project-deep-dive area that appears only when a project scope is selected.

This area should absorb the useful analytics from `ProjectDetail`:
- exclude-path input
- directory hotspots
- file activity tabs/tables (read/edit/write)
- optionally a compact scoped summary row if additional context is needed
- project-specific tool distribution if it still adds value beyond the existing tool charts

The goal is not an elegant final IA. The goal is to keep all project-specific usage/file analytics available in one place while removing the need for a project-detail route.

### 6.4 What stays out of Usage
The old project sessions table does not move into Usage. That use case is already satisfied by the scoped Sessions page.

### 6.5 Overview behavior after Projects removal
Overview keeps the Phase 1 behavior:
- Top Projects only in all-projects mode
- Top Projects clicks set scope
- scoped overview reflects the selected project

No additional project-detail widgets move into Overview during this phase.

### 6.6 Tool Detail behavior after Projects removal
Tool Detail continues to respect the global scope. In scoped mode, the “By Project” breakdown may be hidden or visually de-emphasized because it is no longer a useful comparison when one project is already selected.

### 6.7 Cleanup of route-linked project interactions
Any remaining interactions that currently route to `/projects` or `/projects/:name` should be converted to one of:
- set global scope
- navigate to `/usage` after setting scope, if the action is specifically asking for project deep-dive analytics
- navigate to `/sessions` after setting scope, if the action is specifically about session browsing

The chosen destination should match user intent rather than preserve the removed route shape.

### 6.8 Documentation updates
Phase 2 must update docs that still describe Projects as a top-level area, especially:
- `docs/information-architecture.md`
- `docs/ARCHITECTURE.md`
- any rebuild/spec docs that are still treated as active references

## 7. Error handling and failure modes
- Scoped-only Usage sections should not render in all-projects mode; this is intentional, not an error state.
- If project file analytics fail while the rest of Usage loads successfully, the page should show section-local failure messaging where practical rather than blanking the whole page.
- Route removal must not leave broken sidebar buttons or component-level links.

## 8. Security and safety considerations
- Removing ambiguous name-based routes reduces the chance of showing the wrong project’s analytics.
- Scoped file analytics must continue using typed IPC filters, not shell interpolation.

## 9. Testing strategy

### 9.1 Unit tests
- Any helper logic extracted from `ProjectDetail` for file filtering/excludes should receive focused tests if practical.
- Any new conditional rendering helpers for scoped-only Usage sections should be covered where test infrastructure already exists.

### 9.2 Integration tests
- Manual verification that selecting a project and opening Usage exposes migrated project-specific analytics.
- Manual verification that clearing scope hides project-only Usage sections.
- Manual verification that Sessions now serves as the effective per-project sessions view when scoped.
- Manual verification that no UI element still navigates to removed Projects routes.

## 10. Implementation checklist
- [ ] Move project-detail file analytics into Usage.
- [ ] Move directory hotspots into Usage.
- [ ] Move exclude-path filtering into Usage.
- [ ] Decide whether scoped tool distribution stays in Usage and implement accordingly.
- [ ] Keep project sessions browsing on the scoped Sessions page.
- [ ] Remove Projects routes from `src/router.tsx`.
- [ ] Remove Projects sidebar item and breadcrumb handling from `src/app.tsx`.
- [ ] Delete or retire `src/pages/projects.tsx` and `src/pages/project-detail.tsx` once all live references are gone.
- [ ] Remove or replace all remaining `/projects` links.
- [ ] Update architecture and IA docs.

## 11. Open questions
- Whether scoped tool distribution should remain as a separate dedicated card once Usage already shows top-level tool usage.
- Whether any project-scoped stat row from `ProjectDetail` should be retained in Usage or whether scoped Overview already provides enough context.
- Whether one or more interactions should automatically navigate to Usage after setting scope, or whether scope changes should remain location-preserving everywhere.
