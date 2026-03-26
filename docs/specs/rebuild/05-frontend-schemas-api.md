# Ariadne — Rebuild Spec 05: Frontend Schemas & API Layer

> Zod schemas and Tauri IPC wrappers. These MUST mirror the Rust models exactly.

## Design Pattern

Every Tauri IPC call follows this pattern:

1. `src/api/*.ts` calls `invoke("command_name", { camelCaseParams })`
2. Tauri auto-converts camelCase JS params to snake_case Rust params
3. Rust returns `Result<T, String>` where T is a Serialize struct
4. Frontend validates the response with a Zod schema
5. Returns fully typed data

This catches Rust↔TypeScript type drift at runtime instead of silently getting `undefined`.

---

## Schemas (`src/schemas/`)

### `schemas/session.ts`

```typescript
import { z } from "zod";

export const ToolCallSummarySchema = z.object({
  name: z.string(),
  calls: z.number(),
  errors: z.number(),
});
export type ToolCallSummary = z.infer<typeof ToolCallSummarySchema>;

export const ModelUsageSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
});
export type ModelUsage = z.infer<typeof ModelUsageSchema>;

export const SessionSummarySchema = z.object({
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
  bash_commands: z.record(z.string(), z.number()),
  read_files: z.record(z.string(), z.number()),
  edit_files: z.record(z.string(), z.number()),
  write_files: z.record(z.string(), z.number()),
  models_used: z.array(ModelUsageSchema),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
```

### `schemas/analytics.ts`

```typescript
import { z } from "zod";
import { SessionSummarySchema } from "./session";

export const DayCountSchema = z.object({
  date: z.string(),
  count: z.number(),
});

export const DayCostSchema = z.object({
  date: z.string(),
  cost: z.number(),
});

export const ProjectSummarySchema = z.object({
  name: z.string(),
  path: z.string(),
  session_count: z.number(),
  total_cost: z.number(),
  total_tokens: z.number(),
  last_active: z.string(),
});

export const ModelAggregateSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  message_count: z.number(),
  total_cost: z.number(),
});

export const ToolAggregateSchema = z.object({
  name: z.string(),
  total_calls: z.number(),
  total_errors: z.number(),
});

export const NameCountSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export const AnalyticsOverviewSchema = z.object({
  total_sessions: z.number(),
  total_projects: z.number(),
  total_cost: z.number(),
  input_cost: z.number(),
  output_cost: z.number(),
  cache_read_cost: z.number(),
  cache_write_cost: z.number(),
  total_tokens: z.number(),
  total_file_size_bytes: z.number(),
  sessions_by_date: z.array(DayCountSchema),
  cost_by_date: z.array(DayCostSchema),
  projects: z.array(ProjectSummarySchema),
  models: z.array(ModelAggregateSchema),
  tools: z.array(ToolAggregateSchema),
  top_bash_commands: z.array(NameCountSchema),
  top_read_files: z.array(NameCountSchema),
  top_edit_files: z.array(NameCountSchema),
  top_write_files: z.array(NameCountSchema),
  recent_sessions: z.array(SessionSummarySchema),
});

export const DirectoryStatSchema = z.object({
  path: z.string(),
  read_count: z.number(),
  edit_count: z.number(),
  write_count: z.number(),
  total: z.number(),
});

export const ProjectFileStatsSchema = z.object({
  project_name: z.string(),
  total_sessions: z.number(),
  tool_distribution: z.array(NameCountSchema),
  read_files: z.array(NameCountSchema),
  edit_files: z.array(NameCountSchema),
  write_files: z.array(NameCountSchema),
  bash_commands: z.array(NameCountSchema),
  directory_stats: z.array(DirectoryStatSchema),
  activity_by_date: z.array(DayCountSchema),
});

export const ProjectToolSummarySchema = z.object({
  project_name: z.string(),
  total_calls: z.number(),
  items: z.array(NameCountSchema),
});

export const WeekdayStatSchema = z.object({
  day: z.string(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});

export const TimeOfDayStatSchema = z.object({
  label: z.string(),
  hour_start: z.number(),
  hour_end: z.number(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});

export const TimeBreakdownSchema = z.object({
  range_days: z.number(),
  total_sessions: z.number(),
  total_cost: z.number(),
  avg_cost_per_session: z.number(),
  total_tokens: z.number(),
  by_weekday: z.array(WeekdayStatSchema),
  by_time_of_day: z.array(TimeOfDayStatSchema),
  daily_sessions: z.array(DayCountSchema),
  daily_cost: z.array(DayCostSchema),
});

export const ToolDetailResponseSchema = z.object({
  tool_name: z.string(),
  total_calls: z.number(),
  total_errors: z.number(),
  items: z.array(NameCountSchema),
  by_project: z.array(ProjectToolSummarySchema),
  by_date: z.array(DayCountSchema),
});
```

Export types with `z.infer<>` for each schema.

### `schemas/qmd.ts`

```typescript
import { z } from "zod";

export const QmdAvailabilitySchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  db_path: z.string().nullable(),
  db_size_bytes: z.number().nullable(),
});

export const QmdIndexSchema = z.object({
  name: z.string(),
  file_stem: z.string(),
  db_path: z.string(),
  db_size_bytes: z.number(),
  collection_count: z.number(),
  document_count: z.number(),
  last_modified: z.string().nullable(),
});

export const QmdContextSchema = z.object({
  path: z.string(),
  context: z.string(),
});

export const QmdCollectionSchema = z.object({
  name: z.string(),
  path: z.string(),
  pattern: z.string(),
  ignore_patterns: z.array(z.string()),
  include_by_default: z.boolean(),
  update_command: z.string().nullable(),
  doc_count: z.number(),
  active_doc_count: z.number(),
  embedded_count: z.number(),
  last_modified: z.string().nullable(),
  contexts: z.array(QmdContextSchema),
});

export const QmdDocumentSchema = z.object({
  path: z.string(),
  title: z.string(),
  docid: z.string(),
  collection: z.string(),
  modified_at: z.string(),
  body_length: z.number(),
});

export const QmdStatusSchema = z.object({
  total_documents: z.number(),
  active_documents: z.number(),
  embedded_chunks: z.number(),
  needs_embedding: z.number(),
  collection_count: z.number(),
  db_size_bytes: z.number(),
  global_context: z.string().nullable(),
  days_since_update: z.number().nullable(),
});

export const QmdCollectionDetailSchema = z.object({
  collection: QmdCollectionSchema,
  documents: z.array(QmdDocumentSchema),
});

export const QmdCommandResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
});

// Search types
export const QmdExpandedQuerySchema = z.object({
  type: z.enum(["lex", "vec", "hyde"]),
  query: z.string(),
});

export const QmdRrfContributionSchema = z.object({
  listIndex: z.number(),
  source: z.enum(["fts", "vec"]),
  queryType: z.enum(["original", "lex", "vec", "hyde"]),
  query: z.string(),
  rank: z.number(),
  weight: z.number(),
  backendScore: z.number(),
  rrfContribution: z.number(),
});

export const QmdSearchExplainSchema = z.object({
  ftsScores: z.array(z.number()),
  vectorScores: z.array(z.number()),
  rrf: z.object({
    rank: z.number(),
    positionScore: z.number(),
    weight: z.number(),
    baseScore: z.number(),
    topRankBonus: z.number(),
    totalScore: z.number(),
    contributions: z.array(QmdRrfContributionSchema),
  }),
  rerankScore: z.number(),
  blendedScore: z.number(),
});

export const QmdSearchHitSchema = z.object({
  file: z.string(),
  displayPath: z.string(),
  title: z.string(),
  body: z.string(),
  bestChunk: z.string(),
  bestChunkPos: z.number(),
  score: z.number(),
  context: z.string().nullable(),
  docid: z.string(),
  explain: QmdSearchExplainSchema.optional(),
});

export const QmdSearchTimingSchema = z.object({
  expand_ms: z.number(),
  search_ms: z.number(),
  total_ms: z.number(),
});

export const QmdSearchResultSchema = z.object({
  results: z.array(QmdSearchHitSchema),
  expanded_queries: z.array(QmdExpandedQuerySchema),
  timing: QmdSearchTimingSchema,
});
```

---

## API Layer (`src/api/`)

### `api/analytics.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
// import schemas and types...

export async function get_analytics_overview(): Promise<AnalyticsOverview> {
  const raw = await invoke("get_analytics_overview");
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_project_sessions(project_name: string): Promise<SessionSummary[]> {
  const raw = await invoke("get_project_sessions", { projectName: project_name });
  return z.array(SessionSummarySchema).parse(raw);
}

export async function get_session_detail(session_id: string): Promise<SessionSummary> {
  const raw = await invoke("get_session_detail", { sessionId: session_id });
  return SessionSummarySchema.parse(raw);
}

export async function get_all_sessions(project_name?: string): Promise<SessionSummary[]> {
  const raw = await invoke("get_all_sessions", { projectName: project_name ?? null });
  return z.array(SessionSummarySchema).parse(raw);
}

export async function resync_sessions(): Promise<AnalyticsOverview> {
  const raw = await invoke("resync_sessions");
  return AnalyticsOverviewSchema.parse(raw);
}

export async function get_project_file_stats(project_name: string): Promise<ProjectFileStats> {
  const raw = await invoke("get_project_file_stats", { projectName: project_name });
  return ProjectFileStatsSchema.parse(raw);
}

export async function get_time_breakdown(range_days: number): Promise<TimeBreakdown> {
  const raw = await invoke("get_time_breakdown", { rangeDays: range_days });
  return TimeBreakdownSchema.parse(raw);
}

export async function get_session_entries(session_id: string): Promise<SessionEntriesResponse> {
  const raw = await invoke("get_session_entries", { sessionId: session_id });
  return raw as SessionEntriesResponse; // Raw JSON, too complex for Zod
}

export async function get_tool_details(
  tool_name: string,
  project_name?: string,
): Promise<ToolDetailResponse> {
  const raw = await invoke("get_tool_details", {
    toolName: tool_name,
    projectName: project_name ?? null,
  });
  return ToolDetailResponseSchema.parse(raw);
}
```

**Note:** `get_session_entries` returns raw JSON values (serde_json::Value) for the session viewer. These are type-asserted rather than Zod-validated because the entries are arbitrary JSON objects with many shapes.

### `api/qmd.ts`

All QMD commands follow the same pattern. Key parameter naming convention — JavaScript uses camelCase, Tauri auto-maps to Rust snake_case:

| JS param | Rust param |
|---|---|
| `projectName` | `project_name` |
| `sessionId` | `session_id` |
| `toolName` | `tool_name` |
| `rangeDays` | `range_days` |
| `oldName` | `old_name` |
| `newName` | `new_name` |
| `repoRoot` | `repo_root` |

QMD API functions:

```typescript
// Index management
qmd_list_indexes() → QmdIndex[]
qmd_create_index(name) → QmdCommandResult
qmd_delete_index(name) → QmdCommandResult
qmd_rename_index(old_name, new_name) → QmdCommandResult

// Availability
qmd_check_availability() → QmdAvailability

// Per-index
qmd_get_status(index) → QmdStatus
qmd_list_collections(index) → QmdCollection[]
qmd_get_collection_detail(index, name) → QmdCollectionDetail
qmd_add_collection(index, name, path, pattern?) → QmdCommandResult
qmd_remove_collection(index, name) → QmdCommandResult
qmd_rename_collection(index, old_name, new_name) → QmdCommandResult
qmd_add_context(index, collection, path, text) → QmdCommandResult
qmd_remove_context(index, collection, path) → QmdCommandResult
qmd_set_global_context(index, text) → QmdCommandResult
qmd_reindex(index) → QmdCommandResult
qmd_embed(index) → QmdCommandResult
qmd_cleanup(index) → QmdCommandResult
qmd_scan_filesystem(index, collection) → string[]
qmd_get_indexed_paths(index, collection) → string[]
qmd_toggle_files(index, collection, repo_root, adds, removes) → { indexed, deactivated }

// Search
qmd_search(index, query, collections?, limit?) → QmdSearchResult
```
