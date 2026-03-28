# QMD — Knowledge Base Integration

Status: active  
Last updated: 2026-03-28

This document describes Ariadne's **current** QMD integration.

It is the reference for:
- what Ariadne assumes about QMD
- how reads, writes, search, and file toggles work today
- where the boundary between Rust and the sidecar lives
- what is important when changing the integration

For page-level navigation, see `docs/information-architecture.md`. For the current architecture map, see `docs/ARCHITECTURE.md`.

---

## What QMD is in Ariadne

QMD is the markdown knowledge-base engine Ariadne integrates with.

In Ariadne today, QMD provides:
- named indexes backed by SQLite databases
- collections with path/pattern/context metadata
- hybrid search over indexed content
- embedding / reindex / cleanup operations
- file-level inclusion toggles inside a collection

Ariadne adds:
- a GUI for index and collection management
- a GUI for hybrid search
- progress-aware update/embed flows
- file-tree inclusion controls
- a separate `/qmd/logs` page that shows how agents used the QMD CLI during sessions

---

## Current integration model

Ariadne uses a **hybrid backend**.

### Reads: Rust reads SQLite directly

Rust reads QMD SQLite for dashboard-like state such as:
- index discovery
- index status
- collection listings
- collection details
- indexed document paths

This logic lives primarily in:
- `src-tauri/src/commands/qmd.rs`
- `src-tauri/src/models/qmd.rs`

### Writes and search: QMD sidecar

Mutations and hybrid search go through a long-lived sidecar:
- create index
- add/remove/rename collection
- add/remove context
- set global context
- reindex
- embed
- cleanup
- filesystem scan
- file toggles
- hybrid search

This path lives in:
- `src-tauri/src/sidecar.rs`
- `src-sidecar/qmd-bridge.ts`

### Why the split exists

Rust/SQLite reads are simple and fast for status screens.
The QMD SDK is the authoritative path for write/search behavior, so Ariadne keeps those operations inside the sidecar instead of re-implementing them in Rust.

---

## Index model

QMD indexes are modeled as named SQLite databases under the QMD cache directory.

### Naming

Ariadne presents the special `index.sqlite` database as **`default`**.

| Display name | File stem | Typical file |
|---|---|---|
| `default` | `index` | `~/.cache/qmd/index.sqlite` |
| `work` | `work` | `~/.cache/qmd/work.sqlite` |
| `personal` | `personal` | `~/.cache/qmd/personal.sqlite` |

### Current app behavior

- indexes are discovered by scanning `~/.cache/qmd/*.sqlite`
- the router uses `/qmd/:index`
- one sidecar process is reused across indexes
- the sidecar switches indexes with `switch_index`
- the last visited index is stored in `ariadne:qmd:last-index`

### Important constraint

Index selection is **route state** in the frontend and **opened-db state** in the sidecar. Those two must stay aligned.

---

## Collection model

A collection is a named filesystem-backed slice of one index.

Ariadne currently surfaces these collection fields:
- `name`
- `path`
- `pattern`
- `ignore_patterns`
- `include_by_default`
- `update_command`
- contexts
- document / embedded counts

### Current collection flows

On the index page (`/qmd/:index`) Ariadne supports:
- listing collections
- adding a collection
- entering global context
- running index-wide update/embed/cleanup

On the collection page (`/qmd/:index/:collection`) Ariadne supports:
- viewing collection settings
- adding/removing path contexts
- scanning the collection filesystem
- viewing indexed paths
- toggling files/folders in or out of the index

---

## Sidecar model

The sidecar is a long-lived JSON-RPC process implemented in `src-sidecar/qmd-bridge.ts`.

### Responsibilities

It wraps the QMD SDK and owns the behaviorful parts of the integration:
- index switching
- collection/context mutation
- reindex / embed / cleanup
- filesystem scanning and file toggles
- hybrid search and progress emission

Read `src-sidecar/qmd-bridge.ts` directly for the exact current method surface. The important documentation point is that this behavior lives in the sidecar rather than being reimplemented in Rust.

### Process rules

- Ariadne keeps **one sidecar process** at a time
- Rust ensures it is running before calling it
- Rust switches indexes before operations on a different database
- update/embed/search can emit progress through the same request path
- if the process dies, Rust can recreate it

### Progress path

Long-running sidecar operations stream progress to Rust, which re-emits Tauri events consumed by the frontend.

Current frontend listener:
- `src/hooks/use-qmd-operation.ts`

Current event-backed UI:
- `src/components/qmd-progress.tsx`

---

## Search model

Ariadne's QMD search UI is index-scoped and sidecar-backed.

### Current search flow

1. frontend calls `qmd_search(index, query, collections?, limit?)`
2. Rust ensures the correct index is open in the sidecar
3. sidecar expands the query
4. sidecar runs search with the expanded queries
5. progress events are emitted during expansion/search
6. the frontend renders:
   - expanded queries
   - timing
   - ranked results
   - explain traces when available

### Current files involved

- frontend API: `src/api/qmd.ts`
- frontend schema: `src/schemas/qmd.ts`
- frontend UI: `src/components/qmd-search-modal.tsx`
- Rust command: `qmd_search` in `src-tauri/src/commands/qmd.rs`
- sidecar search handler: `search` in `src-sidecar/qmd-bridge.ts`

### Important constraint

Search is currently **one index at a time**. There is no cross-index search orchestration in Ariadne today.

---

## File inclusion model

Ariadne's collection file-tree UI is built around the idea that indexed state is a set of active document paths inside one collection.

### Current flow

1. the frontend lazily scans the filesystem for collection-matching files
2. it separately asks for currently indexed document paths
3. it resolves indexed paths against filesystem paths into a tree model
4. the user stages adds/removes
5. Ariadne sends one `qmd_toggle_files()` request with the batch

### Where this logic lives

- scan/indexed-path commands: `src-tauri/src/commands/qmd.rs`
- frontend resolution: `src/lib/qmd-tree.ts`
- toggle-state helpers: `src/lib/toggle-state.ts`
- UI: `src/components/collection-file-tree.tsx`

### Sidecar details that matter

The sidecar re-implements QMD's path normalization behavior via `handelize_path()` so file toggles line up with how QMD stores document paths.

That path normalization is not optional. If it drifts, toggles will silently target the wrong rows or fail to match indexed documents.

---

## QMD logs surface

Ariadne also has a QMD-adjacent observability page at `/qmd/logs`.

This page is **not** powered by the QMD SQLite database.
It is built from pi session logs and shows how agents invoked the QMD CLI during sessions.

### Current backend path

- parser: `src-tauri/src/parser/qmd_logs.rs`
- cache: `src-tauri/src/qmd_log_cache.rs`
- commands: `src-tauri/src/commands/qmd_logs.rs`

### Current frontend path

- API: `src/api/qmd-logs.ts`
- schema: `src/schemas/qmd-logs.ts`
- page: `src/pages/qmd-logs.tsx`
- components: `src/components/qmd-logs/`

### Important distinction

QMD logs tells you **how agents used QMD**.
The QMD index and collection pages tell you **what is in QMD right now**.

Those are related, but they are different sources of truth.

---

## Current storage assumptions

Ariadne currently assumes QMD data is discoverable under the standard cache location.

### Important locations

- indexes: `~/.cache/qmd/*.sqlite`
- default index: `~/.cache/qmd/index.sqlite`
- models: `~/.cache/qmd/models/`

Ariadne's own code does not treat YAML config files as the primary read path. The dashboard reads index state from SQLite and performs mutations through the SDK sidecar.

---

## Important gotchas

### 1. macOS + Bun needs a full SQLite build

`src-sidecar/qmd-bridge.ts` patches Bun SQLite on macOS to use Homebrew SQLite before importing QMD.

Why:
- Apple's system SQLite lacks the extension-loading behavior QMD needs for sqlite-vec

If QMD sidecar startup breaks on macOS, check this path first.

### 2. Keep reads and writes in the right layer

Do not casually move a sidecar-backed operation into direct SQLite mutation just because the table layout looks simple.

The current contract is:
- Rust reads state
- sidecar performs behaviorful operations

### 3. Index switching is stateful

The sidecar has a current open db.
If a new command targets another index, Rust must switch first.

Bugs here usually show up as:
- correct route, wrong data
- mutation/search affecting the previously viewed index

### 4. File toggles depend on path normalization

Collection file toggles are only correct if Ariadne and QMD agree on document-path normalization. `handelize_path()` in the sidecar is load-bearing.

### 5. QMD logs parsing uses tool-call block `id`

In pi session JSONL, the assistant tool-call block uses `id`, while the matching tool-result message uses `toolCallId`. The QMD log parser relies on that pairing.

### 6. QMD CLI detection must handle env-var prefixes

Session bash commands may look like:
- `qmd query ...`
- `cd repo && qmd query ...`
- `BUN_INSTALL="" qmd query ...`

`src-tauri/src/parser/qmd_logs.rs` explicitly handles these forms.

---

## When changing the integration, start here

| Change | Start in |
|---|---|
| Add/remove index fields on dashboards | `src-tauri/src/models/qmd.rs`, `src/schemas/qmd.ts` |
| Change collection/status reads | `src-tauri/src/commands/qmd.rs` |
| Change mutation behavior | `src-sidecar/qmd-bridge.ts` |
| Change sidecar process lifecycle | `src-tauri/src/sidecar.rs` |
| Change search payloads or explain traces | `src-sidecar/qmd-bridge.ts`, `src/schemas/qmd.ts` |
| Change file-tree inclusion behavior | `src/lib/qmd-tree.ts`, `src/lib/toggle-state.ts`, `src/components/collection-file-tree.tsx`, sidecar toggle logic |
| Change QMD logs observability | `src-tauri/src/parser/qmd_logs.rs`, `src-tauri/src/qmd_log_cache.rs`, `src/pages/qmd-logs.tsx` |

---

## Historical note

Earlier planning docs described a shell-out-per-command mutation model. That is **not** Ariadne's current implementation.

Today, Ariadne uses a **long-lived sidecar** for QMD mutations and search.
