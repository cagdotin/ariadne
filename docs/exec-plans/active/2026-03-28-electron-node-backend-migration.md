# Electron + TypeScript Backend Migration Planning Package

Status: Active
Owner: coding-agent
Created: 2026-03-28
Spec: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

This ExecPlan is a living document and must be maintained in accordance with `PLAN.md`.

## Purpose / Big picture

This plan sequences the Ariadne desktop migration from Tauri + Rust backend + TypeScript sidecar to Electron + Node/TypeScript backend.

The user-visible outcome is not a redesigned app. The outcome is that Ariadne continues to provide the same Overview, Sessions, Usage, QMD, QMD Logs, and Provider Limits behavior while the backend becomes TypeScript-owned and Electron becomes the desktop shell.

Success looks like this:
- Electron launches Ariadne successfully
- the renderer still uses typed, validated contracts
- heavy parsing and QMD work do not block Electron main
- subsystem parity is proven before Tauri is removed

## Progress

- [x] (2026-03-28 00:00 UTC) Read repo architecture/docs, inspected current Tauri/Rust + sidecar implementation, and identified the current contract/runtime split.
- [x] (2026-03-28 00:00 UTC) Produced umbrella migration overview spec with thesis, subsystem map, dependency graph, risk register, and backlog.
- [x] (2026-03-28 00:00 UTC) Produced detailed child specs for contract freeze, Electron shell/preload, backend runtime, analytics/session port, QMD port, QMD logs port, provider limits port, and packaging/cutover.
- [x] (2026-04-08 00:00 UTC) Architecture boundary approved: repo layout, transport, process spawning, QMD isolation, preload API, sandbox, replay validation, parity harness strategy.
- [ ] (2026-03-28 00:00 UTC) Implement contract freeze + parity harness before subsystem code ports begin.
- [ ] (2026-03-28 00:00 UTC) Stand up Electron shell + backend runtime skeleton.
- [ ] (2026-03-28 00:00 UTC) Port subsystem backends with fixture-backed parity evidence.
- [ ] (2026-03-28 00:00 UTC) Switch default dev/package path to Electron and remove Tauri after final acceptance gate.

## Surprises & Discoveries

- Observation: the renderer is not isolated from Tauri as cleanly as `src/api/*` alone suggests.
  Evidence: direct imports remain in `src/components/add-collection-dialog.tsx`, `src/hooks/use-qmd-operation.ts`, and `src/components/qmd-search-modal.tsx`.

- Observation: `get_session_entries()` is the highest-risk analytics contract because it bypasses Zod and returns raw session JSON values.
  Evidence: `src/api/analytics.ts` returns `raw as SessionEntriesResponse`, and the UI types live only in `src/components/session-viewer/types.ts`.

- Observation: QMD already has a meaningful process boundary that should probably survive phase 1.
  Evidence: `src-tauri/src/sidecar.rs` and `src-sidecar/qmd-bridge.ts` implement a long-lived JSON-RPC child process with progress forwarding and active-index switching.

- Observation: analytics and QMD logs intentionally use separate caches even though both parse session logs.
  Evidence: `src-tauri/src/cache.rs` and `src-tauri/src/qmd_log_cache.rs` are distinct state objects, and `resync_sessions()` explicitly invalidates QMD logs after analytics resync.

- Observation: provider limits is already a distinct live-data subsystem, not part of session analytics.
  Evidence: dedicated backend modules in `src-tauri/src/provider_limits/*` plus a global frontend provider in `src/components/provider-limits-provider.tsx`.

## Decision Log

- Decision: recommend Electron main + dedicated backend service process + worker threads + internal QMD bridge child as the target runtime.
  Rationale: keeps Electron main thin, preserves QMD isolation, improves restartability, and creates clearer agent ownership boundaries than a main-process-heavy design.
  Date/Author: 2026-03-28 / coding-agent

- Decision: recommend freezing contracts before broad subsystem ports.
  Rationale: multiple major surfaces currently share payloads/events; without a freeze, parallel agent work would cause semantic drift.
  Date/Author: 2026-03-28 / coding-agent

- Decision: recommend `contracts/` as the neutral shared location for request/response/event schemas.
  Rationale: keeps shared types out of renderer-only `src/` and avoids backend↔renderer coupling.
  Date/Author: 2026-03-28 / coding-agent

- Decision: recommend preserving the current QMD bridge process in phase 1 rather than immediately absorbing it.
  Rationale: it is already TypeScript, already isolates SDK/native behavior, and reduces migration risk.
  Date/Author: 2026-03-28 / coding-agent

- Decision: approved `contracts/`, `backend/`, `electron/` as the three new runtime roots.
  Rationale: maps directly to process boundaries — two processes (shell + backend), two directories, plus a shared contract layer.
  Date/Author: 2026-04-08 / human

- Decision: use `child_process.fork()` for backend service spawning.
  Rationale: simpler, more portable, agent-friendly. `utilityProcess` offers Electron integration the backend doesn't need.
  Date/Author: 2026-04-08 / human

- Decision: grouped preload namespaces (`window.ariadne.commands.analytics.*`).
  Rationale: enables deep module structure with clear per-subsystem APIs and specs.
  Date/Author: 2026-04-08 / human

- Decision: `sandbox: true` from the start.
  Rationale: build secure by default. The `contextBridge` preload pattern supports this without issues.
  Date/Author: 2026-04-08 / human

- Decision: defer request cancellation to post-migration.
  Rationale: current Tauri app has no cancellation. Correlation IDs reserve the option. Fix when it becomes a real UX problem.
  Date/Author: 2026-04-08 / human

- Decision: start replay entry validation permissive (`z.unknown()`), track strict typing as a follow-up TODO.
  Rationale: contract freeze phase is about fidelity to current behavior, not cleanup. Strict schema added later.
  Date/Author: 2026-04-08 / human

- Decision: two separate parity runners with shared golden files. Remove parity suite after migration.
  Rationale: simpler setup, Tauri goldens recorded once, no need to keep Tauri runnable during Node testing.
  Date/Author: 2026-04-08 / human

- Decision: use `electron-builder` for packaging.
  Rationale: less opinionated than Electron Forge, compatible with existing Vite + tsup + Bun setup, avoids tool churn during migration.
  Date/Author: 2026-04-08 / human

- Decision: separate scripts for runtime selection during overlap (`bun run dev:electron` vs `bun run dev:tauri`).
  Rationale: explicit and clear, no hidden env-flag behavior.
  Date/Author: 2026-04-08 / human

## Outcomes & Retrospective

Completed in this planning pass:
- top-level migration decomposition
- sequencing and parallelization plan
- explicit non-parallelization guidance
- spec backlog with separate agent-ready spec files

Remaining before implementation:
- human approval of architecture defaults
- ownership assignment per workstream
- actual contract freeze/parity harness work
- runtime scaffolding and subsystem ports

## Context and orientation

The current implementation spans three meaningful runtime surfaces:
- React renderer in `src/`
- Rust/Tauri backend in `src-tauri/src/`
- TypeScript QMD bridge in `src-sidecar/qmd-bridge.ts`

The relevant planning artifacts created in this pass are:
- `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`
- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md`
- `docs/specs/2026-03-28-migration-electron-shell-and-preload.md`
- `docs/specs/2026-03-28-migration-backend-process-architecture.md`
- `docs/specs/2026-03-28-migration-analytics-session-backend.md`
- `docs/specs/2026-03-28-migration-qmd-subsystem.md`
- `docs/specs/2026-03-28-migration-qmd-logs-observability.md`
- `docs/specs/2026-03-28-migration-provider-limits-backend.md`
- `docs/specs/2026-03-28-migration-packaging-build-and-cutover.md`

The most important current source files inspected during planning were:
- `src-tauri/src/lib.rs`
- `src-tauri/src/cache.rs`
- `src-tauri/src/parser/session.rs`
- `src-tauri/src/commands/qmd.rs`
- `src-tauri/src/sidecar.rs`
- `src-tauri/src/parser/qmd_logs.rs`
- `src-tauri/src/provider_limits/codex.rs`
- `src/api/*.ts`
- `src/schemas/*.ts`
- `src/app.tsx`
- `src/router.tsx`
- `src/components/add-collection-dialog.tsx`
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`

## Plan of work

### Milestone 1 — approve the fixed architecture boundary
Confirm the non-negotiable shared assumptions before any large implementation starts:
- shared contracts in `contracts/`
- Electron main stays thin
- dedicated backend service process is the backend replacement
- worker threads handle CPU-heavy parsing
- QMD bridge remains isolated in phase 1

This milestone is design-only but blocks parallel implementation because it fixes the workstream boundaries.

### Milestone 2 — freeze contracts and add parity harness
Implement the contract-freeze spec first. This creates the safety rail for the rest of the migration.

Deliverables:
- shared contract schemas
- fixture roots and environment overrides
- golden outputs from current Tauri behavior
- event/dialog contract capture

### Milestone 3 — stand up shell/runtime skeletons
Build the Electron shell, preload bridge, and backend service protocol with minimal stub handlers. The goal is architectural readiness, not full functionality.

Deliverables:
- Electron window + preload
- backend service handshake
- supervisor/restart logic
- request/event transport
- renderer platform adapters replacing direct Tauri imports

### Milestone 4 — port backend subsystems in parallel
After contracts and runtime are stable, split into independent subsystem streams:
- analytics/session
- QMD
- QMD logs
- provider limits
- packaging/build support

Each stream must own only its scoped files and prove parity before cutover.

### Milestone 5 — staged cutover and Tauri removal
Switch the default dev/package path to Electron only after subsystem parity is proven, then remove Tauri after the explicit gate is satisfied.

## Concrete steps

The following are planning-phase commands and handoff actions, not implementation commands yet.

1. Review the generated specs:
   - `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`
   - child specs listed in that overview

2. Approve or amend these defaults:
   - backend topology
   - shared contract location
   - QMD bridge phase-1 isolation
   - packaging recommendation

3. Assign workstream owners with these write scopes:

   - **Contract freeze owner**
     - `contracts/**`
     - `src/api/**`
     - `src/schemas/**`
     - fixture/golden directories

   - **Shell/preload owner**
     - `electron/main/**`
     - `electron/preload/**`
     - `src/platform/**`
     - direct Tauri replacement points in renderer

   - **Analytics/session owner**
     - `backend/analytics/**`
     - analytics workers

   - **QMD owner**
     - `backend/qmd/**`
     - QMD bridge runtime

   - **QMD logs owner**
     - `backend/qmd-logs/**`
     - QMD-log workers

   - **Provider limits owner**
     - `backend/provider-limits/**`

   - **Packaging/cutover owner**
     - build scripts/config
     - packaging config
     - migration gating docs

4. Enforce the non-parallelization rules from the overview spec before spawning agents.

## Validation and acceptance

This planning package is acceptable if:
- every major migration topic has a dedicated spec file
- the overview spec explains subsystem boundaries, dependency order, and risks
- parallelizable vs non-parallelizable work is explicit
- each child spec identifies source files, acceptance criteria, tests/parity checks, dependencies, and safe parallel scope
- separate agents can be spawned immediately with minimal ambiguity

Implementation acceptance is tracked by the child specs, but planning acceptance is already satisfied when the above conditions are met and the user approves the architecture defaults.

## Idempotence and recovery

- Re-reading or revising these specs is safe; they do not modify runtime code.
- If architecture defaults change, update the overview spec first, then update affected child specs before spawning implementation agents.
- Do not start code cutover from stale specs; treat the overview spec as the coordination source of truth.

## Artifacts and notes

Created planning artifacts:
- `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`
- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md`
- `docs/specs/2026-03-28-migration-electron-shell-and-preload.md`
- `docs/specs/2026-03-28-migration-backend-process-architecture.md`
- `docs/specs/2026-03-28-migration-analytics-session-backend.md`
- `docs/specs/2026-03-28-migration-qmd-subsystem.md`
- `docs/specs/2026-03-28-migration-qmd-logs-observability.md`
- `docs/specs/2026-03-28-migration-provider-limits-backend.md`
- `docs/specs/2026-03-28-migration-packaging-build-and-cutover.md`

## Interfaces and dependencies

Fixed interfaces assumed by the planning package:
- frozen renderer/backend command contracts
- stable named progress channels for QMD operations
- explicit shell/backend process boundary
- subsystem-specific backend module ownership

Dependencies between workstreams:
- contract freeze must land before broad subsystem parallelism
- backend runtime skeleton must land before backend subsystem cutovers
- packaging/cutover can research in parallel but cannot finalize until parity is proven
