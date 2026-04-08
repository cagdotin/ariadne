# Task: Renderer Platform Adapters

**Status: ✅ Completed**
**Milestone: 3 — Stand Up Shell/Runtime Skeletons**
**Depends on: ✅ preload-bridge**

## Summary

Created platform adapters in `src/platform/` and replaced all Tauri imports in the renderer with Electron preload calls. Removed Tauri npm dependencies.

## What was built

### Platform adapters (`src/platform/`)
- `ipc.ts` — exports `commands` from `window.ariadne.commands`
- `events.ts` — exports `subscribe()` and `unsubscribe()` wrapping `window.ariadne.events`
- `dialog.ts` — exports `pick_directory()` wrapping `window.ariadne.dialogs`

### Files rewritten (7 total)
- `src/api/analytics.ts` — 10 functions, `invoke()` → `commands.analytics.*`
- `src/api/qmd.ts` — 21 functions, `invoke()` → `commands.qmd.*`
- `src/api/qmd-logs.ts` — 2 functions, `invoke()` → `commands.qmd_logs.*`
- `src/api/provider-limits.ts` — 2 functions, `invoke()` → `commands.provider_limits.*`
- `src/hooks/use-qmd-operation.ts` — replaced `listen()` + `UnlistenFn` with `subscribe()` + subscription IDs
- `src/components/qmd-search-modal.tsx` — same event pattern change for `qmd:search-progress`
- `src/components/add-collection-dialog.tsx` — replaced `open()` with `pick_directory()`

### Tauri packages removed
- `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener` (dependencies)
- `@tauri-apps/cli` (devDependencies)
- `"tauri"` script removed

### Config changes
- `tsconfig.json` — added `electron/preload/ariadne.d.ts` to `include`

## Verification
- Zero `@tauri-apps` imports in `src/`
- `bun run build` (tsc + vite) passes with no errors
- All function signatures, Zod validation, and return types unchanged
