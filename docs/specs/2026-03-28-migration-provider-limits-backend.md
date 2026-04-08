# Migration Spec — Provider Limits Backend Rewrite

Status: Draft
Date: 2026-03-28
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

Provider limits is already a distinct backend subsystem with its own cache, source adapters, freshness model, and frontend provider. Even though it is smaller than analytics or QMD, it has live-adapter behavior that makes semantic drift easy:

- source selection matters (`codex-app-server` vs `codex-session-log`)
- freshness and stale handling matter
- error providers are still part of the contract
- frontend polling expects stable shapes

This subsystem needs a clean TypeScript port that preserves current behavior and current source-of-truth rules.

## 2. Goals and non-goals

### 2.1 Goals
- Port provider-limit cache and Codex adapter behavior to TypeScript.
- Preserve current response contract and source/freshness semantics.
- Preserve cache-first reads and explicit refresh behavior.
- Keep provider probing out of Electron main.

### 2.2 Non-goals
- Adding new providers in phase 1.
- Redesigning the UI provider card surfaces.
- Changing polling cadence or frontend provider ownership in this migration spec.

## 3. System context

### 3.1 Source files/docs to study
- `src-tauri/src/provider_limits/cache.rs`
- `src-tauri/src/provider_limits/codex.rs`
- `src-tauri/src/models/provider_limits.rs`
- `src-tauri/src/commands/provider_limits.rs`
- `src/api/provider-limits.ts`
- `src/schemas/provider-limits.ts`
- `src/components/provider-limits-provider.tsx`
- `docs/exec-plans/pending/2026-03-28-provider-limits.md`
- `docs/ARCHITECTURE.md`

### 3.2 Current behavior to preserve
- `get_provider_limits()` is cache-first
- `refresh_provider_limits()` force-refreshes
- Codex app-server is the primary source
- session-log fallback is used when app-server probing fails
- stale threshold is 15 minutes in backend cache logic
- error providers still return explicit snapshot entries rather than disappearing

## 4. Conventions and style

Recommended target modules:

```text
backend/provider-limits/
  cache.ts
  codex.ts
  models.ts
  commands.ts
```

Keep adapter logic separate from cache orchestration so fallback semantics are easy to test.

## 5. Domain model

### 5.1 Commands covered
- `get_provider_limits`
- `refresh_provider_limits`

### 5.2 Cache invariants
- one cached array of provider snapshots
- last-fetch metadata
- stale marking on read when snapshots age out
- concurrent refresh guard to avoid duplicate probes

### 5.3 Source-of-truth order
Current source precedence to preserve:
1. Codex app-server RPC probe
2. latest usable Codex session-log `rate_limits` snapshot
3. explicit error snapshot

## 6. Detailed design

### 6.1 Contract changes
**No contract changes.**

### 6.2 Cache rewrite
Port current cache behavior into backend TypeScript:
- cache-first `get`
- forced `refresh`
- stale-status marking on reads
- refresh-in-progress guard

Recommended nuance to preserve:
- if refresh is already in progress, return current cached data rather than starting another provider probe

### 6.3 Codex adapter rewrite
Port current adapter semantics as directly as possible:
- locate Codex binary
- spawn app-server
- perform initialize → `account/rateLimits/read` → `account/read`
- normalize windows/credits/plan/account label
- kill the child process after probe completes
- on failure, scan recent session logs for `rate_limits`
- if both fail, return explicit error snapshot

### 6.4 Freshness model
Preserve current backend semantics:
- stale threshold is backend-owned, not renderer-owned
- stale marking happens by comparing `fetched_at` age on cache reads
- fallback log snapshots can still be marked `fresh` if recent enough

### 6.5 Error handling and explicit availability
The backend must continue returning explicit snapshot entries for unavailable/error states.

Why:
- the frontend provider surfaces are designed to show source/error state, not silently hide providers
- dropping providers from the payload would change user-visible behavior

### 6.6 Fixture/parity strategy
Required fixtures/transcripts:
- successful app-server handshake + limits/account responses
- app-server timeout/failure with successful session-log fallback
- missing Codex binary
- missing both app-server and fallback logs
- stale fallback snapshot

Use sanitized JSON transcripts rather than real account sessions when possible.

### 6.7 Semantic drift traps
1. `SourceConfidence` and `SnapshotStatus` are serialized as lowercase enums.
2. provider entries should always include `provider_id`, `provider_label`, `source`, `status`, and timestamps even in error cases.
3. fallback logs are currently sourced from `~/.codex/sessions/**` rather than a generalized provider registry.
4. the current frontend polling provider assumes backend responses are already normalized.

## 7. Error handling and failure modes

- failed app-server probe should not abort the entire command without attempting fallback
- malformed session-log entries should be skipped while scanning recent files
- missing binary should become an explicit error snapshot, not an exception that breaks the route/provider
- backend refresh failures should preserve the last known cache where possible

## 8. Security and safety considerations

- sanitize provider transcripts used in fixtures
- avoid persisting live auth tokens or sensitive account details in logs
- provider probing stays backend-only; renderer never spawns provider CLIs directly

## 9. Testing strategy

### 9.1 Unit tests
- stale-marking logic
- app-server response normalization
- session-log fallback extraction
- explicit error snapshot generation

### 9.2 Integration/parity tests
- current Rust backend vs Node backend outputs on shared provider transcripts
- cache-first vs refresh behavior parity
- explicit error-state parity

## 10. Implementation checklist
- [ ] Port provider-limit models and cache behavior.
- [ ] Port Codex app-server probe flow.
- [ ] Port session-log fallback scan logic.
- [ ] Add sanitized provider fixtures/transcripts.
- [ ] Validate parity for success, fallback, stale, and error cases.

## 11. Rollout / cutover notes

- This subsystem is safe to cut over independently once contract parity is proven.
- The existing frontend `ProviderLimitsProvider` can remain mostly unchanged if `src/api/provider-limits.ts` keeps its current surface.

## 12. Dependencies and parallelization

### Depends on
- contract freeze/parity harness
- backend process architecture

### Can proceed in parallel with
- analytics/session backend port
- QMD subsystem rewrite
- QMD logs rewrite
- Electron shell work

### Must not run in parallel with
- another agent editing shared provider-limit contracts or fixture transcripts

## 13. Open questions
- Should the Node port continue probing Codex via a short-lived process per refresh in phase 1, or is there enough evidence to justify a persistent provider probe helper process later as a separate optimization?
