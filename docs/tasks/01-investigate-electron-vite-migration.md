# Task: Investigate replacing custom dev orchestrator with electron-vite or similar

**Status:** Ready
**Priority:** P2
**Goal:** Determine whether adopting `electron-vite`, `vite-plugin-electron`, or a similar tool would simplify the dev/build workflow compared to the current custom orchestrator.

## Current situation

Ariadne has a custom dev orchestrator at `scripts/dev.ts` (~300 lines) that was written because the previous `bun run dev` relied on a one-shot `build:electron` followed by `sleep 2` before launching Electron. The custom script replaced that with:

- esbuild in watch mode for 4 targets (backend, preload, QMD bridge, Electron main)
- Vite dev server for the renderer
- deterministic Vite readiness polling (no sleep)
- auto-restart of Electron when main/preload artifacts rebuild
- coordinated shutdown of all processes

This works, but it's a bespoke solution that we maintain ourselves. Standard Electron + Vite tooling (like `electron-vite`) handles the same concerns out of the box, plus features we don't have:
- source maps in dev for main/preload
- HMR for preload (not just rebuild + restart)
- unified config instead of scattered esbuild CLI flags
- community-maintained Electron version compatibility

## Why this needs investigation, not just adoption

Ariadne's architecture has non-standard aspects that may not fit cleanly into off-the-shelf tooling:

1. **Backend is a separate forked child process.** Most Electron Vite setups assume renderer + main + preload. Ariadne has a 4th target (`backend/index.ts`) that Electron main forks via `child_process.fork()`. The dev tool needs to watch and rebuild this too, and the backend-supervisor inside Electron handles restarts — Electron itself should NOT restart when backend code changes.

2. **QMD bridge is a 5th build target.** `src-sidecar/qmd-bridge.ts` is compiled to a standalone JS bundle with specific externals (`better-sqlite3`, `sqlite-vec`, `node-llama-cpp`) and a `createRequire` banner. It runs as its own child process. This is unlikely to be a first-class concept in any Electron Vite tool.

3. **Backend is ESM, main is CJS.** The backend bundle is `--format=esm` while Electron main is `--format=cjs`. The tool needs to handle mixed module formats across targets.

4. **Native module ABI concerns.** `better-sqlite3` is externalized from esbuild and must match Electron's Node ABI at runtime. The build tool must not try to bundle or rebuild it in incompatible ways.

5. **Production build is separate.** The current `build:electron` script uses raw esbuild commands. Adopting a dev tool should not force changes to the production build pipeline unless that's also an improvement.

## What the investigation should answer

1. Can `electron-vite` (or alternatives) handle 5 build targets with different formats and externals?
2. Can it leave the backend restart lifecycle to the backend-supervisor (i.e., not restart Electron on backend changes)?
3. Does it support custom esbuild externals and banners per target?
4. What would the migration look like — config-only, or does it require restructuring?
5. Is the complexity reduction worth the coupling to a third-party tool?

## Candidates to evaluate

- [`electron-vite`](https://electron-vite.org/) — most popular, Vite-native
- [`vite-plugin-electron`](https://github.com/electron-vite/vite-plugin-electron) — lighter, plugin-based
- Staying with the custom script but cleaning it up

## Constraints

- Must keep Bun as the package manager
- Must not break the production build/package pipeline
- Must handle the backend and QMD bridge as separate non-Electron build targets
- Must not introduce Electron restarts on backend-only changes

## Outcome

A written recommendation (in this file or a new doc) with:
- which tool (if any) to adopt
- a rough migration plan if adopting
- clear list of blockers or dealbreakers found
