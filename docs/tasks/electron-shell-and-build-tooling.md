# Task: Electron Shell and Build Tooling

**Status: ✅ Completed**
**Milestone: 3 — Stand Up Shell/Runtime Skeletons**
**Depends on: ✅ Milestone 2 (contract freeze & parity harness)**

## Summary

Set up the Electron shell, build tooling, and dev workflow so the app can run as an Electron desktop application.

## What was built

### New files
- `electron/main/index.ts` — Electron app entry point (lifecycle, window creation, backend startup)
- `electron/main/window.ts` — BrowserWindow factory with secure defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
- `electron/tsconfig.json` — TypeScript config for Electron code
- `electron-builder.yml` — Packaging config for mac/win/linux
- `electron/preload/dist/index.js` — Placeholder (replaced by preload build)

### Dev dependencies added
- `electron`, `electron-builder`, `esbuild`, `concurrently`

### Scripts added
- `bun run build:electron` — compiles backend + preload + electron main via esbuild
- `bun run electron:dev` — runs Vite + Electron concurrently for development
- `bun run electron:build` — full production build + packaging

### Config changes
- `package.json` — added `"main": "electron/main/dist/index.cjs"`, new scripts
- `vite.config.ts` — added `base: "./"` for Electron prod file:// loading
- `.gitignore` — added `electron/main/dist/`, `electron/preload/dist/`, `release/`

## Key decisions
- Used CJS format (`.cjs`) for Electron main bundle because Electron needs `__dirname` and the project has `"type": "module"`
- Used esbuild for fast TypeScript compilation of Electron/backend code
