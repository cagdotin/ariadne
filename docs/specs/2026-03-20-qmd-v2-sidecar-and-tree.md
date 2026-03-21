# QMD v2 — Sidecar Bridge + File Tree with Inclusion Toggle

Status: Draft
Date: 2026-03-20
Depends on: `docs/specs/2026-03-20-qmd-integration.md` (v1, implemented)
Knowledge doc: `docs/knowledge/qmd.md`
Reference impl: `/Users/cgn/git/dev/0xcgn/agents/extensions/qmd/` (pi QMD extension)

## 1. Problem Statement

The v1 QMD integration has two critical issues:

1. **Blind fire-and-forget mutations**: Clicking "Re-index All" or "Embed All" spawns a `qmd` CLI subprocess with no progress feedback, no cancellation, and no protection against double-spawning. A user clicked embed three times thinking nothing happened, spawning three parallel processes that pegged the CPU.

2. **No file-level visibility or control**: The collection detail page shows a flat document table but provides no way to see the directory structure, understand which files are indexed vs available, or toggle individual files/folders in or out of the index.

## 2. Goals and Non-Goals

### 2.1 Goals
- Replace all CLI-subprocess mutations with a **sidecar bridge** that wraps the QMD TypeScript SDK
- **Progress streaming** for `update()` and `embed()` — real-time progress bars in the UI
- **Process guard** — prevent double-spawning, allow cancellation
- **File tree view** on the collection detail page using kibo-ui Tree component
- **Inclusion indicators** — per-file and per-directory circles showing indexed/not-indexed/partial status
- **Toggle inclusion** — toggle files/folders with batched pending changes and an apply action
- Port the **ToggleState** pattern from the agents QMD extension

### 2.2 Non-Goals
- Search UI from within Ariadne (separate future feature)
- Bundling the sidecar as a compiled binary (require `node`/`bun` on PATH for now)
- Multiple named indexes (stay on default index)
- Live file watching / auto-reindex on filesystem changes

## 3. Architecture

### 3.1 Sidecar Overview

```
┌─────────────────────────────────────────────────┐
│ Ariadne (Tauri App)                             │
│                                                 │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │ Rust Backend  │     │  React UI (webview)  │  │
│  │              ├─IPC─►│                      │  │
│  └──────┬───────┘     └──────────────────────┘  │
│         │                                       │
│         │ stdin/stdout JSON-RPC                  │
│         │                                       │
│  ┌──────▼──────────────────────────────────┐    │
│  │ qmd-bridge  (Node/Bun child process)    │    │
│  │                                         │    │
│  │  import { createStore } from '@tobilu/qmd' │  │
│  │  const store = await createStore(...)   │    │
│  │                                         │    │
│  │  Handles:                               │    │
│  │  - Collection CRUD                      │    │
│  │  - Context CRUD                         │    │
│  │  - update() with progress events        │    │
│  │  - embed() with progress events         │    │
│  │  - File toggle (activate/deactivate)    │    │
│  │  - Filesystem scanning                  │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ ~/.cache/qmd/index.sqlite (read-only)   │    │
│  │ ← Rust reads directly for dashboard     │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Reads stay in Rust** — the SQLite direct reads (status, collections, documents) remain fast and unchanged.

**All mutations go through the sidecar** — collection CRUD, context CRUD, update, embed, file toggling, cleanup.

### 3.2 JSON-RPC Protocol

Messages are newline-delimited JSON over stdin/stdout.

**Request:**
```json
{"id": 1, "method": "update", "params": {"collections": ["agents"]}}
```

**Response (final result):**
```json
{"id": 1, "result": {"collections": 1, "indexed": 47, "updated": 3, "unchanged": 44, "removed": 0, "needsEmbedding": 5}}
```

**Progress event (streamed during long operations):**
```json
{"id": 1, "event": "progress", "data": {"collection": "agents", "file": "docs/setup.md", "current": 12, "total": 47}}
```

**Error:**
```json
{"id": 1, "error": {"code": -1, "message": "Collection not found: foo"}}
```

### 3.3 Sidecar Methods

| Method | Params | Returns | Streams Progress |
|--------|--------|---------|-----------------|
| `ping` | — | `{ ok: true }` | No |
| `add_collection` | `{ name, path, pattern?, ignore? }` | `{ ok: true }` | No |
| `remove_collection` | `{ name }` | `{ ok: true }` | No |
| `rename_collection` | `{ old_name, new_name }` | `{ ok: true }` | No |
| `add_context` | `{ collection, path, text }` | `{ ok: true }` | No |
| `remove_context` | `{ collection, path }` | `{ ok: true }` | No |
| `set_global_context` | `{ text }` | `{ ok: true }` | No |
| `update` | `{ collections? }` | `UpdateResult` | Yes — `{ collection, file, current, total }` |
| `embed` | `{ force? }` | `EmbedResult` | Yes — `{ chunksEmbedded, totalChunks, bytesProcessed, totalBytes }` |
| `cleanup` | — | `{ llmCache, orphanedContent, orphanedVectors, inactiveDocs }` | No |
| `scan_filesystem` | `{ collection, path, pattern }` | `{ paths: string[] }` | No |
| `get_indexed_paths` | `{ collection }` | `{ paths: string[] }` | No |
| `toggle_files` | `{ collection, repo_root, adds: string[], removes: string[] }` | `{ indexed, deactivated }` | No |

### 3.4 Sidecar Lifecycle

- Rust spawns the sidecar on first QMD mutation command (lazy start)
- Sidecar stays alive for the app's lifetime (the QMD store keeps models warm)
- `ping` method used as health check before operations
- If sidecar crashes, Rust respawns on next command
- On app close, Rust sends SIGTERM → sidecar calls `store.close()` and exits

## 4. Sidecar Implementation

### 4.1 File: `src-sidecar/qmd-bridge.ts`

```
src-sidecar/
├── qmd-bridge.ts        # Main entry — JSON-RPC loop, method dispatch
├── package.json         # Dependencies: @tobilu/qmd
└── tsconfig.json        # TypeScript config
```

The bridge is a standalone Node/Bun script. It is NOT bundled into the Tauri binary — it runs via `node` or `bun` on the user's PATH (same requirement as QMD itself).

**Startup:**
1. Read `--db-path` from argv (or use default `~/.cache/qmd/index.sqlite`)
2. `createStore({ dbPath })` in DB-only mode
3. Enter readline loop on stdin

**Method dispatch:**
- Parse JSON line → extract `{ id, method, params }`
- Dispatch to handler function
- For progress-streaming methods, handler emits `{ id, event: "progress", data }` lines during execution
- On completion, emit `{ id, result }` or `{ id, error }`

**Key implementation detail for `toggle_files`:**
The agents extension doesn't use ignore patterns. It directly activates/deactivates documents via the QMD SDK's internal APIs:
- **Remove files**: `store.internal.deactivateDocument(collection, handelizedPath)` for each path
- **Add files**: Read file content, hash it, insert via `store.internal.insertContent()` + `store.internal.insertDocument()`, then `store.embed()` for new content
- This is what the sidecar's `toggle_files` method will do

### 4.2 Rust Side: `src-tauri/src/sidecar.rs`

Manages the child process lifecycle:

```rust
pub struct QmdSidecar {
    process: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    stdout_reader: Mutex<Option<BufReader<ChildStdout>>>,
    next_id: AtomicU64,
}
```

**Key methods:**
- `ensure_running()` — spawn if not running, verify with `ping`
- `call(method, params) -> Result<Value>` — send request, wait for final response
- `call_with_progress(method, params, progress_tx) -> Result<Value>` — send request, stream progress events to a channel, return final result
- `shutdown()` — send SIGTERM, wait for exit

**Tauri commands** switch from `run_qmd()` CLI calls to `sidecar.call()`:

```rust
#[tauri::command]
async fn qmd_add_collection(sidecar: State<'_, QmdSidecar>, name: String, path: String, pattern: Option<String>) -> Result<QmdCommandResult, String> {
    sidecar.call("add_collection", json!({ "name": name, "path": path, "pattern": pattern })).await
}
```

**Progress streaming** uses Tauri's event system:

```rust
#[tauri::command]
async fn qmd_update(sidecar: State<'_, QmdSidecar>, app: AppHandle) -> Result<UpdateResult, String> {
    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    
    // Forward progress events to frontend
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            app.emit("qmd:update-progress", progress).ok();
        }
    });
    
    sidecar.call_with_progress("update", json!({}), tx).await
}
```

## 5. File Tree View

### 5.1 Data Model

Port from the agents extension (pure functions, no TUI dependency):

**`src/lib/qmd-tree.ts`** — Core data structures and algorithms:

```typescript
// Types
export type DirIndexStatus = "all" | "some" | "none";

export interface FileTreeNode {
  name: string;
  path: string;         // relative path within collection
  is_dir: boolean;
  children: FileTreeNode[];
  file_count: number;
  indexed: boolean;              // for files: in QMD index?
  dir_index_status: DirIndexStatus;  // for dirs: aggregate
}

// Functions (ported from agents extension)
export function build_file_tree(paths: string[], indexed_set: Set<string>): FileTreeNode[];
export function flatten_tree(roots: FileTreeNode[], collapsed: Set<string>): FlatTreeEntry[];
export function collect_file_paths(node: FileTreeNode): string[];
```

**`src/lib/toggle-state.ts`** — Port of ToggleState class:

```typescript
export class ToggleState {
  readonly indexed_set: Set<string>;
  readonly pending_adds: Set<string>;
  readonly pending_removes: Set<string>;
  
  is_effectively_indexed(path: string): boolean;
  toggle_file(path: string): void;
  toggle_dir(node: FileTreeNode): void;
  toggle_node(node: FileTreeNode): void;
  has_pending(): boolean;
  pending_count(): number;
  clear(): void;
}
```

### 5.2 New Tauri Commands

| Command | Source | Returns |
|---------|--------|---------|
| `qmd_scan_filesystem` | Sidecar → `scan_filesystem` | `string[]` — all files matching glob on disk |
| `qmd_get_indexed_paths` | SQLite read | `string[]` — active document paths for collection |
| `qmd_toggle_files` | Sidecar → `toggle_files` | `{ indexed, deactivated }` |

### 5.3 Frontend: Collection Detail Page Rewrite

The collection detail page (`/qmd/:name`) gets a **tab-based layout**:

```
┌──────────────────────────────────────────────┐
│ QMD / agents                                 │
├──────────────────────────────────────────────┤
│ [Stats Cards: Docs | Embedded | Last Updated]│
├──────────────────────────────────────────────┤
│ [ Files ] [ Settings ] [ Contexts ]          │  ← tabs
├──────────────────────────────────────────────┤
│                                              │
│ 97/147 indexed                 3 pending     │  ← file stats bar
│ ─────────────────────────────────────────── │
│ ● ▸ docs/                          (23)     │
│ ◐ ▸ src/                           (45)     │
│ ○ ▸ test/                          (12)     │
│ ●   README.md                               │
│ ●   AGENTS.md                               │
│ ○   .env.example                            │
│                                              │
│               [Apply 3 Changes]              │  ← shown when pending
└──────────────────────────────────────────────┘
```

### 5.4 Tree Component: `CollectionFileTree`

Uses kibo-ui Tree component as the rendering layer, with our data model driving it:

```typescript
interface CollectionFileTreeProps {
  filesystem_paths: string[];      // all files on disk matching glob
  indexed_paths: string[];         // files currently in QMD index
  collection_name: string;
  repo_root: string;
  on_apply: (adds: string[], removes: string[]) => Promise<void>;
}
```

**Rendering per node:**

| Node Type | Indicator | Label | Right Side |
|-----------|-----------|-------|------------|
| Dir (all indexed) | `●` accent | `name/` | `(count)` |
| Dir (some indexed) | `◐` accent | `name/` | `(count)` |
| Dir (none indexed) | `○` dim | `name/` | `(count)` |
| Dir (has pending) | `●/◐/○` warning | `name/` | `(count)` |
| File (indexed) | `●` accent | `filename.md` | — |
| File (not indexed) | `○` dim | `filename.md` | — |
| File (pending add) | `◉` accent | `filename.md` | — |
| File (pending remove) | `◎` warning | `filename.md` | — |

**Interaction:**
- **Click** on a directory → expand/collapse
- **Click on the indicator circle** → toggle inclusion (file or all descendants for dir)
- **Right-click** → context menu with "Include" / "Exclude" / "Include All in Folder" / "Exclude All in Folder"
- When pending changes exist → "Apply N Changes" button appears above the tree
- Apply calls `qmd_toggle_files` through the sidecar → refreshes tree

### 5.5 Progress UI

For `update` and `embed`, the button transforms into a progress indicator:

```
┌─────────────────────────────────────┐
│ Re-indexing...  agents              │
│ ████████████░░░░░░░░  32/47 files   │
│                            [Cancel] │
└─────────────────────────────────────┘
```

Implementation:
- Frontend listens to Tauri events (`qmd:update-progress`, `qmd:embed-progress`)
- Progress state managed in a `QmdOperationContext` (React context or zustand store)
- While an operation is running, all QMD mutation buttons are disabled
- Cancel button sends a cancellation signal through the sidecar

## 6. File Manifest

### New Files

| File | Purpose |
|------|---------|
| `src-sidecar/qmd-bridge.ts` | Sidecar entry point — JSON-RPC loop wrapping QMD SDK |
| `src-sidecar/package.json` | Sidecar dependencies |
| `src-sidecar/tsconfig.json` | TypeScript config for sidecar |
| `src-tauri/src/sidecar.rs` | Rust sidecar process manager |
| `src/lib/qmd-tree.ts` | File tree data model (build, flatten, collect) |
| `src/lib/toggle-state.ts` | Toggle state management (pending adds/removes) |
| `src/components/collection-file-tree.tsx` | Tree view component with inclusion indicators |
| `src/components/qmd-progress.tsx` | Progress bar for update/embed operations |
| `src/hooks/use-qmd-operation.ts` | Hook for tracking sidecar operation progress |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/src/commands/qmd.rs` | Replace `run_qmd()` calls with sidecar dispatch. Add `qmd_scan_filesystem`, `qmd_get_indexed_paths`, `qmd_toggle_files`. |
| `src-tauri/src/lib.rs` | Register sidecar state + new commands. Remove dead CLI code. |
| `src/pages/qmd-collection.tsx` | Rewrite: tab layout, tree view replaces document table, progress UI |
| `src/pages/qmd.tsx` | Add progress UI for global actions, disable buttons during operations |
| `src/api/qmd.ts` | Add new API functions for tree + toggle |
| `src/schemas/qmd.ts` | Add schemas for progress events, toggle result, filesystem scan |

## 7. Execution Order

### Phase 1: Sidecar Foundation
1. Create `src-sidecar/` directory with `qmd-bridge.ts`, `package.json`, `tsconfig.json`
2. Implement JSON-RPC loop + all method handlers
3. Create `src-tauri/src/sidecar.rs` — process manager with spawn/call/shutdown
4. Wire up in `lib.rs` as managed state
5. Replace mutation commands in `qmd.rs` to use sidecar instead of CLI
6. Test: verify all existing functionality still works

### Phase 2: Progress Streaming
7. Add progress event forwarding in sidecar (update/embed)
8. Add Tauri event emission in Rust commands
9. Create `use-qmd-operation` hook + `QmdProgress` component
10. Update QMD overview page with progress UI
11. Test: verify progress bars work, double-click protection works

### Phase 3: File Tree
12. Port `qmd-tree.ts` and `toggle-state.ts` from agents extension
13. Add `qmd_scan_filesystem` and `qmd_get_indexed_paths` commands
14. Build `CollectionFileTree` component using kibo-ui Tree
15. Rewrite collection detail page with tabs (Files / Settings / Contexts)
16. Wire up toggle → apply → sidecar flow
17. Test: verify tree renders, toggle works, apply updates index

## 8. Open Questions

1. **Sidecar location**: Should `src-sidecar/` be a separate directory at the repo root, or nested under `src-tauri/`? Recommendation: repo root, since it has its own `package.json` and is a separate concern.

2. **handelize_path**: The agents extension uses a `handelize_path` function to convert filesystem paths to QMD-internal paths. We need to port this or import it from the QMD SDK (it's exported as internal). Need to verify the exact function.

3. **Filesystem scanning**: The sidecar's `scan_filesystem` method needs to use the same glob/ignore logic as QMD (`fast-glob` with the collection's pattern and ignore list). Should we call `fast-glob` directly in the sidecar, or expose a scan method on the QMD SDK?

4. **Model downloads**: First `embed()` triggers ~2GB model download. The sidecar can stream download progress, but we need UI for this distinct operation. Defer or handle in v2?
