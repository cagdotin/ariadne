# Task: Port Analytics to Worker Thread

**Status: ⏳ Ready**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ port-session-cache-and-aggregations**

## Context

Move session discovery + parsing off the backend event loop into a `worker_threads` worker. The cache orchestrates, the worker does heavy lifting.

## Spec references

- `docs/specs/2026-03-28-migration-analytics-session-backend.md` — Section 6.6
- `docs/specs/2026-03-28-migration-backend-process-architecture.md` — Section 5.2

## Target files

```
backend/workers/analytics-build.worker.ts
backend/analytics/session-cache.ts     # updated to use worker
```

## What to build

1. Create a worker that receives a message with the sessions root path
2. Worker runs `discover_session_files()` + `parse_session_file()` for each file
3. Worker posts back the array of `SessionSummary` objects
4. Update `session-cache.ts` to spawn the worker for cache builds/resyncs instead of running synchronously
5. Error handling: worker failures should reject the cache build promise cleanly

## Verification

- All 15 analytics + replay parity tests still pass after the worker refactor
- Backend event loop is not blocked during cache builds

## Acceptance

- Cache builds happen in worker thread
- Parity tests still pass
- No behavioral changes from the synchronous version
