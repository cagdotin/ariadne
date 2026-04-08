# Task: Add a Node-based QMD parity runner and integrate it into repo checks

**Status:** Ready  
**Priority:** P1  
**Goal:** Close the current QMD parity gap by running the SQLite-backed QMD parity tests under Node instead of Bun.

## Why this matters

Current parity status:

- `bun run test:parity` passes for analytics, replay, QMD logs, and provider limits
- QMD parity is still skipped because `better-sqlite3` does not load in Bun's test runner
- this leaves the QMD read layer under-tested compared to the rest of the backend

## Current code to inspect first

- `tests/parity/run-parity.test.ts`
- `tests/parity/helpers.ts`
- `tests/parity/normalize.ts`
- `backend/qmd/sqlite-read-service.ts`
- `package.json`

Also inspect the current QMD goldens:
- `fixtures/migration/golden/qmd/`

## Required outcome

After this task:

1. QMD parity tests run under Node
2. the six QMD golden comparisons are active rather than skipped
3. repo scripts make it easy to run all parity checks intentionally
4. documentation explains the split between Bun-based and Node-based parity execution

## Implementation requirements

Add a dedicated Node-based parity path for the QMD tests.

A good shape would be:

- keep the existing Bun parity suite for non-QMD surfaces
- add a Node runner for the QMD subset
- add scripts such as:
  - `test:parity`
  - `test:parity:qmd`
  - `test:parity:all`
- ensure the QMD runner validates the same goldens and schemas as the existing suite

You may split test files if that makes the runtime boundary cleaner.

## Constraints

- do not remove the current Bun parity suite
- do not rewrite the QMD implementation just to satisfy the runner
- do not introduce a full test-framework migration
- keep the golden normalization rules identical

## Validation

Run all of these:

```bash
bun run test:parity
bun run test:parity:qmd
bun run test:parity:all
```

Expected result:
- Bun parity still passes for non-QMD surfaces
- Node parity passes for all QMD goldens
- aggregate parity command passes all supported surfaces

## Acceptance

- QMD parity is no longer skipped by default in the dedicated Node path
- the six QMD golden tests run and pass
- package scripts clearly expose how to run Bun-only vs Node-only vs full parity
- parity docs are updated to match the new commands
