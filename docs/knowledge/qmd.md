# QMD — Knowledge Base Integration

Status: active  
Last updated: 2026-04-08

This document describes Ariadne's current QMD integration.

It is the reference for:
- what Ariadne assumes about QMD
- how reads, writes, search, and file toggles work today
- where the backend / bridge boundary lives
- what is important when changing the integration

For page-level navigation, see `docs/information-architecture.md`. For the current system map, see `docs/ARCHITECTURE.md`.

---

## What QMD is in Ariadne

QMD is the markdown knowledge-base engine Ariadne integrates with.

In Ariadne today, QMD provides:
- named indexes backed by SQLite databases
- collections with path/pattern/context metadata
- hybrid search over indexed content
- embed / reindex / cleanup operations
- file-level inclusion control inside a collection

Ariadne adds:
- a GUI for index and collection management
- a GUI for hybrid search
- progress-aware long-running operations
- file-tree inclusion controls
- a separate `/qmd/logs` page for observing QMD CLI usage in agent sessions

---

## Current integration model

Ariadne uses a hybrid QMD backend.

### Reads: backend SQLite access

Dashboard-like QMD reads come from direct SQLite access in:
- `backend/qmd/sqlite-read-service.ts`

This powers:
- index discovery
- index status
- collection listings
- collection detail
- indexed document paths

### Writes and search: managed QMD bridge process

Mutation and search operations go through a long-lived bridge process:
- create / delete / rename index
- add / remove / rename collection
- add / remove context
- set global context
- reindex
- embed
- cleanup
- filesystem scan
- file toggles
- hybrid search

This path lives in:
- `backend/qmd/bridge/bridge-supervisor.ts`
- `backend/qmd/bridge/bridge-client.ts`
- `backend/qmd/commands/`
- `src-sidecar/qmd-bridge.ts`

### Why the split exists

SQLite reads are simple and fast for status screens.
The QMD SDK remains the authoritative behaviorful path for writes and search, so Ariadne keeps those operations in the bridge rather than re-implementing them as ad hoc shell commands.

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
- one bridge process is reused across indexes
- the bridge switches indexes with `switch_index`
- the last visited index is stored in `ariadne:qmd:last-index`

### Important constraint

Index selection is:
- **route state** in the frontend
- **opened-db state** in the bridge

Those two must stay aligned.

---

## Collection model

A collection is a named filesystem-backed slice of one QMD index.

Ariadne currently surfaces:
- `name`
- `path`
- `pattern`
- `ignore_patterns`
- `include_by_default`
- `update_command`
- per-path contexts
- document and embedded counts

### Current collection flows

On the index page (`/qmd/:index`) Ariadne supports:
- listing collections
- adding a collection
- editing global context
- running index-wide update / embed / cleanup

On the collection page (`/qmd/:index/:collection`) Ariadne supports:
- viewing collection settings
- editing per-path context
- scanning the collection filesystem
- viewing indexed paths
- toggling files and folders in or out of the index

---

## Backend QMD modules

### Path and index helpers

Start with:
- `backend/qmd/index-paths.ts`
- `backend/qmd/commands/indexes.ts`

These own:
- QMD cache-root resolution
- index-name validation
- default-index special cases
- file rename/delete behavior for SQLite databases and side files

### SQLite read service

Start with:
- `backend/qmd/sqlite-read-service.ts`

This owns:
- index listing
- status calculations
- collection/detail queries
- indexed-path reads
- availability checks

### Bridge supervision

Start with:
- `backend/qmd/bridge/bridge-supervisor.ts`
- `backend/qmd/bridge/bridge-client.ts`

This owns:
- process lifecycle
- request/response correlation
- progress forwarding
- active-index switching

### Command wiring

Start with:
- `backend/qmd/commands.ts`
- `backend/qmd/commands/mutations.ts`
- `backend/qmd/commands/search.ts`
- `backend/qmd/commands/files.ts`

This owns the backend request-router surface exposed to the renderer.

---

## Bridge model

The bridge is a long-lived JSON-RPC process implemented in `src-sidecar/qmd-bridge.ts`.

### Responsibilities

It wraps the QMD SDK and owns the behaviorful parts of the integration:
- index switching
- collection/context mutations
- reindex / embed / cleanup
- filesystem scanning and file toggles
- hybrid search and progress emission

### Process rules

- Ariadne keeps **one bridge process** at a time
- the backend ensures it is running before calling it
- the backend switches indexes before operations on a different database
- update / embed / search can emit progress through the same request path
- if the process dies, the backend can recreate it

### Progress path

Long-running bridge operations stream progress to the backend event bus, which is forwarded through Electron main to renderer listeners.

Current frontend listeners:
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`

Current event names:
- `qmd:update-progress`
- `qmd:embed-progress`
- `qmd:search-progress`

---

## Search model

Ariadne's QMD search UI is index-scoped and bridge-backed.

### Current search flow

1. frontend calls `qmd_search(index, query, collections?, limit?)`
2. backend ensures the correct index is open in the bridge
3. bridge expands the query
4. bridge runs the search
5. progress events are emitted during expansion/search
6. the frontend renders expanded queries, timing, and ranked results

### Current files involved

- frontend API: `src/api/qmd.ts`
- frontend UI: `src/components/qmd-search-modal.tsx`
- backend command: `backend/qmd/commands/search.ts`
- bridge handler: `src-sidecar/qmd-bridge.ts`

### Important constraint

Search is currently **one index at a time**. Ariadne does not orchestrate cross-index search.

---

## File inclusion model

Ariadne's collection file-tree UI treats indexed state as a set of active document paths inside one collection.

### Current flow

1. the frontend lazily scans the collection filesystem
2. it separately asks for currently indexed document paths
3. it resolves indexed state against filesystem paths into a tree model
4. the user stages adds/removes
5. Ariadne sends one `qmd_toggle_files()` request with the batch

### Where the logic lives

- backend file commands: `backend/qmd/commands/files.ts`
- frontend resolution: `src/lib/qmd-tree.ts`
- collection UI: `src/components/collection-file-tree.tsx`

### Important constraint

Filesystem scan is intentionally lazy because it can be expensive for large repos.

---

## Availability and environment assumptions

Ariadne assumes:
- QMD indexes live under `~/.cache/qmd` unless overridden by `ARIADNE_QMD_CACHE_ROOT`
- the bridge can run the QMD SDK from `src-sidecar/`
- the QMD CLI may or may not be installed on the operator machine

### Availability check

`qmd_check_availability()` verifies:
- whether the `qmd` binary is available on `PATH`
- whether the default QMD DB exists

This is a UX-level availability signal, not a full health proof for every bridge-backed operation.

---

## QMD logs relationship

Ariadne's `/qmd/logs` route is **not** backed by QMD's database.

It is a separate observability feature that parses pi session logs for QMD CLI invocations.

That path lives in:
- `backend/qmd-logs/parser.ts`
- `backend/qmd-logs/cache.ts`
- `backend/qmd-logs/commands.ts`

This distinction matters:
- QMD pages show the knowledge base state
- QMD Logs shows how agents used QMD during sessions

---

## Current invariants

1. **QMD reads and QMD mutations are intentionally split.** Do not casually collapse them.
2. **There is one active bridge process at a time.** Index switching happens inside that process.
3. **Index route state and bridge-opened index must stay aligned.**
4. **Search, embed, and reindex rely on progress events.** Preserve channel names and payload shapes.
5. **Collection file controls are lazy.** Do not make every collection page do an eager full filesystem walk.
6. **QMD logs is a separate subsystem.** Do not couple it to QMD status loading.

---

## Where to start for common QMD changes

| Task | Start here |
|---|---|
| Change index-name validation or cache-root logic | `backend/qmd/index-paths.ts` |
| Change status/collection/detail reads | `backend/qmd/sqlite-read-service.ts` |
| Change bridge process lifecycle | `backend/qmd/bridge/bridge-supervisor.ts`, `backend/qmd/bridge/bridge-client.ts` |
| Change mutations or file toggles | `backend/qmd/commands/mutations.ts`, `backend/qmd/commands/files.ts` |
| Change search behavior or progress mapping | `backend/qmd/commands/search.ts`, `src-sidecar/qmd-bridge.ts` |
| Change renderer-side QMD API wrappers | `src/api/qmd.ts` |
| Change QMD UI state or pages | `src/pages/qmd.tsx`, `src/pages/qmd-collection.tsx`, matching components |
| Change QMD logs observability | `backend/qmd-logs/*`, `src/pages/qmd-logs.tsx` |
