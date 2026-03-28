# Usage File Analytics Visualizations Execution Plan

Status: Complete
Owner: coding-agent
Created: 2026-03-27
Spec: `docs/specs/2026-03-27-usage-file-analytics-visualizations.md`

This ExecPlan is a living document and must be maintained in accordance with `/Users/cgn/git/dev/0xcgn/agents/skills/plan/PLAN.md`.

## Purpose / Big picture

Expand the scoped Usage → Files tab from a treemap-plus-grid into a richer file analytics workspace. After this work, a user should be able to:
- switch the file analytics lens between `All`, `Read`, `Edit`, and `Write`
- see the treemap reflow so area represents the selected operation
- understand the chart at a glance because the UI clearly explains area, color, intensity, and drilldown path
- inspect operation mix ratios in the treemap
- compare file size versus activity in a dedicated scatter chart
- inspect read-heavy versus change-heavy files in a dedicated imbalance/churn chart
- distinguish broad cross-session hotspots from one-session noise in a dedicated session-breadth view once backend support is added

Observable verification will be: pick a scoped project, change the operation lens, watch the treemap geometry change, drill into a directory using the breadcrumb/path control, and see companion charts update under the same scoped filters.

## Progress

- [x] (2026-03-27) Confirm final Files tab chart ordering and any doc updates implied by the expanded surface.
- [x] (2026-03-27) Introduce a shared operation-lens state in the Files tab and thread it into file analytics components.
  - Added `OperationLensPicker` to `files-tab.tsx`; lens state shared at page level and passed to treemap.
- [x] (2026-03-27) Refactor file aggregation toward a unified per-file insight record to reduce duplicated frontend merging logic.
  - Created `src/lib/file-analytics.ts` with `FileInsight`, `merge_file_insights()`, intensity helpers, format helpers.
  - Files tab now derives `FileInsight[]` once and passes to treemap; grid still uses legacy `NameCount[]` arrays.
- [x] (2026-03-27) Upgrade the treemap with lens-driven area, intensity buckets, richer legend text, mix-ratio tooltip, and explicit breadcrumb/path controls.
  - Treemap now uses `dataKey="value"` where value = lens-selected metric. Switching lens reflows geometry.
  - GitHub-style intensity via sqrt-bucketed scale; intensity computed relative to sibling level max.
  - Tooltip shows R/E/W counts, percentages, total, file counts for dirs.
  - Legend explains Area, Color, Darker, and shows hue swatches.
  - Empty state when lens has no data after filtering.
  - Breadcrumb preserved with improved "⌂ Root" label and cursor-pointer.
- [x] (2026-03-27) Add backend/frontend support for optional file size metadata and distinct session counts per file.
  - Rust: Added `FileInsightRecord` (path, r/e/w/total counts, distinct_session_count) to `models/analytics.rs`.
  - Rust: `get_project_file_stats` now tracks `HashMap<String, HashSet<String>>` for session-per-file, builds `file_insights` in response.
  - Rust: Added `FileSizeResult` struct + `get_file_sizes(paths)` as separate Tauri command (Option A: two-phase).
  - Rust: Registered `get_file_sizes` in `lib.rs`.
  - TS: Added `FileInsightRecordSchema`, `FileSizeResultSchema` to `schemas/analytics.ts`, added `file_insights` to `ProjectFileStatsSchema`.
  - TS: Added `get_file_sizes()` API function in `api/analytics.ts`.
  - TS: Added `from_backend_insights()`, `enrich_with_sizes()` to `lib/file-analytics.ts`.
  - TS: `files-tab.tsx` now uses `from_backend_insights(file_stats.file_insights)` instead of frontend merge.
- [x] (2026-03-27) Add the imbalance/churn chart.
  - New `src/components/file-imbalance-chart.tsx` — horizontal stacked bars showing read vs change (edit+write) ratio per file. Sorted by skew from 50/50. Self-contained, receives `FileInsight[]` + `project_path`.
- [x] (2026-03-27) Add the session-breadth chart.
  - New `src/components/file-session-breadth-chart.tsx` — bar chart ranking files by distinct session count. Bar width = sessions, intensity = ops/session. Uses `distinct_session_count` from backend insights. Graceful empty state when data unavailable.
- [x] (2026-03-27) Add the size-vs-activity scatter chart.
  - New `src/components/file-size-activity-scatter.tsx` — Recharts ScatterChart with log-log axes. X = file size, Y = lens-selected ops. Self-contained: fetches sizes via `get_file_sizes()` internally (Option A two-phase). Shows loading state, skipped-file count, lens-colored dots.
- [x] (2026-03-27) Wire all companion charts into Files tab layout.
  - Imbalance + Breadth in 2-column grid. Scatter full-width below. Grid stays at bottom as precise lookup.
- [x] (2026-03-27) Update docs and validate the full Files tab workflow.
  - Updated `docs/information-architecture.md`: Files tab section rewritten to reflect operation lens, treemap explorer, 3 companion charts, file grid. API Commands section updated with `get_file_sizes` and enriched `get_project_file_stats` description. Tool Detail route corrected to `/usage/tools/:tool_name`. Scope-first project model description updated.
  - `bun run tsc --noEmit` ✅, `bun run build` ✅, `cargo check` ✅.

## Surprises & Discoveries

- Observation: the current treemap in `src/components/file-hotspot-treemap.tsx` always uses `dataKey="total"`, so area currently represents total operations regardless of operation type.
  Evidence: component reads `dataKey="total"` and builds nodes with `total = reads + edits + writes`.
- Observation: the existing breadcrumb is meaningful navigation, not decorative UI.
  Evidence: the user explicitly called it non-negotiable because it represents the current drilldown path into the tree.
- Observation: Recharts nested treemap breadcrumbs reserve layout space at the bottom of the chart, and the current component already works around this with a manual `y_scale` adjustment.
  Evidence: `src/components/file-hotspot-treemap.tsx` defines `NEST_BREADCRUMB_HEIGHT = 30` and rescales node y/height.
- Observation: current project file analytics data is operation-rich but metadata-poor.
  Evidence: `src-tauri/src/cache.rs#get_project_file_stats` returns separate read/edit/write lists plus directory stats, but no unified file records, size bytes, or distinct session counts.
- Observation: project-scoped analytics still include non-project and temporary paths.
  Evidence: the treemap screenshot and `normalize_path()` logic show paths like `/Users/...` and `/var/folders/...` when they cannot be reduced to project-relative paths.
- Observation: the current Files tab implementation in `src/pages/usage/files-tab.tsx` already diverges from the older documentation by focusing on treemap + file grid rather than the earlier directory-hotspots/tool-distribution stack.
  Evidence: the page imports `FileHotspotTreemap` and `FileHotspotGrid`, while `docs/information-architecture.md` still describes older file analytics sections.

- Observation: Recharts Treemap `type="nest"` passes all node fields as props to the custom `content` component. This means extra fields like `_level_max` and custom `lens` can be threaded through the data nodes and read in the cell renderer without extra React context.
  Evidence: implemented level_max annotation in `to_tree_nodes()` and it flows through to `TreemapCell` props.
- Observation: when filtering by a single operation lens (e.g., Write), nodes with zero writes must be pruned from the tree. Otherwise Recharts renders zero-area rectangles that consume layout space.
  Evidence: added `if (value <= 0) continue` in `to_tree_nodes()` + directory empty-child check after recursive filtering.

## Decision Log

- Decision: the treemap should change rectangle area with the selected operation lens instead of keeping geometry stable.
  Rationale: the user explicitly wants the treemap to answer different questions by changing the area basis when switching between `All`, `Read`, `Edit`, and `Write`.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: breadcrumb/path navigation must remain part of the treemap experience.
  Rationale: drilldown location is core navigation state, not optional UI chrome.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: operation mix ratio belongs in the treemap.
  Rationale: dominant hue alone hides composition detail; counts plus percentages give the missing context without needing another chart.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: relative hotspot analysis, imbalance/churn, and session breadth should be separate charts rather than overloading the treemap.
  Rationale: each question is valuable, but forcing all of them into one chart would make the treemap hard to interpret.
  Date/Author: 2026-03-27 / coding-agent + user
- Decision: recency is not a first-class visualization goal for this initiative.
  Rationale: the existing Usage page date-range filter already provides the primary time lens for file analytics.
  Date/Author: 2026-03-27 / coding-agent + user

## Outcomes & Retrospective

Completed outcomes:
- Shared operation lens (`All / Read / Edit / Write`) in Files tab
- Unified `FileInsight` data model with `from_backend_insights()` + `enrich_with_sizes()`
- Treemap explorer v2 with lens-driven area, GitHub-style intensity, rich tooltip, legend
- Backend `file_insights` with `distinct_session_count` in `ProjectFileStats`
- Backend `get_file_sizes(paths)` as separate Tauri command (Option A two-phase)
- Imbalance/churn chart (`file-imbalance-chart.tsx`)
- Session breadth chart (`file-session-breadth-chart.tsx`)
- Size-vs-activity scatter chart (`file-size-activity-scatter.tsx`)
- All charts wired into Files tab with consistent layout

Remaining outcomes to deliver:
- Manual validation in-app (requires running the Tauri desktop app with a scoped project)

## Context and orientation

Relevant frontend files today:
- `src/pages/usage/files-tab.tsx` — owns summary cards, exclude filter, treemap, and file grid.
- `src/components/file-hotspot-treemap.tsx` — current treemap with frontend-built hierarchy, dominant-op hue, and bottom breadcrumb.
- `src/components/file-hotspot-grid.tsx` — exact file activity lookup surface that should remain after richer charts are added.
- `src/components/range-picker.tsx` — example of compact segmented-control styling already used elsewhere in analytics.
- `src/schemas/analytics.ts` — typed frontend contract for `ProjectFileStats`.

Relevant backend files today:
- `src-tauri/src/cache.rs` — aggregates per-project file stats.
- `src-tauri/src/models/analytics.rs` — declares `ProjectFileStats` and related response structs.
- `src-tauri/src/parser/session.rs` — records per-session file read/edit/write counts.
- `src-tauri/src/commands/analytics.rs` — exposes `get_project_file_stats` to the frontend.

Relevant docs:
- `docs/information-architecture.md` — canonical IA doc; will need alignment once the Files tab grows.
- `docs/specs/2026-03-27-usage-file-analytics-visualizations.md` — decision document for this initiative.

Current constraints a novice implementer must understand:
- file analytics are only shown when a concrete project scope is selected
- the page already shares a global date range from `Usage`
- excludes are applied on the frontend today
- session history can reference files outside the current project root or files that no longer exist
- the current treemap uses Recharts nested treemap behavior, which complicates custom breadcrumb placement

## Plan of work

### Milestone 1 — Normalize the data model around file-centric insights

Start by making the file analytics data model easier to reuse across multiple charts. Today each chart-like component re-merges read/edit/write arrays independently. That was acceptable for two views, but it becomes fragile as the Files tab grows.

The implementation should establish a unified file insight record that can feed treemap, scatter, imbalance, breadth, and grid views. The record needs read/edit/write/total counts immediately, and it should be extended to carry distinct session count and optional size metadata. Whether the backend returns the unified records directly or the frontend derives them from legacy arrays can be staged, but the end state should make file-centric analytics a first-class contract.

### Milestone 2 — Introduce shared Files-tab state for the operation lens

Add a shared `All / Read / Edit / Write` control near the top of the Files tab and wire that state into the treemap and new companion charts. Keep the existing exclude-path filter and date range as shared inputs. The goal is that the Files tab behaves like a coordinated analytics surface rather than a pile of unrelated cards.

If a chart later needs an additional local mode, keep it secondary to the shared operation lens.

### Milestone 3 — Ship treemap explorer v2

Refactor `src/components/file-hotspot-treemap.tsx` so the selected operation changes both the sizing metric and the intensity encoding. Keep the drilldown interaction and path breadcrumb, but make it a top-of-card control or clearly promoted in-card element rather than a footer artifact.

At completion, the treemap should make four things obvious:
- what metric is driving rectangle area
- what color means in the current lens
- what intensity means
- where the user is in the tree

The tooltip should expose raw counts plus operation mix percentages. Empty states should explain when the selected lens has no data after filtering.

### Milestone 4 — Add metadata enrichment for size and breadth

Extend the backend project file stats aggregation to compute:
- distinct sessions touching each file in the current scope/range
- file size bytes where the file can be statted safely

Do not let metadata collection become a repository scan. Work only from file paths already referenced in session data. Record missing metadata explicitly so the frontend can explain why some files are absent from size-based charts.

### Milestone 5 — Add size-vs-activity scatter

Build a dedicated card that plots file size versus activity under the shared operation lens. This chart should focus on outlier detection, not directory structure. Make sure the chart clearly indicates when only a subset of files could be included due to missing size metadata.

### Milestone 6 — Add imbalance/churn chart

Build a separate chart card for derived operation-composition views such as read-heavy, change-heavy, or churn-oriented rankings. Use the unified file insight data model so this chart stays cheap to compute and does not require additional backend scans.

### Milestone 7 — Add session-breadth chart

Once distinct session counts are available, add a dedicated view showing which files are touched across many sessions. This may also inform a later enhancement to use breadth as dot size in the scatter chart, but the first release should keep breadth understandable as its own card.

### Milestone 8 — Align docs, polish copy, and validate end to end

Update IA/docs to reflect the richer Files tab. Validate that all shared filters update all charts, that the treemap remains performant and legible, and that missing metadata degrades gracefully.

## Concrete steps

1. From repo root, inspect and update the frontend contract and component boundaries.
   - Read `src/pages/usage/files-tab.tsx`, `src/components/file-hotspot-treemap.tsx`, and `src/components/file-hotspot-grid.tsx` before editing.
   - Expected outcome: clear target for shared state extraction and per-chart props.

2. Extend backend analytics models and aggregation.
   - Edit `src-tauri/src/models/analytics.rs` to support richer file-level stats.
   - Edit `src-tauri/src/cache.rs` to aggregate unified file records, distinct session counts, and optional file size metadata.
   - Edit `src/schemas/analytics.ts` to mirror the contract.
   - Expected outcome: frontend can request one typed response that supports all planned charts.

3. Refactor Files tab state.
   - Update `src/pages/usage/files-tab.tsx` so it owns shared operation lens state in addition to excludes.
   - Derive filtered file insights once and pass them down.
   - Expected outcome: treemap, scatter, imbalance, and grid read from the same filtered/lensed dataset.

4. Implement treemap v2.
   - Refactor `src/components/file-hotspot-treemap.tsx` to accept the shared operation lens and file insight data.
   - Replace or work around the built-in breadcrumb placement if it prevents the required path UI.
   - Add clearer helper copy and intensity legend.
   - Expected outcome: changing lens reflows geometry, tooltip shows mix ratios, breadcrumb is clearer.

5. Implement companion charts.
   - Add a new scatter component for size vs activity.
   - Add a new imbalance/churn component.
   - Add a new session-breadth component once breadth data is available.
   - Expected outcome: Files tab answers relative hotspot, composition, and breadth questions separately from the treemap.

6. Validate and document.
   - Run TypeScript/build checks.
   - Manually verify scoped behavior in the app.
   - Update `docs/information-architecture.md` and any other active doc that describes the Files tab.
   - Expected outcome: behavior and docs match.

Recommended commands from repo root:

```bash
bun run tsc --noEmit
bun run build
```

For iterative UI validation, run the app in the usual local dev workflow and verify the scoped Usage → Files tab manually.

## Validation and acceptance

Implementation is acceptable when all of the following are true:

- A scoped project shows a Files tab with a shared `All / Read / Edit / Write` lens.
- Switching the lens changes treemap rectangle sizing to the selected operation basis.
- Treemap color semantics are clearly explained in-card.
- The breadcrumb/path control is visibly tied to drilldown and remains clickable.
- Treemap tooltip shows operation counts and operation mix percentages.
- Exclude-path changes update treemap, scatter, imbalance, breadth, and grid consistently.
- The size-vs-activity chart renders for files with known metadata and explains skipped files when metadata is missing.
- The imbalance/churn chart renders from the same filtered data.
- The session-breadth chart renders once breadth data is present and does not confuse raw count with distinct sessions.
- `bun run tsc --noEmit` passes.
- `bun run build` succeeds.

## Idempotence and recovery

- Backend schema changes should be additive where possible so frontend work can be staged.
- If file size metadata proves noisy because many files no longer exist, keep operation-only charts shippable and mark size-based charts as partial rather than blocking the whole initiative.
- If custom breadcrumb placement in the treemap becomes brittle with Recharts nesting, fall back to owning drilldown state in the component rather than forcing the built-in breadcrumb UI.
- If breadth support lands after treemap/scatter/imbalance, keep the plan alive and deliver that chart as the next milestone instead of overloading the initial PR.

## Artifacts and notes

Planning artifacts created for this initiative:
- `docs/specs/2026-03-27-usage-file-analytics-visualizations.md`
- `docs/exec-plans/completed/2026-03-27-usage-file-analytics-visualizations.md`

Key current implementation references:
- `src/components/file-hotspot-treemap.tsx`
- `src/components/file-hotspot-grid.tsx`
- `src/pages/usage/files-tab.tsx`
- `src-tauri/src/cache.rs`
- `src/schemas/analytics.ts`

## Interfaces and dependencies

Expected interfaces at completion:
- a shared frontend operation-lens type used by Files-tab analytics components
- a file-centric analytics record carrying read/edit/write/total counts and optional enrichment fields
- updated `ProjectFileStats` contract in both Rust and TypeScript
- treemap props that accept the shared lens and file insight dataset rather than three unrelated arrays
- new chart components for scatter, imbalance/churn, and breadth views

Dependencies and rationale:
- **Recharts** remains the charting foundation so the new views fit the existing analytics stack.
- **Usage page scoped state** remains the owner of project and date-range selection.
- **Frontend exclude filtering** remains valid, but must apply consistently to the richer unified data model.
- **Rust backend aggregation** is required for distinct session counts and safe metadata collection because session logs and filesystem access belong in the backend layer.
