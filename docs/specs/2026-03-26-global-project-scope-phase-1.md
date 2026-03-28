# Global Project Scope — Phase 1: Shared Scope and Scoped Analytics

Status: Implemented
Date: 2026-03-26
Execution plan: `docs/exec-plans/completed/2026-03-26-global-project-scope-phase-1.md`

## 1. Problem statement

Ariadne currently treats project filtering as a page-local concern instead of an app-level scope. The Sessions page (`src/pages/sessions.tsx`) and Tool Detail page (`src/pages/tool-detail.tsx`) each own their own project dropdown and load their own project lists, while the Overview and Usage pages are always global. This creates inconsistent navigation, repeated queries, and a slower-feeling workflow when the user wants to stay focused on one project for a longer period.

At the same time, Ariadne currently identifies projects primarily by `project_name`, which is derived from the last path segment of `cwd`. This is unsafe because distinct projects can share the same trailing directory name.

Phase 1 establishes a true app-level project scope, persisted in local storage, and makes the analytics pages consume that shared scope. The existing `/projects` and `/projects/:name` routes remain in place during this phase so the project-detail functionality continues to exist while Phase 2 relocates it.

## 2. Goals and non-goals

### 2.1 Goals
- Add a global analytics project scope in the app shell.
- Place the project selector in the header area alongside breadcrumbs.
- Persist the last selected scope in local storage and restore it on app launch.
- Define `null` scope as the unfiltered, all-projects view.
- Make Overview, Sessions, Usage, and Tool Detail respect the shared scope.
- Remove page-local project filters from Sessions and Tool Detail.
- Add a lightweight project-list API for populating the global selector without fetching full overview data.
- Fix the current project identity ambiguity by using project path as the stable scope key while still showing human-readable project names in the UI.
- Hide dashboard Top Projects when a specific project is selected.
- Make Top Projects cards set the global scope instead of navigating to project routes.

### 2.2 Non-goals
- Removing `/projects` and `/projects/:name` routes.
- Relocating project-detail-only analytics into Usage.
- Redesigning the Usage page information architecture beyond what is needed for scoped filtering.
- Changing QMD behavior or introducing project scope into QMD routes.
- Redesigning session detail behavior around scope mismatches.

## 3. System context

### 3.1 Frontend surfaces
- `src/app.tsx` owns the app shell, top header, sidebar, and breadcrumbs.
- `src/pages/dashboard.tsx` loads overview and time breakdown data globally.
- `src/pages/sessions.tsx` currently owns a local project dropdown and calls `get_all_sessions(project_name?)`.
- `src/pages/usage.tsx` currently loads only global analytics.
- `src/pages/tool-detail.tsx` currently owns a local project dropdown and calls `get_tool_details(tool_name, project_name?)`.
- `src/components/top-projects.tsx` currently navigates to `/projects/:name`.
- `src/main.tsx` is the best root-level place for a new global provider that must survive route changes.

### 3.2 Backend surfaces
- `src-tauri/src/parser/session.rs` derives both `project_path` and `project_name` from the session header.
- `src-tauri/src/cache.rs` holds all session summaries in memory and is the aggregation layer for analytics queries.
- `src-tauri/src/commands/analytics.rs` exposes cache methods over Tauri IPC.
- `src/api/analytics.ts` is the typed frontend wrapper layer.

### 3.3 Current mismatch to fix now
The parser stores both:
- `project_path`: stable full cwd
- `project_name`: display-friendly last path segment

Filtering and route behavior currently rely too heavily on `project_name`. Phase 1 changes the app-level scope and analytics filtering logic to use project path as the actual identity key. The display label remains the project name, with the full path available when needed.

## 4. Conventions and style
- Follow existing frontend naming and composition patterns in `src/components/theme-provider.tsx` for local-storage-backed global state.
- Continue validating all analytics IPC responses with Zod in `src/api/analytics.ts` and `src/schemas/analytics.ts`.
- Keep commands thin in `src-tauri/src/commands/analytics.rs`; aggregation and filtering logic should remain in `src-tauri/src/cache.rs`.
- Use Bun commands for validation and local development.
- Keep QMD pages visually separate from analytics scoping concerns.

## 5. Domain model

### 5.1 Project scope
Ariadne gains an app-level analytics scope:
- `null` → all projects, no backend filtering
- `{ project_path, project_name }` → single-project scope

The scope is persisted in local storage under a dedicated analytics key and restored on load.

### 5.2 Project identity
Project identity is split into:
- **stable key**: `project_path`
- **display label**: `project_name`

Any selector value, backend filter input, or internal comparison that decides “which project is this?” should use `project_path`, not `project_name`.

### 5.3 Project list payload
The app shell needs a dedicated lightweight list of projects, sorted for selector usability and containing enough information to:
- render labels
- restore a stored scope
- tolerate deleted/renamed projects after a resync

The existing `ProjectSummary` shape already includes both `name` and `path`, so a new lightweight command may either reuse that shape or expose a smaller summary. The important decision is that the selector must no longer fetch the heavy overview payload just to render options.

## 6. Detailed design

### 6.1 Global provider and hook
Introduce a root-level project-scope provider and hook pair. The provider is responsible for:
- reading persisted scope on startup
- exposing current scope and update/clear actions
- exposing the currently known project list for selector rendering
- clearing invalid stored scope values when the selected path no longer exists

The provider should wrap `RouterProvider` in `src/main.tsx` so route changes do not reset scope state.

### 6.2 Header selector placement and behavior
The app header in `src/app.tsx` gains a project selector near the breadcrumb area.

Behavior:
- Visible on analytics routes: Overview, Projects, Project Detail, Sessions, Session Detail, Usage, Tool Detail.
- Hidden on QMD routes, where index selection is already the primary global selector.
- First option is “All projects”.
- Selected-project options display the human-readable project name and may show the full path as secondary text or tooltip to disambiguate duplicates.
- Changing selection updates the shared provider immediately.

### 6.3 Local storage
Persist scope in local storage under a dedicated key, e.g. `ariadne:project-scope`.

Persistence rules:
- `null` scope either removes the key or stores an explicit null payload.
- Scoped values persist both path and display name.
- On startup, if the stored path no longer appears in the project list, clear the stored scope and fall back to all projects.

### 6.4 Analytics API shape after Phase 1
Phase 1 standardizes analytics APIs around optional project scope, with `null` meaning unfiltered:
- `list_projects()`
- `get_analytics_overview(project_path?)`
- `get_time_breakdown(range_days, project_path?)`
- `get_sessions(project_path?)`
- `get_tool_details(tool_name, project_path?)`
- `get_file_stats(project_path?)` may be introduced in this phase or deferred behind the existing project-detail route until Phase 2

Notes:
- Existing frontend and backend helpers may keep transitional wrappers for compatibility during the phase, but the target behavior is a single optional-scope filtering model.
- `get_session_detail(session_id)` and `get_session_entries(session_id)` remain id-based and unchanged.

### 6.5 Backend filtering behavior
The cache layer becomes the single source of truth for scope-aware analytics filtering.

For any optional project filter:
- `None` → current global behavior
- `Some(project_path)` → only sessions whose `project_path` matches exactly

This exact-match-by-path behavior replaces existing matching-by-name wherever the global scope participates.

### 6.6 Page behavior

#### Overview (`src/pages/dashboard.tsx`)
- `get_analytics_overview` and `get_time_breakdown` consume the current project scope.
- Stat cards reflect either all projects or the selected project.
- `TopProjects` renders only when scope is `null`.
- Clicking a Top Projects card sets scope instead of routing.

#### Sessions (`src/pages/sessions.tsx`)
- Remove local project dropdown.
- Load data from shared scope using `get_sessions(project_path?)`.
- Keep project column visible only in all-projects mode.

#### Usage (`src/pages/usage.tsx`)
- `get_analytics_overview` and `get_time_breakdown` consume the shared scope.
- Existing global visualizations become automatically project-scoped when a project is selected.

#### Tool Detail (`src/pages/tool-detail.tsx`)
- Remove local project dropdown.
- Call `get_tool_details(tool_name, project_path?)` using shared scope.
- “By Project” remains available in all-projects mode and may be hidden or de-emphasized later when scoped.

#### Session Detail (`src/pages/session-detail.tsx`)
- Remains session-id driven.
- Phase 1 does not block loading a session whose project does not match the current scope.
- Breadcrumbs remain route-based rather than scope-based.

### 6.7 Top Projects behavior
`src/components/top-projects.tsx` changes from route navigation to scope mutation:
- visible only in all-projects mode
- click → set global scope to that project path
- no route transition required

### 6.8 Transitional coexistence with Projects routes
`/projects` and `/projects/:name` remain in Phase 1.

They may optionally read from the new scope where useful, but they are not the primary interaction model anymore. Their removal and content relocation are handled in Phase 2.

## 7. Error handling and failure modes
- If the project list fails to load, the selector should degrade gracefully and avoid breaking page rendering; pages may continue using `null` scope.
- If a scoped analytics query fails, pages retain existing error rendering patterns.
- If local storage contains malformed JSON, clear the key and continue with `null` scope.
- If a previously selected project disappears after sync, automatically clear the scope and continue in all-projects mode.
- If duplicate `project_name` values exist, selector identity remains correct because comparisons use `project_path`.

## 8. Security and safety considerations
- Project scope persistence stores only project identity metadata already visible in the app.
- Scope data should never be interpolated into shell commands; it remains typed IPC input only.
- Exact path matching should be used for filtering, not prefix matching.

## 9. Testing strategy

### 9.1 Unit tests
- Frontend provider tests for restore, set, clear, and invalid-stored-scope behavior.
- API wrapper tests or lightweight schema checks for any updated command signatures.
- Rust cache tests for optional path filtering behavior where test coverage already exists or is easy to add.

### 9.2 Integration tests
- Manual app-flow verification that selecting a project updates Overview, Sessions, Usage, and Tool Detail consistently.
- Local storage verification across app reloads.
- Duplicate-name scenario verification using two sessions with distinct `project_path` values and identical trailing folder names.

## 10. Implementation checklist
- [ ] Create a global project-scope provider and hook.
- [ ] Add a lightweight project-list command and typed frontend wrapper.
- [ ] Persist scope in local storage and restore it on startup.
- [ ] Add header selector in `src/app.tsx` and hide it on QMD routes.
- [ ] Make Overview consume optional project scope.
- [ ] Make Sessions consume optional project scope and remove local filter UI.
- [ ] Make Usage consume optional project scope.
- [ ] Make Tool Detail consume optional project scope and remove local filter UI.
- [ ] Change Top Projects to set scope and hide when scoped.
- [ ] Update backend filtering to use `project_path` for identity.
- [ ] Preserve `/projects` routes for Phase 2 migration.

## 11. Open questions
- Whether the new selector should show path subtitles inline or only via tooltip for duplicate-name disambiguation.
- Whether `get_file_stats(project_path?)` should be introduced in Phase 1 for API consistency or left as a Phase 2 rename around the existing per-project file-stats command.
- Whether the Projects and Project Detail pages should actively reflect current scope during the transition or remain independently route-driven until Phase 2.
