# Task: Replace the brittle Electron dev loop with a real watch/restart workflow

**Status:** Ready  
**Priority:** P1  
**Goal:** Make `bun run dev` reliable for day-to-day work by removing one-shot builds and the `sleep 2` startup hack.

## Why this matters

Current dev workflow problems:

- `package.json` uses a one-shot `build:electron` before launch
- Electron startup waits on `sleep 2`, which is timing-based and brittle
- changes to backend/main/preload code do not have a first-class watch/restart flow
- this slows all future implementation work

## Current code to inspect first

- `package.json`
- `electron/main/index.ts`
- `electron/main/window.ts`
- `electron/main/backend-supervisor.ts`
- `electron/preload/index.ts`
- `backend/index.ts`

## Required outcome

After this task:

1. `bun run dev` starts the renderer and desktop runtime without using `sleep`
2. main/preload/backend have watch-mode rebuilds
3. Electron restarts automatically when required runtime artifacts change
4. renderer dev server remains the source for renderer hot updates
5. the workflow is clearly documented in `README.md`

## Implementation requirements

You may choose the tooling, but the end state must include:

- explicit watch scripts for the desktop/runtime layers
- a dev entry command that orchestrates all watches together
- deterministic readiness instead of timing guesses
- no npm/yarn/pnpm tools; stay inside Bun-compatible tooling

A reasonable setup could include:

- watch scripts built around `esbuild --watch`
- a file-watcher or Electron restarter
- readiness based on the Vite dev URL becoming available, not fixed sleep

## Constraints

- keep Bun as the package/task runner
- do not change production build behavior
- do not add unnecessary framework-level abstractions
- do not move logic out of the existing renderer / preload / main / backend split

## Validation

Run:

```bash
bun run dev
```

Verify manually:

1. app launches without a manual retry
2. editing a renderer file updates via Vite as expected
3. editing a preload file triggers the necessary rebuild/restart path
4. editing an Electron main file triggers the necessary rebuild/restart path
5. editing a backend file triggers the necessary rebuild/restart path

Also run:

```bash
bun run typecheck
bun run build:electron
```

## Acceptance

- `bun run dev` no longer uses `sleep`
- desktop/runtime artifacts rebuild in watch mode
- Electron restarts cleanly when backend/main/preload code changes
- README documents the intended development commands
- typecheck and production Electron build still pass
