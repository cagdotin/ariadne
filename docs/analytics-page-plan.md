# Analytics Page — Plan

## Data Source

**777 sessions** across all projects, stored as `.jsonl` files in `~/.pi/agent/sessions/`.
Each session is an append-only event log with: tool calls, token usage, costs, model info, file operations, timestamps.

File sizes range 1KB–11MB. Top projects by session count:
- `agents` (152 sessions)
- `pi-lot` (112 sessions)
- `feedback-ui` (83 sessions)

---

## What We Can Extract

Every assistant message carries a `usage` object with exact token counts and dollar costs:
```json
{
  "input": 3, "output": 256, "cacheRead": 0, "cacheWrite": 8045,
  "totalTokens": 8304,
  "cost": { "input": 0.000015, "output": 0.0064, "cacheRead": 0, "cacheWrite": 0.05028, "total": 0.0567 }
}
```

Every tool call has name + arguments (file paths, bash commands, etc.).
Every message has a timestamp, model, provider, and stop reason.

---

## Proposed Analytics Sections

### 1. Overview Dashboard
- **Total sessions** / total cost / total tokens (all-time)
- **Activity heatmap** — sessions by day (GitHub contribution graph style)
- **Recent sessions** — last 10-20 with project, duration, cost, model
- **Quick stats cards** — sessions today, cost today, most active project

### 2. Cost Analytics
- **Cost over time** — daily/weekly/monthly line chart
- **Cost by project** — bar chart or treemap
- **Cost by model** — pie/donut chart (opus vs sonnet vs haiku etc.)
- **Cost breakdown** — input vs output vs cache read vs cache write
- **Most expensive sessions** — ranked list

### 3. Session Analytics
- **Session duration distribution** — histogram
- **Sessions over time** — daily activity chart
- **Sessions by project** — stacked bar chart
- **Average turns per session** — trend line
- **Session depth** — tool calls per session distribution

### 4. Tool Usage
- **Tool frequency** — bar chart (read, bash, edit, write, etc.)
- **Tool error rates** — error count per tool
- **Bash programs** — most-used CLI tools (git, find, rg, etc.)
- **File operations** — most read/edited/written files across all sessions

### 5. Model Usage
- **Model distribution** — which models used and how often
- **Model switching** — how often models change within sessions
- **Cost efficiency by model** — tokens per dollar by model
- **Model trends** — usage shifts over time

### 6. Project View
- **Per-project drill-down** — select a project, see its sessions/costs/tools
- **Project comparison** — side-by-side metrics

---

## Architecture

### Data Pipeline
```
~/.pi/agent/sessions/**/*.jsonl
        │
        ▼
  Rust (Tauri backend)           ← Parse .jsonl, extract metrics, aggregate
        │
        ▼
  Tauri Commands (IPC)           ← Expose structured data to frontend
        │
        ▼
  React Frontend                 ← Render charts and tables
```

### Why Rust Backend
- Some sessions are 11MB — parsing in the frontend would be slow
- Rust can stream-parse .jsonl files efficiently
- Can watch the sessions directory for live updates
- Can cache aggregated data for instant re-renders

### Frontend Stack (additions needed)
- **Routing**: React Router (for dashboard / project / session views)
- **Charts**: Recharts or Nivo (React-native charting)
- **Styling**: Tailwind CSS (fast iteration, consistent design)
- **State**: Zustand or React Query (for cached data fetching from Tauri)
- **Date handling**: date-fns (lightweight)

---

## Phased Approach

### Phase 1 — Foundation (get data flowing)
- [ ] Rust: session discovery (scan sessions dir, parse headers)
- [ ] Rust: session parser (extract events, usage, costs per session)
- [ ] Tauri commands: `list_projects`, `list_sessions`, `get_session_summary`
- [ ] React: basic project list → session list → session detail
- [ ] Wire up with real data, no charts yet — just tables/numbers

### Phase 2 — Overview Dashboard
- [ ] Aggregate stats (total cost, sessions, tokens)
- [ ] Activity heatmap
- [ ] Recent sessions list
- [ ] Quick stat cards

### Phase 3 — Cost & Model Analytics
- [ ] Cost over time chart
- [ ] Cost by project/model breakdowns
- [ ] Model usage distribution
- [ ] Most expensive sessions

### Phase 4 — Tool & File Analytics
- [ ] Tool frequency charts
- [ ] File hotspot analysis
- [ ] Bash program extraction
- [ ] Error rate tracking

### Phase 5 — Polish
- [ ] Dark theme (matching tokyo-night)
- [ ] Session search/filter
- [ ] Date range picker
- [ ] Export capabilities
- [ ] Live session watching (file watcher)
