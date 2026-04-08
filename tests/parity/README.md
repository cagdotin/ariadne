# Parity Test Harness

Temporary parity harness for the Tauri to Electron migration. Compares Node backend output against golden files produced by the Rust backend to ensure behavioral equivalence.

## Running

```sh
bun run test:parity
```

Or directly:

```sh
TZ=UTC bun test tests/parity/
```

## Status

All tests are **skipped** until the corresponding backend modules are ported. Each subsystem has a readiness flag in `run-parity.test.ts`:

```typescript
const BACKEND_READY = {
  analytics: false,
  replay: false,
  qmd: false,
  qmd_logs: false,
  provider_limits: false,
};
```

To enable tests for a subsystem, set its flag to `true`.

## How it works

1. Each test calls the Node backend function with the same parameters used to generate the golden file.
2. Both the actual output and the golden file are normalized (key sorting, unstable field redaction) using identical logic ported from `src-tauri/tests/golden_capture.rs`.
3. The test asserts deep equality between normalized actual and normalized golden.
4. Each test also validates the backend response against its Zod schema from `contracts/`.

## Related

- [Migration Contract Freeze and Parity Harness spec](../../docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md)
- [Rust golden capture](../../src-tauri/tests/golden_capture.rs)
- [Golden files](../../fixtures/migration/golden/)

## When to delete

After the Electron migration is complete and the Tauri backend is removed, this entire `tests/parity/` directory can be deleted.
