# Parity Test Harness

Parity harness for the current backend. It compares Node backend output against frozen legacy goldens to guard against regressions.

## Running

```sh
bun run test:parity
```

Or directly:

```sh
TZ=UTC bun test tests/parity/
```

## Status

Current status in `run-parity.test.ts`:

- analytics: enabled
- replay: enabled
- qmd-logs: enabled
- provider-limits: enabled
- qmd: skipped under Bun because `better-sqlite3` does not load in Bun's test runner

So `bun run test:parity` currently validates most backend surfaces, while QMD SQLite parity remains a runtime-specific gap.

## How it works

1. Each test calls the Node backend function with the same parameters used to generate the golden file.
2. Both the actual output and the golden file are normalized using the same rules that were used when the original goldens were recorded.
3. The test asserts deep equality between normalized actual and normalized golden.
4. Each test also validates the backend response against its Zod schema from `contracts/`.

## Related

- [Migration Contract Freeze and Parity Harness spec](../../docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md)
- Frozen goldens and fixture manifest under `fixtures/migration/golden/`
- [Golden files](../../fixtures/migration/golden/)

## When to delete

This harness is still useful as a regression suite for the current backend. Remove it only if it is replaced by a more permanent backend test layer.
