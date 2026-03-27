# Usage File Analytics Visualizations

Status: Draft
Date: 2026-03-27
Execution plan: `docs/exec-plans/active/2026-03-27-usage-file-analytics-visualizations.md`

## 1. Problem statement

The current Files tab exposes useful file-operation data, but the primary visualization is underpowered and easy to misread. `src/components/file-hotspot-treemap.tsx` always sizes rectangles by total operations, uses color only to indicate the dominant operation type, and places the drilldown breadcrumb in the chart footer. This makes it hard to answer more specific questions such as:
- which files dominate reads versus edits versus writes?
- which files are unusually active relative to their size?
- which files are read-heavy versus change-heavy?
- which files are touched repeatedly across many sessions versus hammered inside one session?

The user wants the treemap to become a more expressive explorer rather than a single static chart. The agreed direction is:
- add an operation lens with `All / Read / Edit / Write`
- let treemap rectangle area change with the selected operation
- add GitHub-style intensity encoding
- keep drilldown navigation non-negotiable, but make it clearer
- add operation mix ratios
- add companion charts for relative hotspot analysis, imbalance/churn, and session breadth
- do not prioritize recency overlays because the page already has date-range controls

## 2. Goals and non-goals

### 2.1 Goals
- Upgrade the treemap so it answers different file-operation questions under `All / Read / Edit / Write`.
- Make treemap semantics explicit: area, color hue, color intensity, and breadcrumb path should all be clearly explained in the UI.
- Preserve directory drilldown behavior and make the current path more obvious.
- Add operation mix ratio to the treemap tooltip and, where space allows, to large cells.
- Add a separate size-versus-activity chart for spotting disproportionately hot files.
- Add a separate imbalance/churn chart for comparing read-heavy versus change-heavy files.
- Add a separate session-breadth view once distinct-session-per-file data is available.
- Keep existing exclude-path filtering and date-range filtering as the shared scope for all new file analytics views.
- Introduce backend/frontend data structures that support richer file analytics without duplicating file aggregation logic across multiple components.

### 2.2 Non-goals
- Replacing the Files tab with a completely new information architecture outside the scoped file analytics area.
- Adding a recency-specific encoding on top of the existing date-range filter in this phase.
- Computing full semantic file complexity metrics such as AST complexity or code ownership.
- Scanning the full repository for metadata unrelated to files that actually appear in session history.
- Turning the treemap into a catch-all chart for every file metric; companion views should carry the extra analysis.

## 3. System context

### 3.1 Current Files tab implementation
The current scoped Files tab is rendered by `src/pages/usage/files-tab.tsx`. It owns:
- summary cards
- exclude-path input and hidden-count badge
- `FileHotspotTreemap`
- `FileHotspotGrid`

The page already receives `range_days`-filtered file analytics from `get_project_file_stats(project_path, range_days)`, so all new visualizations should honor the existing page-level time range automatically.

### 3.2 Current treemap behavior
`src/components/file-hotspot-treemap.tsx` currently:
- merges the read/edit/write arrays into a deep tree on the frontend
- uses `dataKey="total"`, so area always represents total operations
- uses hue only to show whichever of read/edit/write dominates a node
- uses Recharts nested treemap breadcrumbs rendered below the chart area
- shows counts in the tooltip, but not percentages or clearer explanation of visual encoding

The current chart is effective for “where is total file activity concentrated?” but weak for “what dominates reads?” or “what dominates writes?”.

### 3.3 Current backend data limits
`src-tauri/src/cache.rs#get_project_file_stats` currently returns:
- `read_files`, `edit_files`, `write_files` as separate `NameCount[]`
- `directory_stats`
- `tool_distribution`
- `activity_by_date`
- `total_sessions`

It does not currently return per-file unified records, file sizes, or distinct session counts per file. The session parser in `src-tauri/src/parser/session.rs` increments per-file read/edit/write counts per tool call, but the aggregation layer collapses them into separate maps rather than a richer file-centric record.

### 3.4 Path realities and metadata gaps
Project-scoped sessions still contain paths outside the project root, including user-home paths and temporary files. The current treemap already displays such paths when they cannot be normalized to project-relative form. Any size-based or breadth-based chart must therefore handle files that:
- are outside the project root
- no longer exist on disk
- cannot be statted
- should remain visible in operation charts but may not be eligible for metadata-based views

### 3.5 Information architecture implications
`docs/information-architecture.md` documents the Files tab as the home for project-scoped file analytics. These richer views fit that model, but the document will need an update because the current Files tab has evolved beyond its original minimal description and this initiative expands it further.

## 4. Conventions and style
- Reuse the existing Usage page card layout and shared control language so the Files tab still feels like part of Ariadne, not a standalone microsite.
- Prefer one shared operation lens for file analytics views in the Files tab unless a chart needs an additional local mode. The user should not have to re-learn `All / Read / Edit / Write` separately for each card.
- Keep the treemap breadcrumb/drilldown interaction. It is a required navigation affordance, not optional chrome.
- Move explanatory UI toward the top of the chart card so the visual semantics are visible before the user interprets the chart.
- Use intensity scales that preserve low-volume signal in the presence of highly skewed counts; quantized or non-linear scaling is preferred over naive linear opacity.
- Keep `FileHotspotGrid` as the exact/lookup-friendly companion to the richer charts.
- Continue using existing primitives and Recharts where practical instead of introducing another charting library for this work.

## 5. Domain model

### 5.1 Shared operation lens
The Files tab should introduce a shared operation lens with four modes:
- `all`
- `read`
- `edit`
- `write`

This lens determines which operation is currently being emphasized across visualizations.

### 5.2 Unified file insight record
The file analytics stack should work from a unified per-file record rather than repeatedly re-merging three separate `NameCount[]` lists in every component.

The record should represent, at minimum:
- path / display path
- read_count
- edit_count
- write_count
- total_count

The richer form should also support:
- distinct_session_count
- file_size_bytes when resolvable
- metadata-availability flags or nullable fields for files that cannot be statted

Whether the frontend derives this record from the existing arrays or the backend returns it directly is an implementation decision, but the long-term model should be file-centric.

### 5.3 View tiers
The initiative naturally breaks into three capability tiers:

1. **Operation-only views** — use only read/edit/write counts.
   - treemap v2
   - existing grid/table
   - imbalance/churn chart
2. **Metadata-enriched views** — require file size data.
   - size vs activity scatter
3. **Breadth-enriched views** — require distinct session counts per file.
   - session breadth chart
   - optional scatter dot-size encoding later

## 6. Detailed design

### 6.1 Files tab layout
The Files tab should evolve into a small analytics surface with shared controls and multiple complementary views. The expected order is:
1. summary cards
2. exclude-path filter
3. shared operation lens controls and helper copy
4. treemap explorer
5. companion charts
6. exact file activity grid/table

This preserves the current page flow while making the treemap the top exploratory view and the grid the precise reference view.

### 6.2 Treemap explorer
The treemap should become the main exploratory chart.

#### Visual encoding
- In `All` mode:
  - area = total operations
  - hue = dominant operation type
  - intensity = total operation level within the current visible view
- In `Read`, `Edit`, or `Write` mode:
  - area = selected operation count
  - hue = fixed hue for the selected operation
  - intensity = selected operation level within the current visible view

This preserves the user’s desired treemap behavior: changing the operation lens should change the geometry because the question itself changed.

#### Drilldown / breadcrumb
The drilldown path must remain. The breadcrumb should move to the upper part of the card, presented as the current path or scope, while retaining clickability for navigation back up the hierarchy.

The existing built-in Recharts breadcrumb placement is not ideal for this. The implementation may continue to use Recharts nesting internally, but the product requirement is that breadcrumb navigation be treated as a first-class chart control rather than a footer artifact.

#### Intensity scale
Intensity should communicate strength without flattening the long tail. The scale should therefore be bucketed or non-linear. The exact formula is implementation-level, but the visible behavior should feel closer to a GitHub contribution heatmap than a simple alpha ramp.

Intensity should be computed relative to the currently visible treemap level, not only against the project-wide maximum. This keeps drilldown views readable and avoids one giant top-level directory washing out all detail.

#### Tooltip content
The tooltip should show:
- display path / node name
- read, edit, and write counts
- total operations
- percentage mix across read/edit/write
- file count for directories
- the active metric highlighted when a specific lens is selected

#### Large-cell affordances
For sufficiently large rectangles, the cell may show a compact secondary line or mini mix indicator, but only when legibility is preserved. The chart should not become label-noisy.

#### Empty states
If the selected lens leaves no data after excludes are applied, the card should say so explicitly instead of rendering an empty treemap.

### 6.3 Shared explanatory language
The chart area should no longer rely on a descriptive paragraph alone. It should present explicit, low-ambiguity guidance such as:
- `Area = selected operation count`
- `Color = operation type / intensity`
- `Path = current drilldown location`
- `Click directories to explore deeper`

An intensity legend should also be present so the user knows that darker cells mean more of the selected operation.

### 6.4 Size vs activity scatter
This chart answers a different question than the treemap: which files are unusually active for their size?

#### Purpose
Surface small-but-hot files, large files with little activity, and outliers that deserve investigation.

#### Encoding
For the initial version:
- x-axis = file size in bytes, likely on a non-linear scale
- y-axis = selected operation count or total count under the shared operation lens
- color = operation type or selected lens hue
- tooltip = full operation counts, size, and path

This chart should sit in its own card rather than overloading the treemap.

#### Data eligibility
Only files with known size metadata should participate. The UI should clearly state when some files are excluded because current size data is unavailable.

### 6.5 Imbalance / churn chart
This chart should answer composition questions that the treemap alone does not.

#### Purpose
Highlight files that are:
- read-heavy
- change-heavy (`edit + write`)
- high-churn even if not huge in absolute volume

#### Presentation
A dedicated chart card should rank or compare files by derived ratios/scores. The exact chart form can be decided during implementation, but it should optimize for “which files look unusual?” rather than “where are the biggest raw counts?”.

The chart should be based on the existing operation counts and therefore should not require backend metadata enrichment beyond a unified file record.

### 6.6 Session breadth chart
The user expressed interest in differentiating files touched across many sessions from files hammered inside one session. That is analytically useful, but it needs additional data.

#### Purpose
Answer: “Is this file broadly important across sessions, or only noisy inside a small number of sessions?”

#### Data requirement
The backend must compute distinct session counts per file for the selected project and date range.

#### Presentation
This can ship as a dedicated chart card and may later also feed dot size in the size-vs-activity scatter. It should remain separate from the treemap’s core encoding in the first release.

### 6.7 Backend enrichment
The current `ProjectFileStats` response is not rich enough for all desired views. The backend should be extended to support a file-centric aggregation model.

The essential enrichments are:
- unified per-file records with read/edit/write/total counts
- distinct session counts per file
- file size metadata where available

Metadata collection should be conservative and read-only. It should derive from files referenced in session history rather than a fresh full-project scan. Missing metadata must be represented explicitly so the UI can explain exclusions instead of failing silently.

### 6.8 Shared filtering and synchronization
All file analytics views should continue to share:
- global project scope
- global date range
- exclude-path filter
- shared operation lens

This keeps the Files tab coherent: when the user changes scope, range, exclude filters, or operation lens, every card should update consistently.

### 6.9 Documentation alignment
Implementation should update the information architecture and any active analytics docs to describe the expanded Files tab as:
- an exploratory treemap
- companion analysis charts
- a precise file activity grid/table

## 7. Error handling and failure modes
- **No files after filtering:** show a clear empty state instead of empty chart chrome.
- **No values for selected operation lens:** explain that no files were read/edited/written in the current scope and range.
- **Metadata missing for some files:** keep operation-only charts working and explicitly label metadata-based chart exclusions.
- **Deleted or temporary files:** treat missing filesystem metadata as expected, not exceptional.
- **Path normalization edge cases:** preserve stable display and drilldown even when paths fall outside the project root.
- **Skewed distributions:** use bucketed or non-linear intensity/axis scaling to avoid charts that visually collapse into one outlier.

## 8. Security and safety considerations
- File metadata collection should be read-only and limited to files already referenced by session history.
- The UI should not assume every referenced path is safe or still exists.
- Any filesystem metadata lookup must avoid shelling out; it should use typed backend filesystem APIs.
- Metadata failures should degrade to partial chart unavailability, not broader Usage page failure.

## 9. Testing strategy

### 9.1 Unit tests
- Path normalization and file-record aggregation helpers.
- Operation-lens metric selection helpers.
- Intensity bucketing / scaling helpers.
- Tooltip and legend text for the treemap’s explicit semantics.
- Derived score helpers for imbalance/churn views.
- Backend aggregation tests for distinct session counts and nullable file size metadata.

### 9.2 Integration tests
- Manual verification that `All / Read / Edit / Write` changes both treemap area and intensity as expected.
- Manual verification that breadcrumb drilldown still works after moving it into the upper card area.
- Manual verification that excludes and date range update all file-analytics cards together.
- Manual verification that metadata-based charts explain skipped files when size data is unavailable.
- Manual verification that a project with no writes (or no edits, etc.) shows an understandable empty state in that lens.
- Manual verification that out-of-project or deleted-file paths do not crash the Files tab.

## 10. Implementation checklist
- [ ] Define the shared file analytics product scope and chart ordering in the Files tab.
- [ ] Introduce a shared operation lens for file analytics views.
- [ ] Upgrade the treemap to support lens-driven area, intensity, clearer legend text, and richer tooltip mix ratios.
- [ ] Promote breadcrumb/path navigation into a clearer upper-card control.
- [ ] Add or derive unified per-file records for analytics components.
- [ ] Extend backend/frontend data contracts for distinct session counts.
- [ ] Extend backend/frontend data contracts for optional file size metadata.
- [ ] Add the size-vs-activity scatter chart.
- [ ] Add the imbalance/churn chart.
- [ ] Add the session breadth chart once breadth data is available.
- [ ] Preserve existing grid/table lookup workflow.
- [ ] Update docs for the expanded Files tab.

## 11. Open questions
- Whether size metadata should ship as bytes only in the first pass, with LOC deferred until later.
- How aggressively to surface files without size metadata in the scatter card: omitted entirely, listed in helper text, or shown in a separate “unknown size” bucket.
- Whether the session breadth chart ships in the same implementation pass as backend breadth enrichment, or lands immediately after treemap + scatter + imbalance.
- Whether the treemap should eventually support an optional secondary label treatment for large cells, or keep composition details tooltip-only in the first release.
