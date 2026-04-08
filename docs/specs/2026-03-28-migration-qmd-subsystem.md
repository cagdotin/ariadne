# Migration Spec — QMD Subsystem Rewrite

Status: Draft
Date: 2026-03-28
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

Ariadne’s QMD integration is already hybrid:

- direct SQLite reads in Rust for dashboard/state reads
- a long-lived TypeScript sidecar for mutations, search, progress streaming, and file toggles

The Electron migration must preserve this behavior while removing Tauri/Rust. The main risk is blurring boundaries and accidentally redesigning QMD behavior during the port.

## 2. Goals and non-goals

### 2.1 Goals
- Port direct QMD SQLite read paths to TypeScript.
- Preserve mutation/search/progress behavior currently implemented by the TypeScript bridge.
- Preserve index switching semantics and one-active-bridge behavior.
- Keep QMD work out of Electron main.
- Recommend a safe phase-1 boundary for the current sidecar/bridge.

### 2.2 Non-goals
- Cross-index search redesign.
- Replacing the QMD SDK with direct custom SQL mutation logic.
- Redesigning QMD page UX.
- Collapsing all QMD behavior into one process before parity is proven.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/commands/qmd.rs`
- `src-tauri/src/sidecar.rs`
- `src-tauri/src/models/qmd.rs`
- `src-sidecar/qmd-bridge.ts`
- `src/api/qmd.ts`
- `src/schemas/qmd.ts`
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`
- `src/pages/qmd.tsx`
- `src/pages/qmd-collection.tsx`
- `src/lib/qmd-tree.ts`
- `docs/knowledge/qmd.md`
- `docs/ARCHITECTURE.md`

### 3.2 Current behavior to preserve
- `default` maps to `index.sqlite`
- index names are validated and reserved names are blocked
- Rust performs read-only SQLite queries for indexes/status/collections/documents/indexed paths
- one long-lived sidecar process is managed at a time
- sidecar switches indexes with `switch_index`
- update/embed/search emit progress events consumed by the current renderer
- file toggles depend on `handelize_path()` matching QMD’s internal normalization

## 4. Conventions and style

Recommended target modules:

```text
backend/qmd/
  index-paths.ts
  sqlite-read-service.ts
  bridge/
    qmd-bridge.ts
    bridge-client.ts
    bridge-supervisor.ts
  commands/
    indexes.ts
    collections.ts
    mutations.ts
    search.ts
    files.ts
```

Design rule:
- keep read-path code separate from bridge-backed behavior
- keep bridge supervision separate from bridge method implementations

## 5. Domain model

### 5.1 Command groups

#### Read-path commands
- `qmd_list_indexes`
- `qmd_check_availability`
- `qmd_get_status`
- `qmd_list_collections`
- `qmd_get_collection_detail`
- `qmd_get_indexed_paths`
- `qmd_get_collection_documents` (currently registered even if not used broadly)

#### Bridge-backed commands
- `qmd_create_index`
- `qmd_add_collection`
- `qmd_remove_collection`
- `qmd_rename_collection`
- `qmd_add_context`
- `qmd_remove_context`
- `qmd_set_global_context`
- `qmd_reindex`
- `qmd_embed`
- `qmd_cleanup`
- `qmd_scan_filesystem`
- `qmd_toggle_files`
- `qmd_search`

#### Direct fs commands today
- `qmd_delete_index`
- `qmd_rename_index`

### 5.2 Recommended phase-1 boundary
Preserve a dedicated internal QMD bridge child process inside the new backend service.

Reasoning:
- it is already TypeScript and already isolates QMD SDK/native behavior
- it contains non-trivial lifecycle logic and progress streaming behavior worth preserving first
- it keeps search/update/embed memory pressure and failure modes separate from analytics/QMD-read logic

## 6. Detailed design

### 6.1 Contract changes
**No contract changes** in phase 1.

### 6.2 Direct SQLite read-path rewrite
Port current SQLite queries into a TypeScript read service using a stable SQLite client appropriate for Node/Electron packaging.

Read-path requirements to preserve:
- cache-root resolution and `default` index mapping
- index discovery under the QMD cache dir
- read-only query posture for dashboard/state reads
- collection context parsing
- ignore-pattern parsing fallback rules
- last-modified/stat fields used by the UI

Migration note:
- keep the SQL as close as possible to current Rust queries before considering refactors

### 6.3 Bridge orchestration rewrite
The current Rust `QmdSidecar` owns:
- process spawn
- ping health check
- index switching
- request IDs
- progress forwarding
- shutdown

Port that behavior into a Node-side `bridge-supervisor.ts` with equivalent responsibilities.

Important parity rules:
- one active bridge process at a time
- explicit `ensure_running`
- explicit `ensure_index`
- progress events remain request-correlated and forward to the renderer using current channel names

### 6.4 Search/progress flow
Current QMD search is observable, not just result-returning.

Preserve:
- query expansion stage
- search stage
- expanded query payloads
- timing object
- explain traces in results
- progress event publication on `qmd:search-progress`

### 6.5 File toggle path
Preserve current staged-toggle model:
- filesystem scan is bridge-backed
- indexed paths are SQLite-read-backed
- frontend resolves tree structure and staged changes
- backend sends one toggle batch with adds/removes

Critical parity trap:
- `handelize_path()` must remain behavior-identical or toggles will silently drift

### 6.6 Index switching and concurrency concerns
Current design assumes **one active index in the bridge at a time**.

Phase-1 recommendation:
- keep that invariant
- serialize bridge requests that mutate or depend on the active index
- make index switch explicit inside the bridge supervisor
- do not attempt concurrent multi-index bridge work in phase 1

Why this matters:
- search/update/embed requests can race with index switches
- hidden multi-index concurrency would create hard-to-debug semantic drift

### 6.7 Current sidecar: retain temporarily or absorb?
Recommendation: **retain as a dedicated bridge process for phase 1**.

Absorb later only if all of these become true:
- parity is already proven
- QMD SDK runtime behavior is stable under the backend service process
- crash isolation and memory footprint remain acceptable
- bridge process management is clearly more complex than beneficial

### 6.8 Fixture/parity approach
Must cover:
- index list/status/collection read parity from fixture SQLite files
- create/delete/rename index semantics, including reserved-name behavior
- add/remove/rename collection behavior
- context add/remove/global context behavior
- update/embed/search progress payloads
- filesystem scan/toggle behavior against small deterministic fixture trees

### 6.9 Semantic drift traps
1. `qmd_delete_index()` and `qmd_rename_index()` currently manipulate SQLite/WAL/SHM files directly.
2. `qmd_check_availability()` checks both CLI installation and default DB presence.
3. search is index-scoped and not cross-index.
4. create-index name validation is already product behavior.
5. collection detail and index page read-paths intentionally do not pay bridge cost.
6. macOS Bun/Homebrew SQLite patching in the current bridge is load-bearing for QMD.

## 7. Error handling and failure modes

- missing indexes should return explicit not-found errors
- bridge startup failures should not break read-only QMD pages if SQLite reads can still succeed
- bridge crash should fail in-flight mutating/search requests and require supervised restart
- filesystem scan/toggle failures should preserve current UI-level error surfacing
- search progress failures must not hang the modal in a permanent loading state

## 8. Security and safety considerations

- keep QMD bridge internal to the backend service, not directly exposed to renderer
- preserve explicit index/path validation before destructive fs operations
- do not introduce arbitrary shell-outs for operations already handled by the bridge/SDK

## 9. Testing strategy

### 9.1 Unit tests
- index-name/path resolution
- reserved-name validation
- ignore/context parsing
- `handelize_path()` parity tests
- bridge supervisor state transitions

### 9.2 Integration/parity tests
- SQLite read outputs vs current Tauri behavior
- bridge-backed mutation/search outputs vs current bridge behavior
- progress event parity for update/embed/search
- file-toggle parity using deterministic fixture trees

## 10. Implementation checklist
- [ ] Port index-path and read-only SQLite logic.
- [ ] Port bridge supervisor/runtime protocol.
- [ ] Preserve current bridge method behavior with minimal semantic change.
- [ ] Preserve progress event names/payloads.
- [ ] Add fixture DBs and fixture file trees for parity runs.
- [ ] Cut over QMD commands only after both read and bridge paths pass parity.

## 11. Rollout / cutover notes

- Read-path and bridge-path migration can be developed together but should be validated separately.
- If needed, QMD can temporarily remain on the old bridge implementation while other subsystems port, as long as ownership remains behind the new backend service boundary.
- Do not remove the current `src-sidecar/qmd-bridge.ts` reference until the new bridge path is proven in packaged Electron builds.

## 12. Dependencies and parallelization

### Depends on
- contract freeze/parity harness
- backend process architecture skeleton

### Can proceed in parallel with
- analytics/session backend port
- QMD logs backend port
- provider limits backend port
- Electron shell work

### Must not run in parallel with
- another agent changing QMD contract/event definitions
- preload event redesign that changes search/update/embed channel behavior

## 13. Open questions
- Which Node/Electron-compatible SQLite library should back the read path while preserving packaged-app reliability and typed access?
- Should bridge requests be strictly serialized globally in phase 1, or only serialized per active-index-dependent operation?
