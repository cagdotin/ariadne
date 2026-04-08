# Task: Replace `unknown`-heavy preload types with contract-backed types

**Status:** Ready  
**Priority:** P2  
**Goal:** Make the renderer ↔ preload boundary strongly typed so command surfaces are defined by shared contracts rather than `Promise<unknown>`.

## Why this matters

Current preload typing is intentionally minimal:

- `electron/preload/ariadne.d.ts` returns mostly `Promise<unknown>`
- renderer API wrappers still perform Zod validation, which is correct
- but the desktop capability surface itself is under-typed and easier to drift

This is a maintainability gap, not a current correctness failure.

## Current code to inspect first

- `electron/preload/ariadne.d.ts`
- `electron/preload/index.ts`
- `src/platform/ipc.ts`
- `src/api/analytics.ts`
- `src/api/qmd.ts`
- `src/api/qmd-logs.ts`
- `src/api/provider-limits.ts`
- `contracts/`

## Required outcome

After this task:

1. preload command namespaces use real request/response types where practical
2. `window.ariadne` is typed from shared contracts instead of raw `unknown`
3. renderer platform adapters remain thin
4. Zod validation at the renderer edge is preserved

## Implementation requirements

Introduce a shared typing layer for the preload surface.

A good end state would include:

- typed command signatures for analytics, QMD, QMD logs, and provider limits
- typed dialog request/response signatures
- typed event payload signatures for QMD progress channels
- minimal or no duplication between preload declarations and contract types

You do **not** need to remove renderer-side parsing. The goal is to improve compile-time safety, not to replace runtime validation.

## Constraints

- keep preload explicit and capability-based
- do not expose a generic `invoke(any)` API
- do not remove Zod validation from `src/api/*`
- do not change command names or payload field names

## Validation

Run:

```bash
bun run typecheck
bun run build
bun run build:electron
bun run test:parity
```

Also confirm that:
- `src/api/*` still compiles cleanly
- event subscription call sites still compile with the new types

## Acceptance

- `electron/preload/ariadne.d.ts` no longer relies primarily on `Promise<unknown>`
- preload surface is backed by shared contract types or equivalent typed definitions
- renderer API wrappers still validate responses with Zod
- all build/typecheck/parity commands continue to pass
