# Analytics Foundation — Execution Plan

Status: Active
Owner: agent
Created: 2026-03-19
Spec: `docs/specs/2026-03-19-analytics-foundation.md`

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current as work proceeds.

## Purpose / Big picture

After this plan is complete, launching Ariadne shows an analytics dashboard with real data from all 777+ pi sessions — total cost, session counts, activity over time, tool usage, and model distribution, all parsed by Rust and rendered by React with Zod-validated boundaries.

## Progress

- [ ] (2026-03-19) M1: Rust module structure + models
- [ ] (2026-03-19) M2: Session discovery + parser
- [ ] (2026-03-19) M3: Tauri commands (wire backend to frontend)
- [ ] (2026-03-19) M4: Frontend schemas + API layer
- [ ] (2026-03-19) M5: Dashboard page with components
- [ ] (2026-03-19) M6: Projects page + project detail
- [ ] (2026-03-19) M7: Styling + polish

## Surprises & Discoveries

_(none yet)_

## Decision Log

- Decision: Rust parses all sessions, frontend only renders
  Rationale: Sessions can be 11MB each, 777+ files total ~50MB. Rust handles this in seconds; JS would struggle.
  Date: 2026-03-19

- Decision: No charting library in Phase 1
  Rationale: CSS-based bars and grids are sufficient for initial analytics. Avoids dependency churn before we know what visualizations matter.
  Date: 2026-03-19

- Decision: Zod validates all data at the Tauri IPC boundary
  Rationale: User requirement. Catches Rust↔TS schema drift at runtime with clear error messages.
  Date: 2026-03-19

- Decision: snake_case for all Rust→TS field names
  Rationale: Matches project coding style (snake_case for variables). Serde serializes Rust snake_case by default. Zod schemas mirror 1:1.
  Date: 2026-03-19

## Outcomes & Retrospective

_(pending)_

## Context and Orientation

### Repository layout
```
ariadne/
├── src/                  # React frontend (currently boilerplate — will be replaced)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # Entry point
│   │   └── lib.rs        # Tauri builder + command registration
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # App config (800x600, port 1420)
├── package.json          # React deps + bun scripts
├── vite.config.ts        # Vite + React plugin
└── docs/                 # Specs, plans, reference docs
```

### Data source
Pi sessions: `~/.pi/agent/sessions/<encoded-path>/*.jsonl`
- 777+ files across 20+ project directories
- Each file: append-only JSONL with events (session, model_change, thinking_level_change, session_info, message, custom_message, custom, compaction)
- Assistant messages carry `usage` with token counts + cost breakdown

### Key dependencies to add
**Rust:** `dirs` (home directory), `tokio` (already via Tauri), `walkdir` (directory traversal)
**Frontend:** `zod`, `react-router-dom`

---

## Plan of Work

### Milestone 1: Rust Module Structure + Models

Create the Rust module layout and define all data types.

**Files to create:**
- `src-tauri/src/models/mod.rs`
- `src-tauri/src/models/session.rs` — `SessionSummary`, `ToolCallSummary`, `ModelUsage`
- `src-tauri/src/models/analytics.rs` — `AnalyticsOverview`, `ProjectSummary`, `DayCount`, `DayCost`, `ModelAggregate`, `ToolAggregate`
- `src-tauri/src/parser/mod.rs`
- `src-tauri/src/commands/mod.rs`

**Files to modify:**
- `src-tauri/Cargo.toml` — add `dirs`, `walkdir`
- `src-tauri/src/lib.rs` — add `mod models; mod parser; mod commands;`

**Validation:** `cargo check` in `src-tauri/` passes.

### Milestone 2: Session Discovery + Parser

Implement the core logic: find sessions, parse them into summaries.

**Files to create:**
- `src-tauri/src/parser/discovery.rs` — `discover_sessions()` returns list of session file paths with metadata
- `src-tauri/src/parser/session.rs` — `parse_session(path) -> SessionSummary`

**Discovery logic:**
1. Resolve `~/.pi/agent/sessions/`
2. Walk each subdirectory (each is a project)
3. Collect all `.jsonl` files with file size
4. Decode project path from directory name (replace `--` with `/`, strip leading/trailing)

**Parser logic (per file):**
1. Open file, read line by line
2. For each line, `serde_json::from_str::<serde_json::Value>(line)`
3. Match on `type` field:
   - `"session"` → extract `id`, `timestamp`, `cwd`
   - `"session_info"` → extract `name` as title
   - `"model_change"` → record model/provider
   - `"message"` with `role == "assistant"` → sum `usage` tokens/costs, track model, count turns
   - `"message"` with `role == "user"` → count user messages
   - `"message"` with `role == "toolResult"` → count tool calls by name, track errors
   - `"compaction"` → increment compaction count
4. Compute `ended_at` from last event timestamp
5. Compute `duration_seconds` from `started_at` to `ended_at`

**Validation:** Write a `#[test]` that creates a temp file with 10 JSONL lines and verifies the parsed `SessionSummary` fields.

### Milestone 3: Tauri Commands

Wire the parser to Tauri IPC commands.

**Files to create:**
- `src-tauri/src/commands/analytics.rs` — three command handlers

**Commands:**

```rust
#[tauri::command]
async fn get_analytics_overview() -> Result<AnalyticsOverview, String>
```
- Calls `discover_sessions()` → `parse_session()` for each
- Aggregates into `AnalyticsOverview`
- Groups sessions by date for heatmap data
- Groups by project for `ProjectSummary`
- Aggregates tool calls and model usage

```rust
#[tauri::command]
async fn get_project_sessions(project_name: String) -> Result<Vec<SessionSummary>, String>
```
- Filter sessions by project name, return list

```rust
#[tauri::command]
async fn get_session_detail(session_id: String) -> Result<SessionSummary, String>
```
- Find + return single session summary

**Files to modify:**
- `src-tauri/src/commands/mod.rs` — export commands
- `src-tauri/src/lib.rs` — register all three commands in `invoke_handler`

**Validation:** `cargo build` succeeds. Launch app, open devtools console, run `window.__TAURI__.core.invoke("get_analytics_overview")` — returns JSON.

### Milestone 4: Frontend Schemas + API Layer

Set up the TypeScript data layer with Zod validation.

**Install dependencies:**
```bash
cd /Users/cgn/git/dev/0xcgn/ariadne/ariadne
bun add zod react-router-dom
bun add -d @types/react-router-dom
```

**Files to create:**
- `src/schemas/session.ts` — Zod schemas for `SessionSummary`, `ToolCallSummary`, `ModelUsage`
- `src/schemas/analytics.ts` — Zod schemas for `AnalyticsOverview`, `ProjectSummary`, `DayCount`, `DayCost`, `ModelAggregate`, `ToolAggregate`
- `src/api/analytics.ts` — `get_analytics_overview()`, `get_project_sessions()`, `get_session_detail()` — each calls `invoke()` + validates with Zod
- `src/lib/format.ts` — `format_cost()`, `format_tokens()`, `format_duration()`, `format_date()`
- `src/lib/colors.ts` — Tokyo Night color tokens as CSS custom properties

**Validation:** Import schemas in a test file, feed sample data, verify parse succeeds. Feed bad data, verify it throws.

### Milestone 5: Dashboard Page

Build the main overview dashboard with components.

**Files to create:**
- `src/components/stat-card.tsx` — displays label + value + optional trend
- `src/components/session-table.tsx` — sortable table of sessions
- `src/components/activity-heatmap.tsx` — CSS grid, 52 weeks × 7 days, color intensity by session count
- `src/components/tool-usage-bar.tsx` — horizontal bars with CSS widths
- `src/components/model-distribution.tsx` — stacked bar or simple bars per model
- `src/components/cost-breakdown.tsx` — input/output/cache breakdown display
- `src/pages/dashboard.tsx` — assembles everything

**Dashboard layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Ariadne                                        [nav]    │
├──────────┬──────────┬──────────┬───────────────────────┤
│ Sessions │ Cost     │ Tokens   │ Projects              │
│ 777      │ $142.38  │ 2.1M     │ 20                    │
├──────────┴──────────┴──────────┴───────────────────────┤
│ Activity Heatmap (52 weeks)                             │
│ ░░▒▒▓▓██░░▒▒▓▓██░░▒▒▓▓██░░▒▒▓▓██░░▒▒▓▓██░░▒▒▓▓██    │
├─────────────────────────────────────────────────────────┤
│ Tool Usage               │ Model Distribution           │
│ bash ████████████ 7200   │ opus-4-6  ████████████ 4329  │
│ read ██████████   4429   │ codex-5.3 ████████    1617   │
│ edit █████        2286   │ opus-4-5  █           91     │
│ write ██          834    │                               │
├──────────────────────────┴──────────────────────────────┤
│ Recent Sessions                                          │
│ Project     │ Title          │ Duration │ Cost   │ Model │
│ agents      │ pick up qmd... │ 1h 23m   │ $2.34  │ opus  │
│ feedback-ui │ fix login...   │ 45m      │ $1.12  │ opus  │
└─────────────────────────────────────────────────────────┘
```

**Files to modify:**
- `src/app.tsx` — replace boilerplate with router + layout
- `src/main.tsx` — wrap with RouterProvider
- `index.html` — update title to "Ariadne"

**Delete:**
- `src/App.css` (replace with new styles)
- `src/assets/react.svg`

**Validation:** Launch with `bun run tauri dev`, see dashboard with real data from pi sessions.

### Milestone 6: Projects Page + Project Detail

**Files to create:**
- `src/pages/projects.tsx` — table of all projects with session count, total cost, last active
- `src/pages/project-detail.tsx` — selected project's sessions, cost, tools

**Validation:** Click a project → see its sessions. Navigate back → project list intact.

### Milestone 7: Styling + Polish

- Apply Tokyo Night color palette globally
- Responsive layout (dashboard stacks on narrow window)
- Loading states (skeleton)
- Error states (Zod validation failure, no data)
- Window size: increase from 800×600 to 1200×800

**Files to modify:**
- `src-tauri/tauri.conf.json` — window size
- All component files — final styling pass

**Validation:** App looks polished, handles edge cases (no sessions, parse errors), responsive at different window sizes.

---

## Concrete Steps

### M1 commands
```bash
cd src-tauri
# Add deps
# In Cargo.toml, add: dirs = "6", walkdir = "2"
cargo check
```

### M3 validation
```bash
cd /Users/cgn/git/dev/0xcgn/ariadne/ariadne
bun run tauri dev
# In browser devtools console:
# await window.__TAURI__.core.invoke("get_analytics_overview")
```

### M4 commands
```bash
bun add zod react-router-dom
```

### Full validation
```bash
bun run tauri dev
# Dashboard renders with real data
# Navigate to Projects → click project → see sessions
# All numbers match reality (cross-check a few sessions manually)
```

## Validation and Acceptance

1. Dashboard shows total sessions ≈ 777+
2. Total cost is a plausible dollar amount
3. Activity heatmap shows colored squares for days with sessions
4. Tool bars show bash > read > edit > write (matching observed data)
5. Model distribution shows opus-4-6 dominant
6. Recent sessions table shows real project names and titles
7. Project list shows 20+ projects with correct session counts
8. Project detail shows filtered sessions for that project
9. No Zod validation errors in console
10. Rust parses all 777 sessions without crashing (gracefully skips malformed)

## Idempotence and Recovery

- Rust parser skips malformed lines/files — safe to re-run
- Frontend Zod validation fails loudly but doesn't crash — shows error state
- All milestones are additive — can restart from any milestone
- Git: no auto-commits in this plan; user approves all commits

## Artifacts and Notes

_(populated during implementation)_

## Interfaces and Dependencies

### Rust crates to add
| Crate | Version | Why |
|---|---|---|
| `dirs` | 6 | Resolve `~/.pi/` cross-platform |
| `walkdir` | 2 | Recursive directory traversal |

### Frontend packages to add
| Package | Why |
|---|---|
| `zod` | Schema validation at IPC boundary |
| `react-router-dom` | Client-side routing |

### Tauri IPC contract
| Command | Input | Output |
|---|---|---|
| `get_analytics_overview` | none | `AnalyticsOverview` |
| `get_project_sessions` | `{ project_name: string }` | `SessionSummary[]` |
| `get_session_detail` | `{ session_id: string }` | `SessionSummary` |
