# Analytics Foundation — Spec

Status: Implemented
Date: 2026-03-19
Execution plan: `docs/exec-plans/completed/2026-03-19-analytics-foundation.md`

## 1. Problem Statement

Pi stores 777+ session files as `.jsonl` across 20+ projects in `~/.pi/agent/sessions/`. Each session contains rich data — tool calls, token usage, costs, model info, timestamps — but there's no way to see aggregate patterns across sessions. The session-stats extension only works in-memory for the current session.

Ariadne needs a foundation that reads all this data, parses it in Rust, and exposes structured summaries to a React frontend for an analytics dashboard.

## 2. Goals and Non-Goals

### 2.1 Goals
- Rust backend discovers and parses all pi session `.jsonl` files
- Expose structured data to the frontend via Tauri IPC commands
- React frontend renders a multi-section analytics dashboard with real data
- Zod schemas validate all data crossing the Rust → TypeScript boundary
- Clean separation: Rust owns parsing/aggregation, React owns rendering
- Support 777+ sessions without blocking the UI

### 2.2 Non-Goals
- Real-time / live session watching (future)
- Session replay or message-level drill-down (future)
- Export functionality (future)
- Charting library integration (Phase 2 — this phase uses tables + simple visuals)
- Data caching or persistence beyond Rust in-memory (future)

## 3. System Context

### Data Source
```
~/.pi/agent/sessions/
├── --<encoded-project-path>--/
│   └── YYYY-MM-DDTHH-MM-SS-sssZ_<uuid>.jsonl
```

Path encoding: `/Users/cgn/git/0xcgn/agents` → `--Users-cgn-git-0xcgn-agents--`

### Session .jsonl Event Types (observed)

| Event Type | Frequency | Key Fields |
|---|---|---|
| `session` | 1 per file | `version`, `id`, `timestamp`, `cwd` |
| `model_change` | 0-N | `provider`, `modelId` |
| `thinking_level_change` | 0-N | `thinkingLevel` |
| `session_info` | 0-1 | `name` (session title from first user message) |
| `message` (user) | N | `content[].text`, `timestamp` |
| `message` (assistant) | N | `content[]`, `model`, `provider`, `usage`, `stopReason` |
| `message` (toolResult) | N | `toolCallId`, `toolName`, `isError`, `content` |
| `custom_message` | 0-N | `customType`, `content`, `details` |
| `custom` | 0-N | `customType`, `data` |
| `compaction` | 0-N | `summary`, `tokensBefore`, `firstKeptEntryId` |

### Usage Object (on every assistant message)
```json
{
  "input": 3,
  "output": 256,
  "cacheRead": 0,
  "cacheWrite": 8045,
  "totalTokens": 8304,
  "cost": {
    "input": 0.000015,
    "output": 0.0064,
    "cacheRead": 0,
    "cacheWrite": 0.05028,
    "total": 0.0567
  }
}
```

### Tools Observed
Core: `bash` (7200), `read` (4429), `edit` (2286), `write` (834)
Extensions: `todo` (115), `expertise` (49), `run_experiment` (37), `log_experiment` (19), `subagent_done` (2), `track` (1), `init_experiment` (1)

### Models Observed
`claude-opus-4-6` (4329), `gpt-5.3-codex` (1617), `claude-opus-4-5` (91)

### Projects (top 10 by session count)
`agents` (152), `pi-lot` (112), `feedback-ui` (83), `qraiter` (81), `meister-ai-platform` (55), `pi-duct` (41), `bff-tasks-mindmeister` (36), `compliant` (23), `bip` (22), `ai-platform-components` (20)

## 4. Domain Model

### Rust Types (backend)

```rust
/// Per-session summary — the core unit of data
struct SessionSummary {
    id: String,                    // UUID from session header
    project_path: String,          // decoded cwd from session header
    project_name: String,          // last path segment of cwd
    session_dir: String,           // encoded directory name
    file_name: String,             // .jsonl filename
    file_size_bytes: u64,
    started_at: String,            // ISO timestamp from session header
    ended_at: Option<String>,      // timestamp of last event
    duration_seconds: Option<f64>,
    title: Option<String>,         // from session_info event if present

    // Costs
    total_cost: f64,
    input_cost: f64,
    output_cost: f64,
    cache_read_cost: f64,
    cache_write_cost: f64,

    // Tokens
    total_tokens: u64,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,

    // Activity
    user_message_count: u32,
    assistant_message_count: u32,
    tool_result_count: u32,
    turn_count: u32,              // assistant messages with stop
    compaction_count: u32,

    // Tool breakdown
    tool_calls: HashMap<String, ToolCallSummary>,

    // Models used
    models_used: Vec<ModelUsage>,
}

struct ToolCallSummary {
    name: String,
    calls: u32,
    errors: u32,
}

struct ModelUsage {
    model_id: String,
    provider: String,
    message_count: u32,
}

/// Aggregate across all sessions
struct AnalyticsOverview {
    total_sessions: u32,
    total_projects: u32,
    total_cost: f64,
    total_tokens: u64,
    sessions_by_date: Vec<DayCount>,      // for activity heatmap
    cost_by_date: Vec<DayCost>,           // for cost trend
    projects: Vec<ProjectSummary>,
    models: Vec<ModelAggregate>,
    tools: Vec<ToolAggregate>,
    recent_sessions: Vec<SessionSummary>, // last 20
}

struct ProjectSummary {
    name: String,
    path: String,
    session_count: u32,
    total_cost: f64,
    total_tokens: u64,
    last_active: String,
}

struct DayCount {
    date: String,   // YYYY-MM-DD
    count: u32,
}

struct DayCost {
    date: String,
    cost: f64,
}

struct ModelAggregate {
    model_id: String,
    provider: String,
    message_count: u32,
    total_cost: f64,
}

struct ToolAggregate {
    name: String,
    total_calls: u32,
    total_errors: u32,
}
```

### TypeScript / Zod Schemas (frontend)

Mirror the Rust types exactly. Zod validates at the boundary when data arrives from Tauri `invoke()`.

```typescript
// src/schemas/session.ts
const ToolCallSummarySchema = z.object({
  name: z.string(),
  calls: z.number(),
  errors: z.number(),
});

const ModelUsageSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
});

const SessionSummarySchema = z.object({
  id: z.string(),
  project_path: z.string(),
  project_name: z.string(),
  session_dir: z.string(),
  file_name: z.string(),
  file_size_bytes: z.number(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  title: z.string().nullable(),
  total_cost: z.number(),
  input_cost: z.number(),
  output_cost: z.number(),
  cache_read_cost: z.number(),
  cache_write_cost: z.number(),
  total_tokens: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  user_message_count: z.number(),
  assistant_message_count: z.number(),
  tool_result_count: z.number(),
  turn_count: z.number(),
  compaction_count: z.number(),
  tool_calls: z.record(z.string(), ToolCallSummarySchema),
  models_used: z.array(ModelUsageSchema),
});

// Similar for AnalyticsOverview, ProjectSummary, etc.
```

## 5. Detailed Design

### 5.1 Rust Backend (`src-tauri/src/`)

**Module structure:**
```
src-tauri/src/
├── main.rs                 # Entry point (unchanged)
├── lib.rs                  # Tauri setup + command registration
├── commands/
│   ├── mod.rs
│   └── analytics.rs        # Tauri command handlers
├── parser/
│   ├── mod.rs
│   ├── session.rs          # .jsonl line-by-line parser
│   └── discovery.rs        # Find all session files
└── models/
    ├── mod.rs
    ├── session.rs           # SessionSummary, ToolCallSummary, ModelUsage
    └── analytics.rs         # AnalyticsOverview, ProjectSummary, aggregates
```

**Tauri Commands:**
```rust
#[tauri::command]
async fn get_analytics_overview() -> Result<AnalyticsOverview, String>

#[tauri::command]
async fn get_project_sessions(project_name: String) -> Result<Vec<SessionSummary>, String>

#[tauri::command]
async fn get_session_detail(session_id: String) -> Result<SessionSummary, String>
```

**Parsing approach:**
- `discovery.rs`: Walk `~/.pi/agent/sessions/`, collect all `.jsonl` paths with metadata
- `session.rs`: Stream-parse each file line by line using `serde_json::from_str` for each line
- Only extract fields we need — skip `content` text bodies (they're large and not needed for analytics)
- Build `SessionSummary` incrementally as lines are processed

**Performance considerations:**
- Parse all sessions on first `get_analytics_overview` call
- Keep results in a `Mutex<Option<AnalyticsOverview>>` for subsequent calls
- Total data: ~777 files, ~50MB total — Rust parses this in seconds
- Future: file watcher for incremental updates

### 5.2 React Frontend (`src/`)

**Directory structure:**
```
src/
├── main.tsx                    # Entry point
├── app.tsx                     # Root layout + routing
├── schemas/
│   ├── session.ts              # Zod schemas for SessionSummary
│   └── analytics.ts            # Zod schemas for AnalyticsOverview
├── api/
│   └── analytics.ts            # Tauri invoke wrappers + Zod validation
├── pages/
│   ├── dashboard.tsx           # Overview dashboard
│   ├── projects.tsx            # Project list view
│   └── project-detail.tsx      # Single project drill-down
├── components/
│   ├── stat-card.tsx           # Metric display card
│   ├── session-table.tsx       # Session list table
│   ├── activity-heatmap.tsx    # GitHub-style contribution graph
│   ├── cost-breakdown.tsx      # Cost by category
│   ├── tool-usage-bar.tsx      # Horizontal bar chart (CSS)
│   └── model-distribution.tsx  # Model usage display
└── lib/
    ├── format.ts               # Number/currency/date formatting
    └── colors.ts               # Tokyo Night color tokens
```

**Data flow:**
```
User navigates to page
  → page calls api/analytics.ts function
    → api function calls tauri invoke()
      → Rust command runs, returns JSON
    → api function validates with Zod schema
    → api function returns typed data
  → page renders with validated data
```

**No charting library in Phase 1.** Use:
- CSS-based horizontal bars for tool usage
- CSS grid for activity heatmap
- Styled tables for session lists
- Stat cards for aggregates

### 5.3 API Layer (the boundary)

```typescript
// src/api/analytics.ts
import { invoke } from "@tauri-apps/api/core";
import { AnalyticsOverviewSchema } from "../schemas/analytics";

export async function get_analytics_overview() {
  const raw = await invoke("get_analytics_overview");
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_project_sessions(project_name: string) {
  const raw = await invoke("get_project_sessions", { projectName: project_name });
  return z.array(SessionSummarySchema).parse(raw);
}
```

Every Tauri invoke goes through Zod. If the schema changes on the Rust side without updating TS, it fails loudly.

## 6. Error Handling

### Rust
- File not found / permission denied → skip file, log warning, continue
- Malformed JSON line → skip line, increment error counter, continue
- Missing fields on events → use `Option<T>` / defaults, never crash on a single session
- Return `Result<T, String>` from all commands

### Frontend
- Zod parse failure → show error state with details, don't crash
- Empty data → show empty state ("No sessions found")
- Loading → show skeleton/loading state

## 7. Testing Strategy

### 7.1 Rust
- Unit test `session.rs` parser with fixture `.jsonl` snippets
- Unit test `discovery.rs` with temp directory containing test files
- Integration test: parse a real session file, verify counts

### 7.2 Frontend
- Schema tests: feed malformed data to Zod schemas, verify rejection
- Component tests: render with mock data, verify output

## 8. Implementation Checklist

### Backend (Rust)
- [ ] Create module structure (`commands/`, `parser/`, `models/`)
- [ ] Define Rust types with `Serialize` in `models/`
- [ ] Implement `discovery.rs` — find all session files
- [ ] Implement `session.rs` — parse single session to `SessionSummary`
- [ ] Implement `analytics.rs` commands — aggregate and expose via Tauri
- [ ] Register commands in `lib.rs`
- [ ] Add `dirs` crate for `home_dir()` resolution
- [ ] Add Rust tests for parser

### Frontend (React/TypeScript)
- [ ] Add dependencies: `zod`, `react-router-dom`
- [ ] Create Zod schemas in `src/schemas/`
- [ ] Create API layer in `src/api/`
- [ ] Create formatting utilities in `src/lib/`
- [ ] Create stat-card component
- [ ] Create session-table component
- [ ] Create activity-heatmap component (CSS grid)
- [ ] Create tool-usage-bar component (CSS)
- [ ] Create model-distribution component
- [ ] Create cost-breakdown component
- [ ] Create dashboard page (assembles all components)
- [ ] Create projects page
- [ ] Create project-detail page
- [ ] Set up routing in app.tsx
- [ ] Replace boilerplate — clean slate
- [ ] Style with Tokyo Night colors

## 9. Open Questions

None — all data structures are validated against real session files. The schema is based on 777 observed sessions across 20+ projects.
