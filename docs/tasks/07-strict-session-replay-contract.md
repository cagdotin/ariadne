# Task: Replace the permissive replay contract with a stricter typed schema

**Status:** Ready  
**Priority:** P2  
**Goal:** Tighten replay payload validation so session replay no longer relies primarily on permissive passthrough entry typing.

## Why this matters

Current replay contract status:

- `contracts/sessions/replay.ts` still uses a permissive schema for entry bodies
- `src/api/analytics.ts` validates only the broad wire shape, then casts to component-level types
- this was acceptable during migration, but it is weaker than the rest of the app's boundary validation

## Current code to inspect first

- `contracts/sessions/replay.ts`
- `src/api/analytics.ts`
- `src/components/session-viewer/types.ts`
- `backend/analytics/replay-loader.ts`
- replay fixture goldens under `fixtures/migration/golden/replay/`

## Required outcome

After this task:

1. replay entries are validated against a stricter schema
2. the schema still accepts all currently supported replay entry types used by the app
3. frontend replay rendering no longer depends on a broad unchecked cast for normal cases
4. parity output remains unchanged

## Implementation requirements

Build a stricter replay contract based on the existing viewer types and fixture data.

Recommended approach:

- define discriminated unions for known entry types
- keep `.passthrough()` where forward compatibility is useful
- preserve raw fields the viewer currently needs
- update `src/api/analytics.ts` to return validated replay types
- keep unknown/future-safe behavior only where truly necessary

## Constraints

- do not change replay JSON produced by the backend
- do not break existing replay rendering behavior
- do not overfit the schema to only one fixture shape
- preserve compatibility with branching replay fixtures

## Validation

Run:

```bash
bun run typecheck
bun run test:parity
bun run build
```

Manual sanity check:

1. open at least one normal session replay
2. open the branching replay fixture or a real branched session
3. confirm viewer rendering still works for tool calls, tool results, compactions, and model changes

## Acceptance

- `contracts/sessions/replay.ts` is materially stricter than the current permissive version
- `src/api/analytics.ts` no longer relies on a broad unchecked replay cast for standard flows
- replay parity tests still pass
- session viewer behavior remains unchanged
