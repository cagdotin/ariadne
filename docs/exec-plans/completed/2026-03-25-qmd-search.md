# QMD Search — Execution Plan

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Conforms to the plan standard in the `plan` skill's `PLAN.md`.

Status: Complete
Created: 2026-03-25
Spec: `docs/specs/2026-03-25-qmd-search.md`

## Purpose / Big picture

After this work, a user on the QMD index page (`/qmd/:index`) can click a search trigger, type a natural-language query in a modal, optionally filter by collections, and see hybrid search results with full pipeline visibility — expanded queries, timing, scores, best chunks, and expandable full-body detail.

**Verification**: Open Ariadne → navigate to a QMD index with at least one embedded collection → click the search trigger → type a query → press Enter → see expanded queries, pipeline progress, and ranked result cards with scores and snippets.

## Progress

- [x] (2026-03-25 09:55Z) Milestone 1: Sidecar bridge `search` method
- [x] (2026-03-25 09:56Z) Milestone 2: Rust backend command (pass-through serde_json::Value)
- [x] (2026-03-25 09:57Z) Milestone 3: Frontend API + Zod schemas
- [x] (2026-03-25 10:00Z) Milestone 4: Search modal component (qmd-search-modal.tsx)
- [x] (2026-03-25 10:02Z) Milestone 5: Wire into QMD index page (~15 lines changed)
- [x] (2026-03-25 10:03Z) Milestone 6: Info architecture update

## Surprises & Discoveries

_(none yet)_

## Decision Log

- Decision: Two-step search in sidecar (expandQuery → search with pre-expanded queries) rather than single search() call.
  Rationale: Lets us emit expansion results as a progress event before the heavy search+rerank phase. The SDK's high-level `search()` doesn't expose `SearchHooks`, but `expandQuery()` + `search({ queries })` achieves the same pipeline with observable stages.
  Date: 2026-03-25

- Decision: Modal owns all search UI; index page only has a trigger + boolean state.
  Rationale: Maximum code isolation. No modifications to existing hooks/state/components on the QMD page.
  Date: 2026-03-25

- Decision: Collection filter lives inside the modal, not on the index page.
  Rationale: Clicking the search trigger opens the modal where the user types the real query and selects collections. Keeps the index page uncluttered.
  Date: 2026-03-25

## Outcomes & Retrospective

_(to be filled on completion)_

---

## Context and Orientation

### Repository structure (relevant files)

```
src-sidecar/qmd-bridge.ts          # Sidecar process wrapping QMD SDK. JSON-RPC over stdin/stdout.
src-tauri/src/commands/qmd.rs       # Tauri commands forwarding to sidecar. Pattern: spawn_blocking + sidecar.call_blocking.
src-tauri/src/models/qmd.rs         # Rust structs (Serialize) for QMD data types.
src-tauri/src/sidecar.rs            # QmdSidecar: manages the child process, send_and_read / send_and_read_with_progress.
src-tauri/src/lib.rs                # Registers all Tauri commands in invoke_handler.
src/api/qmd.ts                     # Frontend wrappers: invoke() + Zod parse for each command.
src/schemas/qmd.ts                 # Zod schemas for all QMD types.
src/pages/qmd.tsx                  # QMD index page component.
src/hooks/use-qmd-operation.ts     # Hook that listens to qmd:update-progress / qmd:embed-progress Tauri events.
src/components/create-index-dialog.tsx  # Example of the dialog pattern: fixed overlay + Card.
```

### Key patterns to follow

- **Sidecar methods**: Add a handler function to the `methods` record in `qmd-bridge.ts`. It receives `(id, params)` and calls `send_result(id, ...)` or `send_progress(id, ...)`.
- **Rust commands**: `#[tauri::command]` async fn. Uses `sidecar.ensure_index(&db_path)?` then `sidecar.call_with_progress_blocking(method, params, &app, event_name)?`. Returns `Result<T, String>`.
- **Frontend API**: `async function qmd_xyz(...): Promise<T> { const raw = await invoke("qmd_xyz", { ... }); return Schema.parse(raw); }`
- **Dialogs**: Not using shadcn Dialog primitive. The project uses a simple pattern: `<div className="fixed inset-0 z-50 ..."><Card>...</Card></div>` with manual state management (`show_x_dialog` boolean + `set_show_x_dialog`).
- **Naming**: snake_case for functions/variables, kebab-case for files, CamelCase for types/components.
- **Tauri events**: Sidecar → Rust (`send_and_read_with_progress` which calls `app.emit(event_name, data)`) → Frontend (`listen<T>(event_name, callback)` from `@tauri-apps/api/event`).
- **Rust serde**: Tauri auto-converts Rust snake_case fields to camelCase in JSON. The frontend Zod schemas and `listen` payloads must use camelCase field names. The frontend API layer renames to snake_case after parsing.

### QMD SDK types involved

```typescript
// From @tobilu/qmd SDK (available in the sidecar)
store.expandQuery(query: string, options?: { intent?: string }): Promise<ExpandedQuery[]>
// ExpandedQuery = { type: 'lex' | 'vec' | 'hyde', query: string }

store.search(options: SearchOptions): Promise<HybridQueryResult[]>
// SearchOptions = { query?, queries?, collection?, collections?, limit?, minScore?, explain?, rerank? }
// HybridQueryResult = { file, displayPath, title, body, bestChunk, bestChunkPos, score, context, docid, explain? }
// HybridQueryExplain = { ftsScores, vectorScores, rrf: { rank, positionScore, weight, baseScore, topRankBonus, totalScore, contributions[] }, rerankScore, blendedScore }
// RRFContributionTrace = { listIndex, source, queryType, query, rank, weight, backendScore, rrfContribution }
```

---

## Plan of Work

Six milestones, each independently verifiable. They build bottom-up: sidecar → Rust → frontend API → component → integration.

### Milestone 1: Sidecar Bridge — `search` Method

**Goal**: The sidecar process accepts a `search` JSON-RPC method and returns hybrid search results with explain traces, emitting progress events for expansion and search stages.

**Work**:

Add a `search` handler to the `methods` record in `src-sidecar/qmd-bridge.ts`:

```typescript
async search(id, params) {
  const query = params.query as string;
  const collections = params.collections as string[] | undefined;
  const limit = params.limit as number | undefined;

  // Stage 1: Expand
  const expand_start = Date.now();
  send_progress(id, { stage: "expanding" });
  const expanded = await store.expandQuery(query);
  const expand_ms = Date.now() - expand_start;
  send_progress(id, {
    stage: "expanded",
    queries: expanded,
    elapsed_ms: expand_ms,
  });

  // Stage 2: Search with pre-expanded queries
  const search_start = Date.now();
  send_progress(id, { stage: "searching" });
  const results = await store.search({
    queries: expanded,
    collections,
    limit: limit ?? 10,
    explain: true,
  });
  const search_ms = Date.now() - search_start;

  send_result(id, {
    results,
    expanded_queries: expanded,
    timing: {
      expand_ms,
      search_ms,
      total_ms: expand_ms + search_ms,
    },
  });
}
```

**Verification**: With the sidecar running, send a raw JSON-RPC message to stdin:
```json
{"id":99,"method":"search","params":{"query":"test"}}
```
Expect: progress events with `stage: "expanding"` and `stage: "expanded"`, then a final result with `results` array, `expanded_queries`, and `timing`.

---

### Milestone 2: Rust Backend — Command + Models

**Goal**: A Tauri command `qmd_search` that forwards to the sidecar and streams progress events to the frontend.

**Work in `src-tauri/src/models/qmd.rs`**:

Add these structs (all `#[derive(Serialize)]`, matching the sidecar JSON output). Note: Tauri auto-converts snake_case → camelCase for the frontend.

```rust
#[derive(Serialize)]
pub struct QmdSearchResult {
    pub results: Vec<QmdSearchHit>,
    pub expanded_queries: Vec<QmdExpandedQuery>,
    pub timing: QmdSearchTiming,
}

#[derive(Serialize)]
pub struct QmdSearchHit {
    pub file: String,
    pub display_path: String,
    pub title: String,
    pub body: String,
    pub best_chunk: String,
    pub best_chunk_pos: u32,
    pub score: f64,
    pub context: Option<String>,
    pub docid: String,
    pub explain: Option<QmdSearchExplain>,
}

#[derive(Serialize)]
pub struct QmdExpandedQuery {
    #[serde(rename = "type")]
    pub query_type: String,
    pub query: String,
}

#[derive(Serialize)]
pub struct QmdSearchTiming {
    pub expand_ms: u64,
    pub search_ms: u64,
    pub total_ms: u64,
}

#[derive(Serialize)]
pub struct QmdSearchExplain {
    pub fts_scores: Vec<f64>,
    pub vector_scores: Vec<f64>,
    pub rrf: QmdRrfTrace,
    pub rerank_score: f64,
    pub blended_score: f64,
}

#[derive(Serialize)]
pub struct QmdRrfTrace {
    pub rank: u32,
    pub position_score: f64,
    pub weight: f64,
    pub base_score: f64,
    pub top_rank_bonus: f64,
    pub total_score: f64,
    pub contributions: Vec<QmdRrfContribution>,
}

#[derive(Serialize)]
pub struct QmdRrfContribution {
    pub list_index: u32,
    pub source: String,
    pub query_type: String,
    pub query: String,
    pub rank: u32,
    pub weight: f64,
    pub backend_score: f64,
    pub rrf_contribution: f64,
}
```

**Work in `src-tauri/src/commands/qmd.rs`**:

Add a `qmd_search` command. The sidecar returns a JSON blob; we need to deserialize it into our Rust types. Since the sidecar response is `serde_json::Value`, we can use `serde_json::from_value()`. This requires adding `Deserialize` to the models above as well (or parsing manually).

Simpler approach: define the Rust structs with both `Serialize` (for Tauri → frontend) and `Deserialize` (for sidecar JSON → Rust). The sidecar output uses camelCase (it's raw JS objects serialized by `JSON.stringify`), so the Deserialize side needs `#[serde(rename_all = "camelCase")]`.

Actually, there's a subtlety: the Tauri `Serialize` direction wants snake_case field names (Tauri auto-converts to camelCase for IPC), but the sidecar `Deserialize` direction receives camelCase. The cleanest solution: **use `serde_json::Value` as the return type from the sidecar call, and convert to our Rust types manually, OR use separate Deserialize types for the sidecar response.**

**Recommended approach**: Keep it simple. The Rust command receives `serde_json::Value` from the sidecar (as all other commands do), but instead of wrapping in `QmdCommandResult`, deserialize it into our typed struct using `serde_json::from_value`. Add `#[serde(rename_all = "camelCase")]` on `Deserialize` but the `Serialize` stays snake_case (Tauri handles the conversion). Use a helper derive: `#[derive(Serialize, Deserialize)]` with `#[serde(rename_all = "camelCase")]` — this works because Tauri's IPC also uses camelCase on the wire.

Wait — checking the existing pattern: existing commands like `qmd_reindex` return `QmdCommandResult` which is just `{ success, output }`. They don't deserialize the sidecar response structurally. But for search results, we need typed data, not a string blob.

**Simplest correct approach**: Have the Rust command pass the sidecar's `serde_json::Value` result directly through to the frontend. Tauri can serialize any `serde_json::Value`. The frontend Zod schemas handle validation. This avoids all Rust type-juggling.

```rust
#[tauri::command]
pub async fn qmd_search(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    query: String,
    collections: Option<Vec<String>>,
    limit: Option<u32>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let sidecar = sidecar.inner().clone();
    let db_path = resolve_index_db_path(&index).to_string_lossy().to_string();
    let params = json!({
        "query": query,
        "collections": collections,
        "limit": limit,
    });
    tokio::task::spawn_blocking(move || {
        sidecar.ensure_index(&db_path)?;
        sidecar.call_with_progress_blocking("search", params, &app, "qmd:search-progress")
    })
    .await
    .map_err(|e| e.to_string())?
}
```

This returns the raw sidecar JSON to the frontend. No Rust model structs needed for the search response — the frontend Zod schemas are the source of truth. The progress events (`qmd:search-progress`) are forwarded automatically by `call_with_progress_blocking`.

**Work in `src-tauri/src/lib.rs`**: Add `qmd_search` to the import and the `invoke_handler` list.

**Verification**: Build the Tauri app (`cargo build`). The command compiles and is registered.

---

### Milestone 3: Frontend API + Schemas

**Goal**: Typed frontend function `qmd_search()` with Zod validation for the response.

**Work in `src/schemas/qmd.ts`** — add these schemas at the end of the file:

```typescript
export const QmdExpandedQuerySchema = z.object({
  type: z.enum(["lex", "vec", "hyde"]),
  query: z.string(),
});
export type QmdExpandedQuery = z.infer<typeof QmdExpandedQuerySchema>;

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
export type QmdSearchHit = z.infer<typeof QmdSearchHitSchema>;

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
export type QmdSearchResult = z.infer<typeof QmdSearchResultSchema>;
```

Note: The sidecar output uses camelCase for HybridQueryResult fields (they come straight from the JS SDK), but `timing` and `expanded_queries` use our own snake_case naming from the bridge. The schemas must match what actually arrives. The Rust command passes `serde_json::Value` through transparently — no field renaming.

**Work in `src/api/qmd.ts`** — add:

```typescript
export async function qmd_search(
  index: string,
  query: string,
  collections?: string[],
  limit?: number,
): Promise<QmdSearchResult> {
  const raw = await invoke("qmd_search", {
    index,
    query,
    collections: collections ?? null,
    limit: limit ?? null,
  });
  return QmdSearchResultSchema.parse(raw);
}
```

**Verification**: Import works, TypeScript compiles, Zod schema matches the sidecar output shape (verify by running a test search in the next milestone).

---

### Milestone 4: Search Modal Component

**Goal**: A self-contained `QmdSearchModal` component with query input, collection filter, progress display, results list, and expandable detail.

**Create `src/components/qmd-search-modal.tsx`**.

Props interface:
```typescript
interface QmdSearchModalProps {
  open: boolean;
  on_close: () => void;
  index_name: string;
  collections: QmdCollection[];  // From parent — already loaded
}
```

The component manages internally:
- `query` text state
- `selected_collections` set (all selected by default)
- `searching` boolean
- `search_result: QmdSearchResult | null`
- `search_progress: QmdSearchProgress | null` (from Tauri events)
- `error: string | null`
- `expanded_results: Set<string>` (docids of results whose detail is open)

**Structure** (top-to-bottom within the modal overlay):

1. **Overlay**: `fixed inset-0 z-50 bg-black/50` with click-outside-to-close. Inner card: `max-w-4xl max-h-[85vh] overflow-y-auto`.

2. **Header**: Title bar with "Search {index_name}" and close button (X).

3. **Input area**: 
   - Full-width `<Input>` auto-focused, `placeholder="Search this index..."`.
   - `onKeyDown`: Enter → submit (unless empty).
   - Search button with loading spinner.
   - Below: collection pill toggles. Each pill is a `<button>` with the collection name. Active = solid bg, inactive = outline. Click toggles.

4. **Progress area** (visible during/after search):
   - Before results: animated dots/spinner with current stage text (`"Expanding query..."`, `"Searching..."`)
   - After results: compact summary line showing expanded queries as pills + timing.
   - Expanded query pills: `lex: "term"` in muted pill, `vec: "..."` in a different shade, `hyde: "..."` truncated.

5. **Results list** (visible after search completes):
   - Each result is a bordered card with:
     - Left: score badge (colored circle/pill)
     - Center: title (bold), display path (muted, small), context annotation if present (italic muted)
     - Docid badge (`#abc123`)
   - Below the header row: `bestChunk` in a `<pre>` or `<code>` block with `text-sm`, max ~6 lines with overflow hidden.
   - Expand toggle button ("Show details" / "Hide details"):
     - Score breakdown table: contributions from each query (source, type, query text, rank, RRF contribution)
     - RRF total, rerank score, blended score
     - Full body in a scrollable `<pre>` block, max-height ~300px

6. **Footer**: result count + total time. "Copy as JSON" button. Close button.

7. **Empty state**: "No results found. Try different terms or check your collection filter."

8. **Error state**: Red banner with error text + retry button.

**Event listener**: On mount (when `open` becomes true), register a Tauri event listener for `qmd:search-progress`. On unmount / close, unregister. The listener updates `search_progress` state which drives the progress area.

```typescript
useEffect(() => {
  if (!open) return;
  let unlisten: UnlistenFn | null = null;
  listen<QmdSearchProgress>("qmd:search-progress", (event) => {
    set_search_progress(event.payload);
  }).then((fn) => { unlisten = fn; });
  return () => { unlisten?.(); };
}, [open]);
```

**Search handler**:
```typescript
const handle_search = async () => {
  if (!query.trim()) return;
  set_searching(true);
  set_error(null);
  set_search_result(null);
  set_search_progress(null);
  try {
    const selected = selected_collections.size === collections.length
      ? undefined  // all selected = don't filter
      : Array.from(selected_collections);
    const result = await qmd_search(index_name, query.trim(), selected);
    set_search_result(result);
  } catch (err) {
    set_error(error_message(err, "Search failed"));
  } finally {
    set_searching(false);
  }
};
```

**Verification**: Render the modal open with a test index. Type a query, press Enter. See progress stages animate, then results appear with scores, chunks, and expandable detail.

---

### Milestone 5: Wire into QMD Index Page

**Goal**: Minimal change to `src/pages/qmd.tsx` — add a search trigger and the modal.

**Changes to `src/pages/qmd.tsx`**:

1. Add imports:
   ```typescript
   import { QmdSearchModal } from "@/components/qmd-search-modal";
   import { Search } from "lucide-react";
   ```

2. Add state:
   ```typescript
   const [show_search, set_show_search] = useState(false);
   ```

3. Add the trigger — a compact search input in the actions bar area (above/below existing buttons):
   ```tsx
   <div
     className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
     onClick={() => set_show_search(true)}
   >
     <Search className="h-3.5 w-3.5" />
     <span>Search this index...</span>
   </div>
   ```
   Disabled when `op_state.is_busy` or no embedded chunks exist.

4. Render the modal (at the bottom of the return JSX, alongside other dialogs):
   ```tsx
   {show_search && (
     <QmdSearchModal
       open={show_search}
       on_close={() => set_show_search(false)}
       index_name={index_name}
       collections={collections}
     />
   )}
   ```

That's it. No other changes to the page.

**Verification**: Load `/qmd/default`. See the search trigger in the actions area. Click it → modal opens. Close modal → trigger is still there. Page functions exactly as before when search is not active.

---

### Milestone 6: Info Architecture Update

**Goal**: Update `docs/information-architecture.md` to document the search feature.

**Changes**: In the QMD Index Overview section (§7), add a "Search" row to the table:

```
| Search trigger | `QmdSearchTrigger` | Compact input that opens search modal |
| Search modal | `QmdSearchModal` | Full search UI: input, collection filter, progress, results with expandable detail |
```

**Verification**: Read the document, confirm it accurately describes the new search capability.

---

## Concrete Steps

All commands run from repo root: `/Users/cgn/git/dev/0xcgn/ariadne/ariadne`

### Step 1: Sidecar bridge

Edit `src-sidecar/qmd-bridge.ts`. Add `search` to the `methods` record (after the existing `toggle_files` handler). Follow the two-step pattern described in Milestone 1.

### Step 2: Rust models + command

Edit `src-tauri/src/commands/qmd.rs`. Add the `qmd_search` command that passes `serde_json::Value` through (no new model structs needed — the response is pass-through JSON).

Edit `src-tauri/src/lib.rs`. Add `qmd_search` to the import line and the `invoke_handler![]` macro.

Verify: `cd src-tauri && cargo check`

### Step 3: Frontend schemas + API

Edit `src/schemas/qmd.ts`. Add `QmdExpandedQuerySchema`, `QmdSearchHitSchema`, `QmdSearchExplainSchema`, `QmdRrfContributionSchema`, `QmdSearchTimingSchema`, `QmdSearchResultSchema` and their type exports.

Edit `src/api/qmd.ts`. Add `qmd_search()` function. Import new schemas.

Verify: `bun run check` (TypeScript compilation)

### Step 4: Search modal component

Create `src/components/qmd-search-modal.tsx`. Build the full modal with all four zones. Wire the Tauri event listener for progress.

Verify: `bun run check`

### Step 5: QMD page integration

Edit `src/pages/qmd.tsx`. Add: one import, one state variable, one trigger div, one modal render. ~10 lines of changes.

Verify: `bun run dev` → open app → navigate to QMD index → click search → type query → see results.

### Step 6: Info architecture

Edit `docs/information-architecture.md`. Add search row to the QMD Index Overview table.

---

## Validation and Acceptance

1. **Happy path**: Navigate to `/qmd/default` with an index that has embedded collections. Click search trigger. Type "how does auth work". Press Enter. See:
   - Progress: "Expanding query..." → expanded queries appear as pills → "Searching..." → results appear
   - Results: cards with scores, titles, paths, best chunks
   - Expand a result: score breakdown table + full body visible

2. **Collection filter**: Toggle off one collection, search again. Results only from remaining collections.

3. **Empty results**: Search for gibberish. See "No results found" message.

4. **Modal isolation**: Close the modal (Escape / click outside / X button). The QMD index page is unchanged — no state leakage.

5. **Error handling**: Stop the sidecar process, try to search. See error message in the modal.

6. **No regression**: All existing QMD page functionality (index selector, collections table, re-index, embed, cleanup, global context) works exactly as before.

---

## Idempotence and Recovery

- **Sidecar bridge**: Adding a new method to the `methods` record is purely additive. No existing methods are modified.
- **Rust command**: New command, new registration. No existing commands touched.
- **Frontend**: New schemas/API function are additive. The modal component is new. The QMD page change is ~10 lines (1 import, 1 state, 1 trigger, 1 render).
- **Rollback**: Remove the 5 additions from `qmd.tsx`, delete `qmd-search-modal.tsx`, remove the new schemas/API function, remove the Rust command + registration, remove the sidecar method. Each layer is independently removable.

---

## Artifacts and Notes

_(to be filled during implementation)_

---

## Interfaces and Dependencies

| Interface | Location | Why |
|---|---|---|
| `QMDStore.expandQuery()` | `@tobilu/qmd` SDK | Two-step search: expand first, then search with pre-expanded queries |
| `QMDStore.search({ queries })` | `@tobilu/qmd` SDK | Hybrid search with pre-expanded queries + explain traces |
| `QmdSidecar.call_with_progress_blocking()` | `src-tauri/src/sidecar.rs` | Forwards progress events to frontend via Tauri emit |
| `listen()` | `@tauri-apps/api/event` | Frontend listens for `qmd:search-progress` events |
| `QmdCollection` type | `src/schemas/qmd.ts` | Passed from QMD page to modal for collection filter pills |
| `invoke()` | `@tauri-apps/api/core` | Frontend → Tauri IPC |
