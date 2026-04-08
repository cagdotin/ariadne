# Task: Make the QMD bridge package-safe

**Status:** Ready  
**Priority:** P0  
**Goal:** Ensure QMD mutation/search/file-toggle flows work in a packaged Electron build without requiring Bun, `tsx`, or the source-tree `src-sidecar/qmd-bridge.ts` path.

## Why this matters

Today the biggest remaining runtime risk is the QMD bridge process:

- `backend/qmd/bridge/bridge-supervisor.ts` resolves `src-sidecar/qmd-bridge.ts`
- it prefers `bun run` or `npx tsx` at runtime
- packaged Electron apps should not depend on TypeScript source files or external TS runtimes
- `electron-builder.yml` currently does not define a stable packaged bridge artifact

That means the app may work in dev while QMD write/search flows fail after packaging.

## Current code to inspect first

- `backend/qmd/bridge/bridge-supervisor.ts`
- `backend/qmd/bridge/bridge-client.ts`
- `src-sidecar/qmd-bridge.ts`
- `package.json`
- `electron-builder.yml`
- `electron/main/paths.ts`

Also inspect where QMD runtime dependencies currently live:
- root `package.json`
- `src-sidecar/package.json`

## Required outcome

After this task:

1. the bridge has a **built runtime artifact** that exists in both dev and packaged app modes
2. packaged app runtime does **not** depend on `bun`, `tsx`, or `.ts` source files
3. `bridge-supervisor.ts` resolves the correct bridge entry for dev and production
4. QMD bridge runtime dependencies are available in packaged builds
5. build/package scripts include the bridge artifact automatically

## Preferred implementation shape

You may choose the exact layout, but the end state should follow these rules:

- compile the bridge to JavaScript as part of the normal build
- keep bridge process isolation; do **not** absorb QMD SDK work into Electron main
- use a stable path helper for bridge artifact resolution
- use a packaged runtime that Electron already ships with, rather than external TS tooling

A good implementation would likely include:

- a new build step such as `build:qmd-bridge`
- a built output directory for the bridge artifact
- a shared path helper for bridge entry resolution
- production bridge spawning via a packaged JS entrypoint

## Constraints

- Do not move heavy QMD logic into Electron main
- Do not break current dev behavior
- Do not rely on global machine tooling in packaged mode
- Keep Bun as the repo package manager, but not a packaged runtime dependency

## Validation

Run all of these:

```bash
bun run typecheck
bun run build
bun run build:electron
```

Then verify manually:

1. start the app in dev mode
2. open a QMD index page
3. run one bridge-backed operation:
   - search, or
   - reindex, or
   - embed, or
   - toggle files
4. confirm the operation still works and progress events still reach the UI

Then validate packaging inputs:

```bash
bun run package
```

You do not need to sign or ship the app, but the package step must succeed with the bridge artifact included.

## Acceptance

- no packaged runtime path points at `src-sidecar/qmd-bridge.ts`
- no packaged runtime path requires `bun run` or `npx tsx`
- bridge asset is built automatically as part of the normal Electron build/package flow
- bridge-backed QMD operations still work in dev
- package build completes with the bridge artifact included
