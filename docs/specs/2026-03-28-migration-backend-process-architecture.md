# Migration Spec — Backend Process Architecture

Status: Approved
Date: 2026-03-28
Approved: 2026-04-08
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

Ariadne’s current backend work is split between a Rust/Tauri backend and a TypeScript QMD sidecar. The Electron migration needs a new runtime topology that preserves behavior without flattening heavy work into Electron main.

The central architectural question is: **where should Ariadne’s backend logic live after the migration?**

The answer affects:
- responsiveness of the desktop shell
- crash isolation
- how progress events flow back to the renderer
- how coding agents split work safely
- whether the current QMD sidecar boundary survives phase 1

## 2. Goals and non-goals

### 2.1 Goals
- Choose a repo-specific backend runtime shape for Electron.
- Keep Electron main thin.
- Isolate heavy parsing and long-running work from the shell thread.
- Define startup, shutdown, logging, request routing, and event propagation.
- Define which work belongs in the backend process vs worker threads vs an internal child bridge.

### 2.2 Non-goals
- Porting subsystem semantics in this spec.
- Selecting the final packaging tool.
- Introducing a networked microservice model.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/lib.rs`
- `src-tauri/src/cache.rs`
- `src-tauri/src/sidecar.rs`
- `src-tauri/src/qmd_log_cache.rs`
- `src-tauri/src/provider_limits/cache.rs`
- `src-sidecar/qmd-bridge.ts`
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/knowledge/qmd.md`

### 3.2 Current runtime observations
- analytics cache builds parse all session files synchronously inside Rust async command handlers
- QMD log cache is intentionally separate and lazily initialized
- QMD write/search behavior already lives in a separate long-lived TypeScript process
- provider limits already have cache semantics distinct from session analytics
- the renderer depends on progress events for update/embed/search flows

## 4. Conventions and style

Recommended backend runtime roots:

```text
backend/index.ts
backend/runtime/
  protocol.ts
  server.ts
  request-router.ts
  event-bus.ts
  logger.ts
backend/workers/
backend/analytics/
backend/qmd/
backend/qmd-logs/
backend/provider-limits/
```

Keep runtime responsibilities narrow:
- runtime layer owns process protocol and supervision hooks
- subsystem layers own behavior
- workers own CPU-heavy batch work

## 5. Domain model

### 5.1 Recommended topology

```text
Electron main
  -> backend service process (primary app backend)
       -> worker threads for CPU-heavy parse/cache jobs
       -> dedicated internal QMD bridge child for QMD SDK mutations/search
```

### 5.2 Responsibility split

#### Electron main
- spawn and supervise backend service
- restart backend on crash when safe
- route preload requests to backend service
- forward backend events to renderer listeners
- own native desktop APIs only

#### Backend service process
- expose Ariadne command handlers
- own caches, parsers, and request orchestration
- own request correlation IDs, cancellation hooks, and event publication
- own filesystem/SQLite/provider CLI access

#### Worker threads
- session discovery + parse batches
- analytics cache rebuilds
- QMD log extraction rebuilds
- optionally large replay shaping if needed later

#### Internal QMD bridge child
- QMD SDK mutations/search/progress
- index switching and model-heavy state
- crash isolation for native/QMD-specific failures

## 6. Detailed design

### 6.1 Architecture recommendation with rationale

#### Recommended: dedicated backend service process + worker threads + internal QMD bridge
This is the best fit for Ariadne because it preserves three important properties from the current app:

1. **Shell isolation** — Electron main does not become the place where session parsing or QMD logic lives.
2. **QMD isolation** — the existing TS sidecar boundary already reflects real runtime complexity in the QMD SDK path.
3. **Subsystem clarity** — backend modules can be owned independently by different agents without colliding in shell code.

#### Rejected: everything in Electron main
Reasons:
- session parsing and QMD logs cache builds are heavyweight and can block app responsiveness
- a shell crash becomes a backend crash and vice versa
- ownership becomes muddy for agents

#### Rejected: only worker threads inside Electron main
Reasons:
- still mixes shell and backend concerns in one process
- broadens write scope conflicts
- makes restarts and fault boundaries weaker

### 6.2 Process lifecycle

#### Startup
1. Electron main starts.
2. Main creates the BrowserWindow and preload.
3. Main forks `backend/index.ts`.
4. Backend initializes runtime services and lazy cache containers.
5. Main marks backend as ready only after an explicit handshake.
6. Renderer requests are buffered or rejected with a clear not-ready error until handshake completes.

#### Shutdown
1. Window close/app quit triggers backend shutdown signal.
2. Backend drains in-flight requests where reasonable, closes internal QMD bridge, and exits.
3. Main kills backend forcefully only after timeout.

#### Crash/restart
- backend crash should not immediately tear down the window
- main should surface backend-unavailable state and may auto-restart once
- repeated crash loops should stop auto-restart and show a persistent error state

### 6.3 Request/response protocol
Use a structured envelope over child-process IPC, for example:

```ts
{ id, channel, payload }
{ id, ok: true, result }
{ id, ok: false, error }
{ event, payload }
```

Requirements:
- correlation IDs for every request
- explicit error envelope
- backend-published event envelopes for progress
- optional request cancellation support later without changing renderer contracts

### 6.4 Logging and observability
Main requirements:
- backend service logs should be distinguishable from Electron main logs
- every request should carry a request ID for debugging
- QMD bridge stderr/stdout should be captured and attributed
- parity-harness runs should be able to capture deterministic logs when needed

Recommended modules:
- `backend/runtime/logger.ts`
- `electron/main/backend-supervisor.ts`

### 6.5 Synchronous vs async work

#### Must stay off the shell thread
- full session discovery/parsing
- analytics cache rebuilds
- QMD log cache rebuilds
- QMD search/update/embed
- provider CLI probes that can block

#### Can remain in backend service event loop
- lightweight request validation
- cache reads after warm initialization
- small SQLite reads when proven cheap, though QMD read queries should still be measured

#### Recommended worker-thread candidates
- session parser batches
- QMD-log extraction build jobs
- fixture-driven parity batch runs

### 6.6 Progress event flow
Current UI depends on named progress channels. Preserve that model:

```text
internal bridge / worker
  -> backend event bus
  -> backend service IPC event
  -> Electron main forwarder
  -> preload subscription adapter
  -> renderer callback
```

Phase-1 compatibility rule:
- keep current event names and payload shapes stable even if the internal transport changes

### 6.7 QMD boundary recommendation
For phase 1, **do not absorb the current TS bridge into the first backend process rewrite**.

Recommended approach:
- backend service owns QMD read path and bridge supervision
- current `src-sidecar/qmd-bridge.ts` logic is migrated or copied into `backend/qmd/bridge/` with minimal behavior change
- backend service talks to that bridge as an internal child process

Rationale:
- preserves native/QMD-specific isolation
- reduces migration risk
- keeps search/update/embed memory footprint and failure modes away from analytics logic

## 7. Error handling and failure modes

- backend not-ready errors must be explicit and renderer-visible
- worker-thread failure must fail the request and preserve backend service liveness where possible
- QMD bridge crash should invalidate in-flight QMD requests only; it should not crash analytics or the shell
- forced shutdown should avoid corrupting QMD operations by explicitly killing the bridge after timeout

## 8. Security and safety considerations

- no local HTTP server as the default backend transport
- main/preload are the only trusted bridge into the backend process
- backend should validate all request payloads against shared schemas
- child-process boundaries should avoid passing executable code or function handles

## 9. Testing strategy

### 9.1 Runtime tests
- backend handshake/startup test
- request routing success/error tests
- event forwarding tests for update/embed/search progress
- backend crash + supervisor restart test
- QMD bridge crash isolation test

### 9.2 Performance checks
- repeated analytics cache reads must not reparse sessions unnecessarily
- session resync must not freeze Electron main
- QMD search/update/embed progress must remain observable while the window is interactive

## 10. Implementation checklist
- [ ] Add backend runtime process with handshake protocol.
- [ ] Add Electron main supervisor and restart policy.
- [ ] Add backend request router and event bus.
- [ ] Add worker-thread pattern for CPU-heavy jobs.
- [ ] Add internal QMD bridge supervision inside the backend service.
- [ ] Preserve current named progress channels through the new transport.

## 11. Rollout / cutover notes

- This runtime skeleton should exist before subsystem ports begin landing broadly.
- The backend process can initially serve stubbed or pass-through handlers while parity work is in progress.
- QMD bridge supervision should be proven in Electron dev mode before QMD subsystem cutover.

## 12. Dependencies and parallelization

### Depends on
- contract freeze for request/response/event naming

### Unlocks parallel work for
- analytics/session port
- QMD port
- QMD logs port
- provider limits port
- shell/preload integration

### Must not run in parallel with
- other agents changing runtime protocol envelopes without coordination

## 13. Resolved questions
- **Process spawning:** use `child_process.fork()`. Simpler, more portable, agent-friendly. `utilityProcess` offers tighter Electron integration we don't need — our backend is a plain TypeScript service with no Electron API dependencies. (Approved 2026-04-08)
- **Request cancellation:** deferred to post-migration. The current Tauri app has no cancellation support. Correlation IDs in the protocol reserve the option for later without protocol changes. (Approved 2026-04-08)
