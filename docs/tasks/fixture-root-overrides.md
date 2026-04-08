# Task: Add Fixture-Root Environment Variable Overrides to Rust Backend

**Status: ✅ Completed**
**Completed by: agent**

## Summary

Added environment variable overrides to 5 Rust files so the backend can read from fixture data roots instead of the operator's real home directory.

| Variable | Default (current behavior) | Files changed |
|---|---|---|
| `ARIADNE_PI_SESSIONS_ROOT` | `~/.pi/agent/sessions` | `src-tauri/src/parser/discovery.rs`, `src-tauri/src/cache.rs` |
| `ARIADNE_QMD_CACHE_ROOT` | `$XDG_CACHE_HOME/qmd` or `~/.cache/qmd` | `src-tauri/src/commands/qmd.rs`, `src-tauri/src/sidecar.rs` |
| `ARIADNE_CODEX_HOME` | `~/.codex` | `src-tauri/src/provider_limits/codex.rs` |

Each change checks the env var first, uses it if set, otherwise falls back to existing path resolution. No behavior change when vars are unset. `cargo build` passes cleanly.

## References

- Part of Milestone 2: Contract Freeze & Parity Harness
- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md` — Section 6.4
