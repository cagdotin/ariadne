# Task: Port Provider Limits to TypeScript

**Status: ✅ Completed**
**Milestone: 4 — Port Backend Subsystems**
**Depends on: ✅ Milestone 3 (runtime skeleton), ✅ comparison harness**

## Context

Ports the provider limits subsystem — cache, Codex adapter (app-server probe + session-log fallback), and staleness model.

## Spec references

- `docs/specs/2026-03-28-migration-provider-limits-backend.md`
- Rust source: `src-tauri/src/provider_limits/codex.rs` (544 lines), `src-tauri/src/provider_limits/cache.rs` (122 lines)

## Target files

```
backend/provider-limits/models.ts      # ProviderLimitSnapshot, ProviderLimitWindow, etc.
backend/provider-limits/codex.ts       # app-server probe + session-log fallback
backend/provider-limits/cache.ts       # cache with staleness model
backend/provider-limits/commands.ts    # wire handlers into request router
```

## What to build

### 1. Models (`models.ts`)

Port the Rust types:
- `ProviderLimitSnapshot` — provider_id, provider_label, account_label, plan_type, source, source_confidence, status, fetched_at, stale_after_seconds (900), windows, credits, error_message
- `ProviderLimitWindow` — id, label, used_percent, remaining_percent, window_minutes, resets_at
- `ProviderCredits` — credits used/remaining/total
- Enums: `SourceConfidence` (high/medium/low), `SnapshotStatus` (fresh/stale/error)

### 2. Codex adapter (`codex.ts`)

**`probe_app_server()`** — primary strategy:
1. Find codex binary (check `~/.bun/bin/codex`, `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, fall back to `which codex`)
2. Spawn `codex app-server` with 15s timeout
3. JSON-RPC exchange: initialize → account/rateLimits/read → account/read
4. Parse response into ProviderLimitSnapshot
5. Kill process after exchange

**`fallback_session_logs()`** — fallback strategy:
1. Resolve codex home: `ARIADNE_CODEX_HOME` or `~/.codex`
2. Walk `sessions/` for `.jsonl` files
3. Sort by modification time descending
4. Scan up to 20 most recent files for `rate_limits` entries
5. Parse last occurrence, check age (<=15min → fresh, else → stale)

**`fetch_codex_limits()`** — orchestrator:
- Try probe_app_server()
- On failure: try fallback_session_logs()
- On failure: return error snapshot

### 3. Cache (`cache.ts`)

Port `ProviderLimitsCache`:
- `get()` — cache-first, mark stale if >900 seconds old
- `refresh()` — force refresh with concurrent-refresh guard
- Error providers still return explicit snapshots, not empty results

### 4. Wire into request router

Register handlers for `get_provider_limits` and `refresh_provider_limits`, replacing stubs.

## Parity verification

Flip `BACKEND_READY.provider_limits = true` in `tests/parity/run-parity.test.ts` and run:
```
bun run test:parity
```

The provider limits parity test must pass. Note: only `fallback_session_logs()` is fixture-testable. The `probe_app_server()` path requires a live binary.

## Rules

- Match Rust behavior exactly
- Stale threshold is 900 seconds (15 min)
- Error snapshots must include all required fields
- Do not modify contracts/ or src/ files

## Acceptance

- Provider limits parity test passes
- Binary discovery checks correct paths
- App-server probe has timeout and cleanup
- Session-log fallback scans correctly
- Cache prevents concurrent refreshes
- Stale marking works on reads
