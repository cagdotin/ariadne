# Migration Spec — Electron Shell and Preload Architecture

Status: Approved
Date: 2026-03-28
Approved: 2026-04-08
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

The current renderer depends on Tauri-specific runtime capabilities in three ways:

- typed command calls through `src/api/*.ts`
- event listeners for QMD progress in `src/hooks/use-qmd-operation.ts` and `src/components/qmd-search-modal.tsx`
- direct folder-picker access via `@tauri-apps/plugin-dialog` in `src/components/add-collection-dialog.tsx`

Migrating to Electron is not just a shell swap. Ariadne needs an Electron shell that preserves current renderer behavior, keeps the security boundary explicit, and prevents Electron main from becoming a second monolithic backend.

## 2. Goals and non-goals

### 2.1 Goals
- Define the Electron app structure and preload API surface.
- Replace Tauri command, event, and dialog behavior with explicit preload-backed capabilities.
- Keep Electron main thin and focused on shell concerns.
- Minimize renderer churn by introducing repo-local platform adapters.
- Preserve current event names and dialog semantics where the renderer already depends on them.

### 2.2 Non-goals
- Moving analytics or QMD logic into Electron main.
- Rewriting page-level UI state management.
- Exposing a generic unrestricted `window.invoke()` bridge.
- Reworking router or layout structure.

## 3. System context

### 3.1 Source files/docs to study
- `src/app.tsx`
- `src/main.tsx`
- `src/router.tsx`
- `src/api/*.ts`
- `src/hooks/use-qmd-operation.ts`
- `src/components/qmd-search-modal.tsx`
- `src/components/add-collection-dialog.tsx`
- `src-tauri/tauri.conf.json`
- `package.json`
- `vite.config.ts`
- `docs/ARCHITECTURE.md`
- `docs/information-architecture.md`

### 3.2 Current renderer coupling to Tauri
The renderer already hides most command calls behind `src/api/`, but it is **not** fully platform-neutral. Direct Tauri imports still exist for:

- event subscription
- dialog open

That means the migration must add a thin renderer-side platform layer before or while Electron preload arrives.

## 4. Conventions and style

### 4.1 Target file ownership
Recommended shell files:

```text
electron/main/index.ts
electron/main/window.ts
electron/main/backend-supervisor.ts
electron/main/ipc-router.ts
electron/preload/index.ts
src/platform/ipc.ts
src/platform/events.ts
src/platform/dialog.ts
```

### 4.2 Renderer integration rule
`src/api/` should remain the high-level business API. Platform-specific details move into `src/platform/*` so pages/components stop importing desktop-runtime libraries directly.

## 5. Domain model

### 5.1 Shell responsibilities
Electron main should own only:
- app/window lifecycle
- dev/prod URL resolution
- backend service startup/restart/shutdown
- preload registration
- routing requests from preload to backend
- forwarding backend events to renderer subscribers
- native dialog calls

### 5.2 Preload responsibilities
Preload should own only:
- exposing typed methods to the renderer
- exposing subscribe/unsubscribe wrappers for named progress events
- exposing a folder-picker function that matches current renderer expectations
- no business logic and no direct filesystem parsing

### 5.3 Renderer platform adapter responsibilities
- wrap preload access behind repo-local modules
- keep existing pages/components unaware of Electron internals
- preserve current ergonomics in `src/api/*`

## 6. Detailed design

### 6.1 Target architecture

```text
Renderer
  -> src/platform/* adapters
  -> preload named methods
  -> Electron main request router
  -> backend service
```

Recommended renderer-facing preload API:

```ts
window.ariadne = {
  commands: {
    analytics: {...},
    qmd: {...},
    qmd_logs: {...},
    provider_limits: {...},
  },
  dialogs: {
    pick_directory(...),
  },
  events: {
    on(channel, callback),
    off(subscription_id),
  },
};
```

The renderer should not call channel strings manually outside the small platform-adapter surface.

### 6.2 Contract changes
**No business-contract changes.**

Allowed renderer refactor:
- replace `@tauri-apps/api/core`, `@tauri-apps/api/event`, and `@tauri-apps/plugin-dialog` imports with repo-local platform adapters that preserve behavior

### 6.3 Replacement strategy for current Tauri surfaces

#### Commands
Current `src/api/*.ts` wrappers keep their exported function names and return types. Only the implementation changes:

- before: Tauri `invoke()`
- after: preload `window.ariadne.commands.*`

#### Events
Current event names should remain stable:
- `qmd:update-progress`
- `qmd:embed-progress`
- `qmd:search-progress`

Renderer migration path:
- replace direct `listen()` usage with `src/platform/events.ts`
- keep callback payloads identical during the contract-preserving phase

#### Dialog
Current `open({ directory: true, multiple: false, title })` behavior should become a preload wrapper such as:

```ts
pick_directory({ title: string }): Promise<string | null>
```

The renderer adapter may preserve the old call shape temporarily if that reduces churn.

### 6.4 Security model
Required BrowserWindow settings (approved 2026-04-08):
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` — enabled from the start, not deferred
- no remote module usage
- no direct backend child-process access from renderer

Preload should validate inputs and outputs at the boundary using shared contracts where practical.

### 6.5 Thin-main guardrails
Electron main must not own:
- analytics caches
- SQLite query code
- session parsing
- QMD search/update/embed logic
- provider-limit adapters

If a main-process file begins importing subsystem modules from `backend/analytics`, `backend/qmd`, `backend/qmd-logs`, or `backend/provider-limits`, that is architectural drift unless it is strictly supervisor/routing code.

### 6.6 Lifecycle behavior
Main-process responsibilities to preserve or emulate:
- app start opens a single main window sized comparably to current Tauri defaults
- backend service starts before first command handling
- backend service shutdown is tied to app quit
- backend failure is surfaced to the renderer with a recoverable degraded-state path where possible
- renderer reload during sync remains available because `src/app.tsx` currently depends on full app re-init after `resync_sessions()`

## 7. Error handling and failure modes

- preload should reject unavailable backend calls with structured errors rather than hanging promises
- backend disconnect should trigger a visible shell/backend-unavailable state and optional restart attempt
- event subscriptions should clean up on window reload/unmount to avoid listener leaks
- dialog cancellation should still resolve to `null`/no selection, not an exception path that changes current UX

## 8. Security and safety considerations

- do not expose unrestricted `ipcRenderer` or Node globals to the renderer
- keep channel list explicit and finite
- validate dialog requests before invoking Electron shell APIs
- never allow renderer-provided arbitrary command execution through preload

## 9. Testing strategy

### 9.1 Unit/integration tests
- preload adapter tests for method routing and event subscription cleanup
- platform-adapter tests for `src/platform/*`
- shell startup test that verifies backend supervisor starts before first request

### 9.2 Manual verification
- Overview, Sessions, Usage, QMD, QMD Logs, and Provider Limits pages load without Tauri runtime imports
- Add Collection dialog still opens a folder picker and returns a single directory path
- reindex/embed/search progress still updates the existing UI
- sync still reloads and revalidates project scope

## 10. Implementation checklist
- [ ] Add renderer platform adapters for commands, events, and dialogs.
- [ ] Replace direct Tauri imports in renderer components/hooks.
- [ ] Add Electron main shell with thin supervisor/router modules.
- [ ] Add preload exposing named capabilities only.
- [ ] Preserve current progress channel names and payloads.
- [ ] Preserve folder-picker behavior used by Add Collection.

## 11. Rollout / cutover notes

- The shell can ship behind a dev-only runtime switch before it becomes the default packaged app.
- Tauri should remain available as the reference shell while preload integration stabilizes.
- Renderer platform adapters should be landed before or alongside the new shell so pages do not need another broad refactor later.

## 12. Dependencies and parallelization

### Depends on
- frozen command/event/dialog contracts
- backend runtime transport decision from the backend process architecture spec

### Can proceed in parallel with
- analytics, QMD, QMD logs, and provider-limit backend ports once the shared contract map is frozen

### Must not run in parallel with
- independent edits to the same renderer platform adapter files
- speculative renderer API redesigns that bypass the contract freeze

## 13. Resolved questions
- **Preload API shape:** grouped namespaces (`window.ariadne.commands.analytics.get_overview`). This allows deep module structure with clear per-subsystem APIs and specs. (Approved 2026-04-08)
- **Sandbox mode:** `sandbox: true` from the start. We build secure by default rather than retrofitting later. The preload/`contextBridge` pattern supports this without issues since we expose only named methods. (Approved 2026-04-08)
