# Task: Move analytics cache builds into a worker thread

**Status:** Ready  
**Priority:** P2  
**Goal:** Move session discovery + parsing off the backend event loop so analytics cache builds do not block other backend work.

## Why this matters

Current analytics behavior is correct, but cache building still happens in-process:

- session discovery and parsing are CPU/file-system heavy
- they currently happen inside the backend process rather than a worker thread
- this can delay unrelated backend requests during initial cache build or resync

## Current code to inspect first

- `backend/analytics/session-cache.ts`
- `backend/analytics/discovery.ts`
- `backend/analytics/session-parser.ts`
- `backend/analytics/session-types.ts`
- `backend/runtime/request-router.ts`

## Required outcome

After this task:

1. session discovery + parsing run in a worker thread during cache build/resync
2. backend cache API stays behaviorally identical
3. parity output does not change
4. worker failures reject cleanly and do not leave the cache stuck in a broken state

## Implementation requirements

Create a worker-based cache build path.

Recommended shape:

- add `backend/workers/analytics-build.worker.ts`
- worker receives the sessions root and returns parsed `SessionSummary[]`
- `session-cache.ts` uses the worker for initial build and `resync()`
- preserve lazy cache semantics
- preserve current filter/query/aggregation behavior exactly

## Constraints

- do not change analytics payload shapes
- do not redesign the cache API
- do not move replay loading into the worker unless strictly required
- keep the worker boundary focused on cache construction only

## Validation

Run:

```bash
bun run typecheck
bun run test:parity
bun run build:electron
```

Manual sanity check:

1. launch the app
2. trigger a sync
3. confirm analytics pages still load correctly after rebuild

## Acceptance

- cache build/resync uses a worker thread
- analytics and replay parity tests still pass unchanged
- worker errors are surfaced cleanly
- backend runtime remains stable during analytics rebuilds
