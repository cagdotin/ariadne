# Ariadne — Rebuild Spec 03: QMD Sidecar Bridge

> Complete specification for the TypeScript sidecar process that bridges the QMD SDK.

## Overview

The sidecar (`src-sidecar/qmd-bridge.ts`) is a long-lived child process spawned by the Rust backend. It wraps the `@tobilu/qmd` SDK and communicates via newline-delimited JSON-RPC over stdin/stdout.

**Why a sidecar?** QMD's SDK depends on `node-llama-cpp` for local LLM inference (embeddings, reranking, query expansion). These require native Node.js addons that can't run in WASM or be called from Rust FFI. The sidecar pattern (JSON-RPC over stdio) is the simplest bridge.

## Dependencies

```json
{
  "name": "ariadne-qmd-bridge",
  "private": true,
  "type": "module",
  "dependencies": {
    "@tobilu/qmd": "^2.0.1",
    "fast-glob": "^3.3.0"
  }
}
```

## macOS SQLite Patch

**Critical:** Apple's system SQLite is compiled with `SQLITE_OMIT_LOAD_EXTENSION`, which prevents loading `sqlite-vec` (needed by QMD for vector search). On macOS + Bun, the bridge patches in Homebrew's full SQLite **before** importing QMD:

```typescript
const is_bun = typeof globalThis.Bun !== "undefined";

if (is_bun && process.platform === "darwin") {
  const { Database: BunDatabase } = await import("bun:sqlite");
  const homebrew_paths = [
    "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", // Apple Silicon
    "/usr/local/opt/sqlite/lib/libsqlite3.dylib",    // Intel
  ];
  for (const p of homebrew_paths) {
    try {
      BunDatabase.setCustomSQLite(p);
      break;
    } catch { /* try next */ }
  }
}
```

This MUST happen before `import("@tobilu/qmd")` because QMD's `db.js` executes at import time.

## Startup

```bash
bun run qmd-bridge.ts [--db-path <path>]
```

1. Parse `--db-path` from argv, or default to `~/.cache/qmd/index.sqlite`
2. Apply SQLite patch (macOS only)
3. Import QMD SDK
4. Call `createStore({ dbPath })` to open the QMD store
5. Set up readline on stdin
6. Process JSON-RPC requests in a line-by-line loop
7. Graceful shutdown on stdin close, SIGTERM, or SIGINT

## JSON-RPC Protocol

### Request format
```json
{"id": 1, "method": "ping", "params": {}}
```

### Success response
```json
{"id": 1, "result": {"ok": true}}
```

### Error response
```json
{"id": 1, "error": {"code": -1, "message": "Something went wrong"}}
```

### Progress event (for long-running operations)
```json
{"id": 1, "event": "progress", "data": {"current": 5, "total": 100}}
```

All messages are single-line JSON terminated by `\n`. Diagnostic output goes to stderr.

## Method Handlers

### `ping`
- **Params:** none
- **Result:** `{ ok: true }`
- Used by Rust to verify the sidecar is alive after spawn.

### `switch_index`
- **Params:** `{ db_path: string }`
- **Behavior:** Close current QMD store, open new one at given path.
- **Result:** `{ ok: true }`

### `create_index`
- **Params:** `{ db_path: string }`
- **Behavior:** Create new QMD store at path, immediately close it.
- **Result:** `{ ok: true }`

### `add_collection`
- **Params:** `{ name: string, path: string, pattern?: string, ignore?: string[] }`
- **Behavior:** `store.addCollection(name, { path, pattern, ignore })`
- **Result:** `{ ok: true }`

### `remove_collection`
- **Params:** `{ name: string }`
- **Behavior:** `store.removeCollection(name)`
- **Result:** `{ ok: true }`

### `rename_collection`
- **Params:** `{ old_name: string, new_name: string }`
- **Behavior:** `store.renameCollection(old_name, new_name)`
- **Result:** `{ ok: true }`

### `add_context`
- **Params:** `{ collection: string, path: string, text: string }`
- **Behavior:** `store.addContext(collection, path, text)`
- **Result:** `{ ok: true }`

### `remove_context`
- **Params:** `{ collection: string, path: string }`
- **Behavior:** `store.removeContext(collection, path)`
- **Result:** `{ ok: true }`

### `set_global_context`
- **Params:** `{ text?: string }`
- **Behavior:** `store.setGlobalContext(text)`
- **Result:** `{ ok: true }`

### `update`
- **Params:** `{ collections?: string[] }`
- **Behavior:** `store.update()` with progress callback
- **Progress events:** `{ collection, file, current, total }`
- **Result:** QMD update result object

### `embed`
- **Params:** `{ force?: boolean }`
- **Behavior:** `store.embed()` with progress callback
- **Progress events:** `{ chunksEmbedded, totalChunks, bytesProcessed, totalBytes }`
- **Result:** QMD embed result object

### `cleanup`
- **Params:** none
- **Behavior:** Runs `Maintenance` operations: clearLLMCache, cleanupOrphanedContent, cleanupOrphanedVectors, deleteInactiveDocs, vacuum
- **Result:** `{ llm_cache, orphaned_content, orphaned_vectors, inactive_docs }`

### `scan_filesystem`
- **Params:** `{ path: string, pattern: string, ignore?: string[] }`
- **Behavior:** Uses `fast-glob` to find matching files. Auto-excludes: `node_modules`, `.git`, `.cache`, `vendor`, `dist`, `build`, and hidden files/folders.
- **Result:** `{ paths: string[] }` — relative paths, sorted

### `toggle_files`
- **Params:** `{ collection: string, repo_root: string, adds: string[], removes: string[] }`
- **Behavior:**
  1. **Removes:** For each path, compute `handelize_path()`, call `store.internal.deactivateDocument(collection, qmd_path)`
  2. **Adds:** For each path, read file from disk, compute hash (SHA-256), extract title (first h1/h2 or filename), insert content + document via `store.internal` methods. If document exists with different hash, update it.
  3. After all adds, run `store.embed()` to generate embeddings for new content.
- **Progress events:** `{ phase: "embed", chunksEmbedded, totalChunks, ... }` during embedding
- **Result:** `{ indexed: number, deactivated: number }`

### `search`
- **Params:** `{ query: string, collections?: string[], limit?: number }`
- **Behavior:**
  1. **Query expansion:** `store.expandQuery(query)` — LLM generates typed sub-queries (lex, vec, hyde)
  2. **Progress:** `{ stage: "expanding" }` then `{ stage: "expanded", queries, elapsed_ms }`
  3. **Hybrid search:** `store.search({ queries: expanded, collections, limit, explain: true })`
  4. **Progress:** `{ stage: "searching" }`
- **Result:** `{ results: SearchHit[], expanded_queries: ExpandedQuery[], timing: { expand_ms, search_ms, total_ms } }`

## `handelize_path()` Function

Must exactly match QMD's internal path normalization:

```typescript
function handelize_path(file_path: string): string {
  return file_path
    .toLowerCase()
    .split("/")
    .map((segment, idx, arr) => {
      const is_last = idx === arr.length - 1;
      if (is_last) {
        const ext_match = segment.match(/(\.[a-z0-9]+)$/i);
        const ext = ext_match ? ext_match[1] : "";
        const name_without_ext = ext ? segment.slice(0, -ext.length) : segment;
        const cleaned = name_without_ext
          .replace(/[^\p{L}\p{N}$]+/gu, "-")
          .replace(/^-+|-+$/g, "");
        return cleaned + ext;
      }
      return segment
        .replace(/[^\p{L}\p{N}$]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}
```

This is also replicated in the frontend at `src/lib/qmd-tree.ts`.

## Lifecycle

- Spawned lazily on first QMD command
- Stays alive for the app's lifetime
- Auto-respawns if it crashes (Rust detects via `try_wait()`)
- Clean shutdown: Rust drops stdin → sidecar detects readline close → calls `store.close()` → exits
- If clean shutdown takes too long, Rust calls `child.kill()`
