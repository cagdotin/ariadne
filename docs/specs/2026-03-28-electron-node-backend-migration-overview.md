# Electron + TypeScript Backend Migration Overview

Status: Approved
Date: 2026-03-28
Approved: 2026-04-08
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`

## 1. Problem statement

Ariadne currently ships as a Tauri v2 desktop app with a Rust backend plus a TypeScript QMD sidecar. That split was a sensible first implementation, but it now creates a long-term maintenance cost for agent-driven work:

- backend behavior is spread across Rust (`src-tauri/src/`) and TypeScript (`src-sidecar/`)
- renderer contracts are defined in TypeScript/Zod, but the backend source of truth is Rust structs and Tauri commands
- the heaviest product logic lives in a language/runtime combination that most coding agents in this repo cannot iterate on as confidently as TypeScript
- QMD already needs a separate TypeScript process, so Ariadne currently spans three meaningful runtime surfaces: renderer, Rust backend, and sidecar

The migration goal is **not** to redesign Ariadne. It is to perform a **contract-preserving backend rewrite** from:

- Tauri + Rust backend + TypeScript sidecar

into:

- Electron shell + Node/TypeScript backend

while preserving current product behavior across:

- Overview analytics
- Sessions list and replay
- Usage workspace
- QMD index / collection management
- QMD logs observability
- Provider limits

The migration must stay agent-friendly: explicit boundaries, small write scopes, incremental cutover, strong parity checks, and shared TypeScript/Zod contracts across renderer, preload, and backend.

## 2. Goals and non-goals

### 2.1 Goals
- Preserve current user-visible behavior before introducing architecture improvements.
- Freeze the current API/event/dialog contract and make parity testable.
- Replace Rust backend responsibilities with TypeScript modules that are easier for coding agents to own.
- Keep **Electron main thin** and avoid moving analytics/QMD heavy work into the main process.
- Establish shared TypeScript/Zod contracts for renderer, preload, and backend.
- Keep renderer changes intentionally small and explicit.
- Support incremental subsystem cutover with rollback points.
- Create a planning package that can be split across multiple implementation agents safely.

### 2.2 Non-goals
- Reworking page information architecture during the migration.
- Redesigning analytics semantics, QMD semantics, or provider-limit semantics as part of the port.
- Replacing the current TanStack Router / React app structure.
- Adding new product surfaces while the migration is in flight.
- Folding every process into Electron main.
- Removing the current QMD SDK isolation boundary until parity is proven.

## 3. System context

### 3.1 Current repo shape
Relevant runtime code is split across:

- `src/` — React renderer
- `src/api/` — frontend IPC wrappers around Tauri `invoke()`
- `src/schemas/` — Zod validation for most backend payloads
- `src/components/` + `src/pages/` — route UI and direct Tauri event/dialog consumers
- `src-tauri/src/` — Rust backend, commands, analytics cache, parsers, QMD SQLite reads, QMD log cache, provider limits
- `src-sidecar/qmd-bridge.ts` — long-lived TypeScript QMD SDK bridge

### 3.2 Current renderer-to-backend contract surface
Current typed wrapper files:

- `src/api/analytics.ts`
- `src/api/qmd.ts`
- `src/api/qmd-logs.ts`
- `src/api/provider-limits.ts`

Current direct non-wrapper Tauri usage:

- `src/components/add-collection-dialog.tsx` → `@tauri-apps/plugin-dialog.open()`
- `src/hooks/use-qmd-operation.ts` → `listen("qmd:update-progress")`, `listen("qmd:embed-progress")`
- `src/components/qmd-search-modal.tsx` → `listen("qmd:search-progress")`

Current unvalidated response surface:

- `get_session_entries()` returns raw session JSON values typed only by `src/components/session-viewer/types.ts`

### 3.3 Current backend responsibilities
The Rust backend currently owns:

- session discovery (`src-tauri/src/parser/discovery.rs`)
- session parsing (`src-tauri/src/parser/session.rs`)
- analytics aggregation and filtering (`src-tauri/src/cache.rs`)
- session replay entry loading (`get_session_entries()`)
- direct QMD SQLite reads (`src-tauri/src/commands/qmd.rs`)
- QMD sidecar orchestration (`src-tauri/src/sidecar.rs`)
- QMD logs parsing and caching (`src-tauri/src/parser/qmd_logs.rs`, `src-tauri/src/qmd_log_cache.rs`)
- provider limits (`src-tauri/src/provider_limits/`)

### 3.4 Migration thesis
The recommended target is a four-layer runtime:

```text
React renderer
  -> typed renderer adapters (src/api + platform wrappers)
  -> preload API (minimal, explicit, validated)
  -> Electron main shell/supervisor
  -> dedicated Node/TypeScript backend service
       -> worker threads for CPU-heavy parsing/aggregation
       -> internal QMD bridge child for SDK-native mutation/search work
```

Key decisions:

1. **Electron main stays thin.** It owns windows, lifecycle, dialog bridging, backend supervision, and event fan-out — not analytics math.
2. **A dedicated backend service process is the primary replacement for Rust.** This creates a clear ownership boundary and restartable backend runtime.
3. **Worker threads handle CPU-heavy parsing and aggregation.** Session parsing and QMD-log extraction should not block either Electron main or the backend service event loop.
4. **QMD SDK work remains isolated initially.** The current TypeScript sidecar behavior should be preserved behind a Node-managed bridge before any attempt to absorb it.
5. **Shared Zod contracts become the stable boundary.** Renderer, preload, Electron main, backend service, fixtures, and parity harness all share the same contract definitions.

## 4. Conventions and style

### 4.1 Proposed target directories
Add new runtime surfaces without destabilizing the current renderer:

```text
contracts/                  shared Zod contracts, event payloads, channel names
backend/                    Node/TypeScript backend service
backend/analytics/
backend/qmd/
backend/qmd-logs/
backend/provider-limits/
backend/runtime/
backend/workers/
electron/
electron/main/
electron/preload/
```

Keep existing directories during migration:

- `src/` remains the renderer
- `src-tauri/` remains the parity reference until final removal
- `src-sidecar/` remains the reference implementation for QMD SDK behavior until QMD cutover is complete

### 4.2 Shared contract location
Shared contracts should live in **`contracts/`**, not under `src/`, so they are neutral across renderer, preload, Electron main, backend, and test harnesses.

Recommended modules:

- `contracts/commands/*.ts` — request/response schemas per command family
- `contracts/events/*.ts` — progress and push event schemas
- `contracts/dialog.ts` — dialog request/response contracts
- `contracts/channels.ts` — stable IPC channel names
- `contracts/index.ts` — public exports

### 4.3 Preserve frontend API shape first
During migration, the renderer should keep its current mental model:

- `src/api/*.ts` remains the high-level API surface
- direct Tauri imports are replaced with repo-local platform adapters
- preload exposes minimal capabilities rather than a generic `invoke(any)` pipe

## 5. Domain model

### 5.1 Stable product subsystems
The migration should treat these as separate contract domains:

1. **Analytics + sessions**
   - list projects
   - analytics overview
   - sessions list/detail
   - tool detail
   - file stats
   - time breakdown
   - raw session entries

2. **QMD management**
   - index list/create/delete/rename
   - status/collection/detail reads
   - collection/context mutations
   - reindex/embed/cleanup/search
   - filesystem scan / indexed paths / toggle files

3. **QMD logs**
   - logs list
   - log stats

4. **Provider limits**
   - current limits snapshot
   - explicit refresh

5. **Desktop shell capabilities**
   - folder picker dialog
   - progress event subscription
   - app lifecycle + backend supervision

### 5.2 Migration boundary model
There are three boundaries to stabilize before broad implementation parallelism:

1. **Contract boundary** — renderer/preload/backend payloads and event shapes
2. **Shell boundary** — what Electron main/preload own vs what backend owns
3. **Subsystem boundary** — which backend module owns analytics vs QMD vs QMD logs vs provider limits

## 6. Detailed design

## 6.1 Subsystem map

### Renderer-owned
- route/layout behavior in `src/`
- existing page composition and UI state
- Zod validation at the renderer edge
- session viewer rendering logic

### Preload-owned
- typed desktop API exposed to renderer
- event subscribe/unsubscribe bridge
- dialog bridge
- no filesystem parsing or business logic

### Electron main-owned
- app/window lifecycle
- backend service spawn/restart/shutdown
- preload registration
- secure IPC routing between renderer/preload and backend
- event fan-out from backend to renderer channels

### Backend service-owned
- all command handling currently in `src-tauri/src/commands/*`
- analytics/session parsing and aggregation
- session replay entry loading
- QMD direct SQLite reads
- QMD SDK orchestration
- QMD logs parsing/cache
- provider limits adapters/cache

### Worker-owned inside backend service
- session discovery + parse batches
- analytics cache builds/resyncs
- QMD log extraction builds
- large replay shaping if later required

### Still-isolated child process initially
- QMD SDK bridge currently represented by `src-sidecar/qmd-bridge.ts`

## 6.2 Recommended backend process architecture

### Option A — put everything in Electron main
Reject.

Why:
- `SessionCache::resync()` is currently full-file discovery + parse work.
- QMD log cache builds also parse all sessions.
- QMD search/update/embed can be long-running and emit progress.
- Provider limit probes and SQLite work would further increase contention.
- Crash blast radius becomes the whole desktop shell.

### Option B — Electron main + worker threads only
Not recommended as the primary architecture.

Why:
- it keeps backend ownership mixed into shell code
- preload and backend contract work would still collide in one runtime surface
- restart semantics are weaker
- agent write scopes are broader and conflict-prone

### Option C — dedicated backend service process + worker threads + internal QMD bridge
Recommended.

Why:
- strong shell/backend separation
- easier to reason about for agents
- restartable backend without restarting windows
- backend can own its own worker pool and caches
- QMD bridge can remain isolated inside the backend without involving Electron main in QMD details

Recommended implementation shape:

```text
Electron main
  forks backend/index.ts
    backend runtime routes request/response envelopes
    analytics + qmd-logs use worker_threads
    qmd read path stays in backend process
    qmd SDK write/search path stays in dedicated internal bridge child
```

### Transport recommendation
Use structured request/response envelopes over Node child-process IPC for the backend service.

Why:
- no localhost HTTP server or auth surface
- request cancellation can be modeled explicitly later
- event forwarding remains internal to the app
- Electron main/preload can preserve current command/event semantics without exposing backend transport details to the renderer

## 6.3 Dependency graph / ordering

```text
A0 Architecture approval + repo layout
  -> A1 Contract freeze + parity harness
     -> A2 Preload and platform wrapper design
     -> A3 Backend service runtime skeleton
        -> A4 Analytics/session port
        -> A5 QMD port
        -> A6 QMD logs port
        -> A7 Provider limits port
           -> A8 Electron packaging + dev workflow
              -> A9 Cutover + Tauri removal
```

Hard dependencies:

- **A1 must precede parallel backend ports.** Otherwise multiple agents will redefine payloads independently.
- **A2 and A3 must settle the shell/backend boundary before renderer integration agents start replacing Tauri usage.**
- **A9 cannot begin before parity evidence exists for A4–A7.**

## 6.4 Parallelization plan

### Safe parallel work after A1 + A3 land

#### Stream P1 — Electron shell + preload
Owns:
- `electron/main/**`
- `electron/preload/**`
- renderer platform adapters under a new `src/platform/**`

Can rely on:
- frozen contract schemas in `contracts/**`
- backend request envelope from A3

Must not edit:
- backend subsystem semantics
- shared contract payload definitions except through agreed additive changes

#### Stream P2 — Analytics/session backend port
Owns:
- `backend/analytics/**`
- `backend/workers/session-*.ts`
- analytics parity fixtures under dedicated analytics fixture paths

Can rely on:
- frozen analytics/session contracts
- backend runtime skeleton

#### Stream P3 — QMD backend port
Owns:
- `backend/qmd/**`
- migrated/internalized QMD bridge code
- QMD fixture bundle

Can rely on:
- frozen QMD contracts and event payloads
- backend runtime skeleton

#### Stream P4 — QMD logs backend port
Owns:
- `backend/qmd-logs/**`
- QMD log fixture bundle

Can rely on:
- frozen QMD-log contracts
- backend runtime skeleton
- existing analytics fixture roots for session-source data, but not analytics implementation files

#### Stream P5 — Provider limits backend port
Owns:
- `backend/provider-limits/**`
- provider-limit fixture transcripts

Can rely on:
- frozen provider-limit contracts
- backend runtime skeleton

#### Stream P6 — Packaging/build/cutover research
Owns:
- Electron build scripts/config
- release packaging config
- migration flags and packaging docs

Can rely on:
- architecture decisions from A0/A3
- provisional backend entry path

### Why these streams are safe
- write scopes are distinct
- shared contracts are frozen first
- main-process logic stays thin and separately owned
- subsystem semantics remain isolated behind dedicated backend modules

## 6.5 Non-parallelization plan

Do **not** parallelize these without explicit coordination:

1. **Shared contract edits**
   - `contracts/**`
   - `src/api/**`
   - `src/schemas/**`

2. **Direct renderer Tauri replacement before preload API settles**
   - `src/components/add-collection-dialog.tsx`
   - `src/hooks/use-qmd-operation.ts`
   - `src/components/qmd-search-modal.tsx`

3. **Final cutover/removal work**
   - removing `src-tauri/`
   - deleting Tauri packages/config
   - changing default app entry from Tauri to Electron

4. **QMD contract redesign and QMD shell integration at the same time**
   - QMD has both request/response and event-stream contracts; these must be stabilized before simultaneous renderer and backend edits.

## 6.6 Hidden risks and semantic drift traps

1. **`get_session_entries()` is not Zod-validated today.** Raw session replay payloads can drift silently unless they are explicitly frozen and fixture-tested.
2. **Direct Tauri imports exist outside `src/api/`.** Migration cannot stop at replacing `invoke()` wrappers.
3. **Current analytics semantics use local timezone conversion.** Golden outputs must run in a pinned timezone or compare normalized values.
4. **`discover_session_files()` uses home-directory resolution directly.** Parity harness needs fixture-root injection rather than real-machine home paths.
5. **`resync_sessions()` currently invalidates QMD log cache too.** That cross-subsystem behavior must be preserved.
6. **QMD event payloads currently preserve camelCase fields from sidecar progress.** Preload/backend event transport must keep those payload shapes unless the renderer is intentionally updated.
7. **QMD index identity rules are already product behavior.** `default` ↔ `index.sqlite`, reserved names, and rename/delete restrictions must stay stable.
8. **The provider limits subsystem already exists and has its own polling/freshness semantics.** Migration should port behavior, not reinterpret it.
9. **The sync button triggers a full window reload on purpose.** Project-scope validation currently depends on full app re-init after resync.

## 6.7 Risk register

| Risk | Impact | Likelihood | Mitigation | Owner stream |
|---|---|---:|---|---|
| Contract drift across parallel subsystem ports | High | High | Freeze contracts and goldens before broad implementation | Contract freeze |
| Electron main becomes a backend dumping ground | High | Medium | Enforce thin-main guardrails and separate backend process ownership | Shell/runtime |
| Analytics parity regressions in filtering, timezone bucketing, or replay payloads | High | High | Fixture roots, golden tests, shared filter helpers, replay-specific parity cases | Analytics |
| QMD write/search behavior changes during port | High | High | Preserve dedicated bridge boundary in phase 1 and port method-for-method first | QMD |
| QMD progress events drift from current payloads | Medium | Medium | Freeze event schemas and preserve channel names/payload casing | Contract freeze + shell |
| QMD logs get recoupled to analytics startup path | Medium | Medium | Preserve dedicated lazy cache and separate worker build path | QMD logs |
| Provider-limit freshness/source semantics drift | Medium | Medium | Use transcript fixtures for success/fallback/stale/error cases | Provider limits |
| Packaged Electron app cannot locate backend/QMD bridge assets | High | Medium | Centralize dev/prod path resolution and add packaged smoke tests early | Packaging |
| Tauri is removed before Electron parity is proven | High | Medium | Enforce explicit Tauri-removal gate in packaging/cutover plan | Packaging + leads |

## 7. Error handling and failure modes

- Backend service crash should surface as a shell-visible degraded state, not a renderer hang.
- Preload should reject unknown/invalid payloads before the renderer consumes them.
- Backend command handlers should keep current failure philosophy where possible: best-effort parse skips for malformed session lines, explicit errors for unavailable QMD/provider operations.
- Progress events should be fire-and-forget; missing listeners must not fail the underlying operation.
- During cutover, dual-runtime parity checks should fail closed and block Tauri removal.

## 8. Security and safety considerations

- Keep `contextIsolation: true` and `nodeIntegration: false`.
- Prefer `sandbox: true` unless a specific preload/backend bridge constraint blocks it; if disabled, document exactly why.
- Expose only named preload methods/events, not a generic unrestricted eval/invoke bridge.
- Do not expose the backend service over an unauthenticated localhost port as the primary transport.
- Treat session-derived text, QMD output, and provider CLI output as untrusted content.
- Preserve Ariadne’s read-only stance toward pi session logs.

## 9. Testing strategy

### 9.1 Parity strategy
- Build a fixture-driven parity harness that can execute current Tauri behavior and new Node backend behavior against the same inputs.
- Freeze command responses, progress event payloads, and dialog adapter behavior before the big port starts.
- Require per-subsystem golden fixtures before marking the subsystem ready for cutover.

### 9.2 Validation layers
- unit tests for pure parsers/normalizers
- integration tests for backend command modules against fixture roots
- end-to-end desktop smoke tests for renderer ↔ preload ↔ backend flows
- dual-runtime parity tests for contract-preserving commands

## 10. Implementation checklist
- [ ] Approve target architecture: Electron main + dedicated backend service + worker threads + initial QMD bridge isolation.
- [ ] Create shared contract layer under `contracts/`.
- [ ] Freeze current command/event/dialog contracts and add fixture-driven parity harness.
- [ ] Add renderer platform adapters so the renderer no longer imports Tauri directly.
- [ ] Build Electron shell + preload with thin main-process responsibilities.
- [ ] Build backend runtime skeleton and request/event transport.
- [ ] Port analytics/session backend with parity fixtures.
- [ ] Port QMD subsystem with preserved read/write/search/event semantics.
- [ ] Port QMD logs backend with preserved parsing/filtering semantics.
- [ ] Port provider limits backend with preserved freshness/source semantics.
- [ ] Add Electron build/package workflow and staged cutover controls.
- [ ] Remove Tauri only after parity checklist passes.

## 11. Spec backlog

1. `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md`
2. `docs/specs/2026-03-28-migration-electron-shell-and-preload.md`
3. `docs/specs/2026-03-28-migration-backend-process-architecture.md`
4. `docs/specs/2026-03-28-migration-analytics-session-backend.md`
5. `docs/specs/2026-03-28-migration-qmd-subsystem.md`
6. `docs/specs/2026-03-28-migration-qmd-logs-observability.md`
7. `docs/specs/2026-03-28-migration-provider-limits-backend.md`
8. `docs/specs/2026-03-28-migration-packaging-build-and-cutover.md`

## 12. Resolved decisions

The following were approved on 2026-04-08:

1. **Repo layout:** `contracts/`, `backend/`, and `electron/` are the new runtime roots.
2. **Backend transport:** child-process IPC using structured envelopes. No localhost HTTP server.
3. **Process spawning:** `child_process.fork()` over Electron `utilityProcess` — simpler, more portable, agent-friendly.
4. **QMD isolation:** preserve a dedicated QMD bridge child for phase 1. Do not absorb QMD SDK into the backend process yet.
5. **Preload API shape:** grouped namespaces (`window.ariadne.commands.analytics.get_overview`) for deep module structure with clear APIs.
6. **Sandbox mode:** `sandbox: true` from the start. Build secure by default.
7. **Request cancellation:** deferred. Not needed now; correlation IDs in the protocol reserve the option for later.
8. **Replay entry validation:** start permissive (`z.unknown()`-heavy) to preserve current behavior. Strict typing is a tracked follow-up (see `contracts/replay/session-entry.ts` TODO).
9. **Parity harness:** two separate runners with shared golden files. Tauri goldens are recorded once, Node backend compares against them. Parity tests are removed after migration completes.

### Standing defaults
- Use a dedicated backend service process.
- Keep Electron main thin.
- Freeze contracts before subsystem ports.
- Preserve QMD bridge isolation initially.
- Do not remove Tauri until dual-runtime parity checks pass.

### All architecture decisions resolved
All open questions from the original spec have been approved as of 2026-04-08. See also the packaging spec for `electron-builder` and separate-scripts decisions.
