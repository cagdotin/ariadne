# QMD Search — In-App Hybrid Search for QMD Indexes

Status: Draft
Date: 2026-03-25
Execution plan: `docs/exec-plans/active/2026-03-25-qmd-search.md`

## 1. Problem Statement

Ariadne's QMD pages let users manage indexes, collections, contexts, and files — but there's no way to actually **search** the indexed content from the UI. Users must drop to the terminal (`qmd query ...`) to run queries. This breaks the observation-layer promise: Ariadne should let you see what's in your knowledge base, not just manage it.

The QMD SDK already exposes a rich search pipeline (BM25 + vector expansion + LLM reranking) with detailed explain traces. We want to surface this directly in the QMD index page, with full visibility into the search process.

## 2. Goals and Non-Goals

### 2.1 Goals
- Add a search input to each QMD index page (`/qmd/:index`)
- Execute hybrid search via the QMD SDK's `store.search()` (expansion + BM25 + vector + reranking)
- Show results in a modal/overlay with rich detail: scores, snippets, file paths, collection, context
- Show the search **process** — expanded queries, pipeline stages with timing, score traces
- Support collection filtering (optional — search all collections by default)
- Support `--explain` traces showing RRF contributions, rerank scores, blended scores

### 2.2 Non-Goals
- Cross-index search (search one index at a time)
- Search from the sidebar or a global search bar (future)
- Full document preview / inline editing from search results
- BM25-only or vector-only search modes in the UI (always hybrid for now)
- Advanced query syntax in the UI (no lex:/vec:/hyde: prefixes — just plain text, `expand` mode)

## 3. System Context

### 3.1 Affected Modules

| Layer | File(s) | Change |
|---|---|---|
| Sidecar bridge | `src-sidecar/qmd-bridge.ts` | Add `search` and `expand_query` method handlers |
| Rust commands | `src-tauri/src/commands/qmd.rs` | Add `qmd_search` Tauri command |
| Rust models | `src-tauri/src/models/qmd.rs` | Add search result types |
| Frontend API | `src/api/qmd.ts` | Add `qmd_search()` function |
| Frontend schemas | `src/schemas/qmd.ts` | Add Zod schemas for search results |
| QMD page | `src/pages/qmd.tsx` | Minimal: add trigger input + modal import (all logic in modal) |
| Search modal | `src/components/qmd-search-modal.tsx` | **New** — self-contained: input, collection filter, progress, results, detail |
| Info architecture | `docs/information-architecture.md` | Update QMD index section |

### 3.2 Data Flow

```
User types query → [Frontend]
  → Tauri IPC qmd_search(index, query, options)
    → [Rust] forwards to sidecar via JSON-RPC
      → [Sidecar bridge] calls store.search({ query, explain: true, ... })
        → QMD SDK: expand → BM25 + vector → RRF fusion → rerank
      ← Returns HybridQueryResult[] with explain traces
    ← Rust serializes to frontend
  ← Frontend displays in search results modal
```

### 3.3 QMD SDK Search API

The sidecar bridge wraps `QMDStore.search()`:

```typescript
// SDK interface
store.search({
  query: string,           // Plain text — auto-expanded by LLM
  collection?: string,     // Filter to one collection
  collections?: string[],  // Filter to multiple
  limit?: number,          // Max results (default 10)
  minScore?: number,       // Score threshold
  explain?: boolean,       // Include score traces
  rerank?: boolean,        // LLM reranking (default true)
}): Promise<HybridQueryResult[]>

// Also available for the process detail:
store.expandQuery(query: string): Promise<ExpandedQuery[]>
```

Key result type:
```typescript
interface HybridQueryResult {
  file: string;            // qmd://collection/path
  displayPath: string;     // Human-readable path
  title: string;
  body: string;            // Full document body
  bestChunk: string;       // Best matching chunk
  bestChunkPos: number;    // Position in document
  score: number;           // Final blended score 0–1
  context: string | null;  // Collection context annotation
  docid: string;           // Short hash ID (#abc123)
  explain?: HybridQueryExplain;
}
```

The `SearchHooks` interface provides pipeline stage callbacks:
- `onStrongSignal(topScore)` — BM25 probe found strong match, expansion skipped
- `onExpandStart()` / `onExpand(original, expanded[], elapsedMs)` — query expansion
- `onEmbedStart(count)` / `onEmbedDone(elapsedMs)` — embedding vec/hyde queries
- `onRerankStart(chunkCount)` / `onRerankDone(elapsedMs)` — LLM reranking

These hooks should be forwarded as progress events to the frontend so the modal can show live pipeline status.

## 4. Detailed Design

### 4.1 Search Trigger — On the Index Page

A small, tucked-in search trigger on the index page. Clicking it opens the full search modal. Minimal footprint — doesn't compete with the management UI.

- **Component**: A compact `<Input>` with a search icon and placeholder like `"Search this index..."`. Read-only on the index page — it's just a trigger.
- **On click/focus**: Opens the `QmdSearchModal` component. The modal owns the real input, collection filter, and results display.
- **Placement**: In the actions row (right side, alongside Re-index / Embed / Cleanup), or as a small bar below the index selector. Keep it unobtrusive.
- **Disabled state**: When `op_state.is_busy` (reindex/embed in progress) or when there are zero embedded chunks.
- **Code isolation**: The index page (`qmd.tsx`) only imports and renders `<QmdSearchModal open={...} on_close={...} index={...} collections={...} />`. All search logic, state, and UI lives inside the modal component.

### 4.2 Search Results Modal

A single self-contained component (`qmd-search-modal.tsx`) that owns all search UI: the real query input, collection filtering, progress display, results, and detail expansion.

**Layout — four zones stacked vertically:**

#### Zone 0: Query Input & Collection Filter (top of modal)
- **Text input**: Auto-focused, full-width. `Enter` submits, `Shift+Enter` for newline (if textarea) or just `Enter` to search.
- **Collection multi-select**: Below or beside the input. Pill-style toggles for each collection in the index. All selected by default. Click to toggle individual collections on/off.
- **Search button**: Explicit submit button alongside the input.

#### Zone 1: Process Header (appears after search starts)
- Expanded queries shown as pills/tags: `lex: "connection pool"`, `vec: why do connections time out`, `hyde: ...truncated...`
- Pipeline status line showing completed stages with timings:
  `Expanded (1.2s) → BM25 + Vector (0.4s) → Reranked 40 chunks (8.3s) → 5 results`
- If strong signal detected: show `Strong BM25 signal — expansion skipped`
- During search: animated progress indicator showing current stage

#### Zone 2: Results List
Each result is a card containing:
- **Score badge** — rounded score (e.g. `0.88`) with color coding (green ≥0.7, yellow ≥0.4, red <0.4)
- **Title** — document title, clickable/copyable
- **Path** — `qmd://collection/path/to/file.md` with collection name highlighted
- **Context** — if the collection has a context annotation, show it as a muted subtitle
- **Best chunk** — the `bestChunk` text rendered as a text block. This is the most relevant snippet.
- **Docid** — small `#abc123` badge

**Expandable detail per result** (click to toggle):
- **Score breakdown**: RRF contributions table showing which queries contributed what rank/score (lex vs vec), rerank score, blended formula
- **Full body preview**: The complete document body in a scrollable container, with the best chunk position highlighted/scrolled-to

#### Zone 3: Footer
- Total results count and search duration
- "Copy results as JSON" button (copies the raw result array)
- Close button (also: Escape key, click outside)

### 4.3 Sidecar Bridge — `search` Method

Add a new method handler to `qmd-bridge.ts`:

```typescript
// Method: "search"
// Params: { query, collection?, collections?, limit?, min_score?, explain? }
// Returns: { results: HybridQueryResult[], expanded_queries: ExpandedQuery[], timings: {...} }
```

The handler should:
1. Call `store.expandQuery(query)` first (so we can send expansion results as a progress event)
2. Then call `store.search({ queries: expanded, explain: true, ... })` with pre-expanded queries
3. Forward `SearchHooks` callbacks as progress events to the frontend

Actually, simpler approach: use `store.search({ query, explain: true })` which does expansion internally, but also wire up `SearchHooks` to emit progress events.

The challenge: the `QMDStore.search()` high-level method doesn't expose `SearchHooks`. Looking at the SDK, hooks are on `HybridQueryOptions` (used by `hybridQuery()` directly on the internal store). Two options:

**Option A**: Use the internal store's `hybridQuery()` function directly via `store.internal`, passing hooks.

**Option B**: Do a two-step call — `store.expandQuery()` first (emit progress), then `store.search({ queries: expanded, explain: true })` (skips expansion, goes straight to search+rerank).

**Recommendation: Option B**. It's clean, uses the public SDK API, and naturally splits the pipeline into observable stages. The bridge can:
1. Emit `{ stage: "expanding" }` progress
2. Call `store.expandQuery(query)` → emit `{ stage: "expanded", queries: [...], elapsed_ms }` progress
3. Emit `{ stage: "searching" }` progress
4. Call `store.search({ queries, explain: true, collection, limit })` → returns results
5. Send final result with results + expanded queries + timing

### 4.4 Rust Command

```rust
#[tauri::command]
pub async fn qmd_search(
    sidecar: State<'_, QmdSidecar>,
    index: String,
    query: String,
    collection: Option<String>,
    limit: Option<u32>,
    app: AppHandle,
) -> Result<QmdSearchResult, String>
```

Uses `call_with_progress_blocking` to forward progress events (expansion, searching) to the frontend via Tauri events (`qmd:search-progress`).

### 4.5 Frontend Types

```typescript
// Search result matching HybridQueryResult from QMD SDK
interface QmdSearchResult {
  results: QmdSearchHit[];
  expanded_queries: QmdExpandedQuery[];
  timing: QmdSearchTiming;
}

interface QmdSearchHit {
  file: string;
  display_path: string;
  title: string;
  best_chunk: string;
  best_chunk_pos: number;
  score: number;
  context: string | null;
  docid: string;
  explain?: QmdSearchExplain;
}

interface QmdExpandedQuery {
  type: "lex" | "vec" | "hyde";
  query: string;
}

interface QmdSearchExplain {
  fts_scores: number[];
  vector_scores: number[];
  rrf: {
    rank: number;
    position_score: number;
    weight: number;
    base_score: number;
    top_rank_bonus: number;
    total_score: number;
    contributions: QmdRrfContribution[];
  };
  rerank_score: number;
  blended_score: number;
}

interface QmdRrfContribution {
  list_index: number;
  source: "fts" | "vec";
  query_type: "original" | "lex" | "vec" | "hyde";
  query: string;
  rank: number;
  weight: number;
  backend_score: number;
  rrf_contribution: number;
}

interface QmdSearchTiming {
  expand_ms: number;
  search_ms: number;
  total_ms: number;
}
```

### 4.6 Search Progress Events

The sidecar emits progress events during search that the frontend listens to:

```typescript
// Progress event payloads (emitted via qmd:search-progress)
type QmdSearchProgress =
  | { stage: "expanding" }
  | { stage: "expanded"; queries: QmdExpandedQuery[]; elapsed_ms: number }
  | { stage: "searching" }
  | { stage: "complete"; elapsed_ms: number };
```

The modal shows these in real-time — a progress indicator that builds up as stages complete, giving the user confidence that something is happening (search can take 5–15 seconds for full hybrid with reranking).

## 5. Error Handling

| Failure | Behavior |
|---|---|
| No embedded chunks | Disable search input, show banner suggesting "Embed All" |
| Sidecar not running | Show error in modal: "QMD engine not available" |
| Search timeout (>30s) | Show error with option to retry |
| Empty results | Show "No results found" with suggestion to try different terms |
| Partial failure (expansion works, search fails) | Show expanded queries but error for results |

## 6. Testing Strategy

### 6.1 Manual Testing
- Search with a known query against an index with embedded collections
- Verify expanded queries are shown
- Verify score traces are visible in the detail expansion
- Verify collection filter works
- Test with empty index, index with no embeddings, index with only BM25 (no vectors)
- Test modal dismiss (Escape key, click outside, close button)

## 7. Code Isolation Principle

The search feature should be maximally isolated from the existing QMD page code:

- `qmd.tsx` changes are minimal: import the modal, add a trigger element, pass props (`open`, `on_close`, `index_name`, `collections`).
- **All** search state, API calls, progress listening, and result rendering live inside `qmd-search-modal.tsx`.
- The modal is self-contained: it manages its own query input, collection filter state, loading states, error handling, and result display.
- No new global state, no modifications to existing hooks or components.

## 8. Implementation Checklist

- [ ] **Sidecar**: Add `search` method to `qmd-bridge.ts` with two-step expand+search
- [ ] **Rust models**: Add `QmdSearchResult`, `QmdSearchHit`, `QmdExpandedQuery`, etc. to `models/qmd.rs`
- [ ] **Rust command**: Add `qmd_search` command with progress forwarding
- [ ] **Frontend schemas**: Add Zod schemas for search types in `schemas/qmd.ts`
- [ ] **Frontend API**: Add `qmd_search()` function in `api/qmd.ts`
- [ ] **Search modal component**: Create `src/components/qmd-search-modal.tsx` (all search UI lives here)
- [ ] **QMD page**: Minimal change — add trigger + modal import to `src/pages/qmd.tsx`
- [ ] **Progress events**: Wire up `qmd:search-progress` Tauri event listener inside the modal
- [ ] **Info architecture**: Update `docs/information-architecture.md` with search section
