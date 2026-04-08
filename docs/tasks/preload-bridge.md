# Task: Preload Bridge

**Status: ✅ Completed**
**Milestone: 3 — Stand Up Shell/Runtime Skeletons**
**Depends on: ✅ backend-service-and-ipc-transport**

## Summary

Created the Electron preload script that exposes a typed `window.ariadne` API to the renderer via `contextBridge.exposeInMainWorld`.

## What was built

### Preload script (`electron/preload/`)
- `index.ts` — exposes `window.ariadne` with:
  - `commands.analytics` — 10 methods
  - `commands.qmd` — 21 methods
  - `commands.qmd_logs` — 2 methods
  - `commands.provider_limits` — 2 methods
  - `events.on(channel, callback)` / `events.off(subscription_id)` — generic event subscription
  - `dialogs.pick_directory({ title })` — folder picker
- `ariadne.d.ts` — TypeScript type declarations for `window.ariadne` (global Window augmentation)

### Dialog handler
- Added `ariadne:dialog` IPC handler in `electron/main/ipc-router.ts` for `pick_directory` using `dialog.showOpenDialog`

### Build
- Added `build:preload` script (esbuild, CJS format for sandbox compatibility)
- Updated `build:electron` to chain all three builds

## Channel name verification
All 35 preload command methods were verified to forward the exact same channel names and payload parameter names as the original Tauri `invoke()` calls.
