# QMD — Knowledge Base Integration

> Reference document for Ariadne's QMD integration. Covers what QMD is, what version we target, its capabilities, and how we integrate.

## What Is QMD

QMD (Query Markup Documents) is an on-device hybrid search engine for markdown files by Tobi Lutke. It combines BM25 full-text search, vector semantic search, and LLM reranking — all running locally via `node-llama-cpp` with GGUF models.

- **Package:** `@tobilu/qmd` v2.0.1
- **License:** MIT
- **Source:** https://github.com/tobi/qmd (our fork at `/Users/cgn/git/qmd-fork`)
- **Runtime:** Node.js ≥22 or Bun ≥1.0

## Current Capabilities (v2.0.1)

### Collection Management
- Add/remove/rename collections (point at directories with glob patterns)
- Ignore patterns per collection (e.g. `["node_modules/**", "*.test.ts"]`)
- `includeByDefault` toggle — controls whether collection is searched by default
- Update commands — bash command run during `qmd update --pull` (e.g. `git pull`)
- Config stored in YAML (`~/.config/qmd/<index>.yml`) AND SQLite (`store_collections` table)

### Context System
- Hierarchical descriptive metadata per collection path
- Context at `/` covers everything, `/api` covers that subtree
- Global context applies across all collections
- Improves search relevance and is returned alongside results
- Stored in `store_collections.context` as JSON and in `store_config` for global

### Search
- **BM25 (lex):** Fast keyword search via FTS5. Supports exact phrases (`"rate limiter"`), negation (`-redis`), prefix matching.
- **Vector (vec):** Semantic similarity via embeddinggemma-300M (~300MB model).
- **Hyde:** Hypothetical document embedding — write what the answer looks like.
- **Hybrid (query):** Full pipeline — query expansion (fine-tuned 1.7B model) → parallel BM25+vector → RRF fusion → LLM reranking (qwen3-reranker-0.6b).
- **Intent:** Optional disambiguation signal that steers expansion and reranking.

### Document Retrieval
- Get by path, docid (`#abc123`), or batch via glob/comma-separated lists
- Line-range slicing (`file.md:100 -l 50`)
- Fuzzy matching suggests similar files on miss

### Indexing & Embedding
- `update()` — scan filesystem, hash content, insert into FTS index
- `embed()` — generate vector chunks (900 tokens, 15% overlap, smart markdown-aware breakpoints)
- Progress callbacks for both operations

### Maintenance
- Cleanup orphaned content/vectors
- Clear LLM cache (query expansion, rerank scores)
- Delete inactive documents
- Vacuum SQLite database

### Interfaces
- **CLI:** `qmd` command with subcommands (collection, context, search, vsearch, query, get, multi-get, update, embed, status, cleanup)
- **SDK:** TypeScript library — `createStore()` returns `QMDStore` with 20+ async methods
- **MCP Server:** stdio or HTTP transport, 4 tools (query, get, multi_get, status)
- **REST:** `POST /query` when HTTP server is running

## Multi-Index

QMD supports named indexes — each is an independent SQLite database at `~/.cache/qmd/{name}.sqlite` with its own collections, documents, embeddings, and global context. They share only the models directory (`~/.cache/qmd/models/`).

### Naming Convention

| UI name | File stem | File path |
|---------|-----------|-----------|
| `default` | `index` | `~/.cache/qmd/index.sqlite` |
| `work` | `work` | `~/.cache/qmd/work.sqlite` |
| `personal` | `personal` | `~/.cache/qmd/personal.sqlite` |

The SDK function `getDefaultDbPath(indexName = "index")` resolves to `~/.cache/qmd/{indexName}.sqlite`.

### Index Management in Ariadne

- **Discovery**: Rust scans `~/.cache/qmd/*.sqlite` to find all indexes
- **Auto-create**: The `default` index is auto-created if no `index.sqlite` exists
- **Create/Delete/Rename**: Supported via Tauri commands
- **Single sidecar**: One sidecar process handles all indexes via `switch_index` command
- **Route structure**: `/qmd/:index` for overview, `/qmd/:index/:collection` for detail
- **Index selector**: Horizontal bar at top of all QMD pages for quick switching
- **Last-visited**: Stored in `localStorage` key `ariadne:qmd:last-index`

### Sidecar Index Switching

The sidecar keeps one `QMDStore` open at a time. Rust tracks `current_index` and sends `switch_index` before operations on a different index. Switch latency is ~50ms (SQLite reopen). Index switching is disabled while an operation is in progress.

## Data Storage

SQLite database at `~/.cache/qmd/index.sqlite` (or `~/.cache/qmd/{name}.sqlite` for named indexes):

| Table | Purpose |
|-------|---------|
| `store_collections` | Collection definitions (name, path, pattern, ignore, context, includeByDefault, update_command) |
| `store_config` | Key-value metadata (config_hash, global_context) |
| `content` | Content-addressable document storage (hash → full text) |
| `documents` | File→content mapping (collection, path, title, hash, active flag, timestamps) |
| `documents_fts` | FTS5 full-text index (filepath, title, body) |
| `content_vectors` | Embedding chunks (hash, seq, pos, model) |
| `vectors_vec` | sqlite-vec virtual table for vector similarity (cosine distance) |
| `llm_cache` | Cached LLM responses |

### Key Indexes
- `idx_documents_collection` — (collection, active)
- `idx_documents_hash` — (hash)
- `idx_documents_path` — (path, active)

## Local GGUF Models

Auto-downloaded to `~/.cache/qmd/models/`:

| Model | Purpose | Size |
|-------|---------|------|
| embeddinggemma-300M-Q8_0 | Vector embeddings | ~300MB |
| qwen3-reranker-0.6b-q8_0 | Re-ranking | ~640MB |
| qmd-query-expansion-1.7B-q4_k_m | Query expansion (fine-tuned) | ~1.1GB |

Custom embedding model override via `QMD_EMBED_MODEL` env var.

## Integration Approach

See [Integration Architecture](#integration-architecture) below and the spec at `docs/specs/2026-03-20-qmd-integration.md`.

### Integration Architecture

Ariadne is a Tauri app (Rust backend + React webview). The QMD SDK is TypeScript/Node.js — it cannot run in the browser webview or directly in Rust. We use a **hybrid approach**:

**Reads → Rust reads QMD's SQLite directly**
- Fast, no extra processes
- Uses `rusqlite` to query `store_collections`, `documents`, `content_vectors`, `store_config`
- Schema is stable and documented above

**Writes/Actions → Shell out to `qmd` CLI**
- Collection CRUD: `qmd collection add/remove/rename`
- Context CRUD: `qmd context add/rm`
- Indexing: `qmd update`, `qmd embed`
- Maintenance: `qmd cleanup`
- These are infrequent operations where subprocess overhead doesn't matter

**Future: Sidecar upgrade path**
- If we need progress streaming (embed/update progress bars), search with reranking, or other SDK-only features, we can add a Node/Bun sidecar process
- The sidecar would be a thin JSON-RPC bridge over stdio wrapping the QMD TypeScript SDK
- Tauri has first-class sidecar support via `tauri-plugin-shell`

### v1 → v2 Evolution

v1 used Rust SQLite reads + CLI subprocess for mutations. This had critical UX issues:
- **No progress feedback** — reindex/embed are long-running but had no progress indication
- **No double-spawn protection** — user clicked embed 3 times, spawned 3 parallel processes
- **No file-level control** — couldn't see or toggle which files are indexed

v2 replaces CLI mutations with a **sidecar bridge** — a Node/Bun child process wrapping the QMD TypeScript SDK. See `docs/specs/2026-03-20-qmd-v2-sidecar-and-tree.md`.

### File Inclusion/Exclusion Model

The agents QMD extension (`/Users/cgn/git/dev/0xcgn/agents/extensions/qmd/`) established the pattern for file toggling:

**It does NOT use ignore patterns.** Instead, it directly activates/deactivates individual documents via the QMD SDK's internal APIs:
- **Remove**: `store.internal.deactivateDocument(collection, handelizedPath)`
- **Add**: Read file → hash → `store.internal.insertContent()` + `store.internal.insertDocument()` → `store.embed()` for new content
- **handelize_path**: QMD normalizes filesystem paths (lowercase, replace non-word chars with dashes, triple underscore → folder separator). Must use the same function.

**Visual indicators** (circles per file/folder):
- `●` accent — fully indexed (file in QMD, or all dir descendants indexed)
- `◐` accent — partially indexed (some descendants indexed)
- `○` dim — not indexed
- `◉` accent — pending add
- `◎` warning — pending remove

**Toggle flow**: Space/click toggles → changes are batched as pending → "Apply" commits all at once.

**Key data structures** (ported from agents extension):
- `ToggleState` — tracks `indexed_set`, `pending_adds`, `pending_removes`
- `FileTreeNode` — tree node with `indexed`, `dir_index_status`
- `build_file_tree(fs_paths, indexed_set)` — builds tree, marks status, collapses single-child dirs
- `flatten_tree(roots, collapsed)` — for rendering

### What to Watch For

| Concern | Details |
|---------|---------|
| **Schema changes** | If QMD updates its SQLite schema, our Rust reader needs updating. Pin to v2.x, check CHANGELOG on upgrades. |
| **Database locking** | QMD uses WAL mode. Our Rust reads open in read-only mode to avoid contention. The sidecar opens in DB-only mode (read-write) for mutations. |
| **Config sync** | QMD syncs YAML config → SQLite on startup (via config hash). The sidecar opens in DB-only mode, bypassing YAML entirely. This means changes made through Ariadne won't appear in the YAML config — they live only in SQLite. |
| **Model downloads** | First `embed()` or `search()` triggers ~2GB model downloads. The sidecar can stream download progress but we need UI for this. |
| **qmd availability** | The `@tobilu/qmd` package must be importable by the sidecar. Since QMD is installed globally, the sidecar should resolve it from the global node_modules. |
| **handelize_path** | QMD normalizes paths before storing. When toggling files, we must apply the same normalization. The function is exported from the QMD SDK's internal store. |
| **Sidecar process** | Must be killed on app close. If it crashes, Rust should respawn on next command. Health checked via `ping`. |
| **Collection paths** | `qmd update` will deactivate ALL documents if the collection path doesn't exist on disk. The UI should warn about broken paths before allowing reindex. |
