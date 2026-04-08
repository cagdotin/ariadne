# Task: Backend Service Process and IPC Transport

**Status: ✅ Completed**
**Milestone: 3 — Stand Up Shell/Runtime Skeletons**
**Depends on: ✅ electron-shell-and-build-tooling**

## Summary

Created the dedicated backend service process, IPC protocol, request router with stub handlers, event bus, and Electron main supervisor.

## What was built

### Backend runtime (`backend/runtime/`)
- `protocol.ts` — IPC envelope types (`BackendRequest`, `BackendResponse`, `BackendEvent`, `BackendReady`) and type guards
- `event-bus.ts` — `emit_event()` for backend → main event publishing via `process.send()`
- `request-router.ts` — channel-to-handler map with `register_handler()` and `route_request()`

### Backend entry and stubs
- `backend/index.ts` — forked process entry; listens for IPC messages, routes to handlers, sends ready handshake
- `backend/stubs/index.ts` — stub handlers for all 35+ command channels returning contract-conformant empty data
- `backend/tsconfig.json` — TypeScript config for backend code

### Electron main supervisor and router
- `electron/main/backend-supervisor.ts` — forks backend, handshake with 10s timeout, correlation-ID-based request tracking, auto-restart on crash (once), graceful shutdown with 5s force-kill
- `electron/main/ipc-router.ts` — bridges `ipcMain.handle("ariadne:command")` to backend, forwards events to renderer windows

## Protocol design
```
Request:  { id, channel, payload }
Response: { id, ok: true, result } | { id, ok: false, error: { code, message } }
Event:    { event, payload }
Ready:    { type: "ready" }
```
