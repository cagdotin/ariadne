# Task: Tighten Electron packaging inputs and runtime asset boundaries

**Status:** Ready  
**Priority:** P1  
**Depends on:** `01-package-safe-qmd-bridge-runtime.md`  
**Goal:** Reduce package sprawl and make packaged runtime assets explicit instead of broadly including source-era directories.

## Why this matters

Current packaging is functional but broad:

- `electron-builder.yml` includes wide file globs
- runtime asset boundaries are looser than they should be
- now that the app is fully on Electron, packaging should reflect explicit build outputs, not source-tree convenience

This becomes much more important once the QMD bridge runtime is package-safe.

## Current code to inspect first

- `electron-builder.yml`
- `package.json`
- `electron/main/paths.ts`
- build output directories created by:
  - `bun run build`
  - `bun run build:electron`

## Required outcome

After this task:

1. packaged artifacts include only what the runtime actually needs
2. source-only or dev-only files are not bundled unnecessarily
3. runtime asset resolution still works in packaged mode
4. package build remains successful

## Implementation requirements

Review and tighten:

- renderer asset inclusion
- Electron main/preload bundle inclusion
- backend bundle inclusion
- QMD bridge asset inclusion
- dependency inclusion strategy

Aim for an explicit packaged boundary, not a catch-all file glob.

Also document the packaged runtime layout in the repo docs so future agents know which outputs are authoritative.

## Constraints

- do not break packaged path resolution
- do not remove assets that are actually needed at runtime
- keep the final config understandable and path-specific
- do not redesign the build pipeline as part of this task

## Validation

Run:

```bash
bun run typecheck
bun run build
bun run build:electron
bun run package
```

Then inspect the effective package inputs and verify:

- renderer assets are present
- Electron main/preload bundles are present
- backend bundle is present
- QMD bridge artifact is present
- obvious source-only directories are not required at runtime

## Acceptance

- `electron-builder.yml` is tighter and more explicit than the current broad include set
- package build succeeds
- packaged runtime asset paths remain correct
- docs describe the intended packaged runtime asset layout
