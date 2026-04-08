# Provider Limits Overview — Detailed Execution Plan

Status: Ready for delegation  
Date: 2026-03-28  
Owner: coding-agent  
Context: Follows research into Codex/OpenAI and Claude/Anthropic limit surfaces, local CLI capabilities, and Ariadne's current shell / analytics architecture

## Purpose

This plan adds a new Ariadne capability: a **provider limits overview** for coding-agent subscriptions such as Codex and Claude Max.

The goal is to answer:
- how much subscription usage is left right now
- when each limit window resets
- which source produced the current snapshot
- whether the displayed data is fresh, stale, or partially inferred

This is intentionally **not** an extension of pi session analytics. Ariadne's existing analytics pipeline answers "what happened in sessions." This feature answers "what quota remains with external providers right now."

---

## Product shape

### Primary user experience

V1 should expose the same provider snapshot in three places:
- **Sidebar utility card** — always-visible compact status
- **Overview page** — fuller at-a-glance summary card or section
- **Usage / Cost** — detailed provider breakdown next to existing cost analytics

### Why this shape

- The sidebar makes the feature continuously useful without navigation.
- Overview is the natural pulse-check surface.
- Usage / Cost is the best existing route for the more detailed breakdown because it already answers spending / model / token questions.

### Explicit non-goal for V1

Do **not** add:
- a new top-level sidebar destination
- a fifth major route family
- browser-cookie scraping
- a full provider/plugin authoring system

Those would all expand scope and information architecture too early.

---

## Research-backed product decisions

### 1. Treat this as a new subsystem, not a SessionCache extension

Ariadne's session analytics pipeline is backend-owned and read-only over pi session logs. Provider limits are different:
- they may come from live CLI RPC
- they may come from provider auth state
- they may fall back to local logs
- they have freshness / polling concerns that session analytics does not

This should therefore live in a dedicated backend module and cache, parallel to:
- `SessionCache`
- `QmdLogCache`
- `QmdSidecar`

### 2. Codex is the correct Phase 1 provider

Codex has the strongest source quality:
- your local `~/.codex/sessions/**/*.jsonl` already contains structured `rate_limits`
- local `codex` app-server schema exposes `account/read` and `account/rateLimits/read`
- the schema includes `primary`, `secondary`, `credits`, `planType`, and reset timing fields

This means Codex can be implemented in V1 without web scraping.

### 3. Claude should be Phase 2 and marked experimental

Claude Max is product-relevant, but its limit surfaces are less stable:
- official help documents describe the limit model
- CLI `/usage` appears to expose useful information
- CodexBar uses a mix of CLI PTY, OAuth, and web endpoints

However, there is no equivalent local, clearly structured, first-party app-server surface in the current research set comparable to Codex.

### 4. V1 should show confidence and source

This feature will blend sources with different reliability levels.

The UI should therefore always expose:
- `source` — for example `codex-app-server`, `codex-session-log`, `claude-cli`
- `status` — `fresh`, `stale`, `error`, `partial`
- `last_updated_at`

Do not present scraped or inferred values as if they were authoritative.

---

## Scope and non-goals

### V1 scope

- Codex provider support
- backend snapshot cache + refresh commands
- frontend global provider + polling
- sidebar compact card
- Overview summary card / section
- Usage / Cost detailed section
- freshness / stale / error handling
- manual refresh affordance

### Phase 2 scope

- Claude Max experimental support via CLI `/usage`
- provider-specific source badges and error states
- optional multi-account handling if needed later

### Out of scope

- web cookie import
- hidden browser automation or WebView scraping
- API billing dashboards for OpenAI API or Anthropic API
- a generalized marketplace/plugin framework
- live push updates from providers
- historical provider-limit trend analytics

---

## Recommended user-facing model

The UI should think in terms of **providers** and **windows**.

### Provider snapshot

Suggested shape:

```ts
interface ProviderLimitSnapshot {
  provider_id: string;
  provider_label: string;
  account_label: string | null;
  plan_type: string | null;
  source: string;
  source_confidence: "high" | "medium" | "low";
  status: "fresh" | "stale" | "partial" | "error";
  fetched_at: string;
  stale_after_seconds: number;
  windows: ProviderLimitWindow[];
  credits: ProviderCredits | null;
  error_message: string | null;
}

interface ProviderLimitWindow {
  id: string;
  label: string;
  used_percent: number | null;
  remaining_percent: number | null;
  window_minutes: number | null;
  resets_at: string | null;
}

interface ProviderCredits {
  has_credits: boolean;
  unlimited: boolean;
  balance: string | null;
}
```

### Important UI rule

The UI should prefer **percentage + reset time** over trying to invent message counts.

Why:
- provider help docs are explicit that message counts vary with context size and task complexity
- percentages and reset times are the more honest cross-provider abstraction

---

## Architecture fit

### Backend

Add a new backend subsystem:
- provider discovery / polling
- in-memory snapshot cache
- per-provider source adapters

Suggested modules:
- `src-tauri/src/models/provider_limits.rs`
- `src-tauri/src/provider_limits/`
- `src-tauri/src/provider_limits/cache.rs`
- `src-tauri/src/provider_limits/codex.rs`
- `src-tauri/src/provider_limits/claude.rs` (Phase 2)
- `src-tauri/src/commands/provider_limits.rs`

### Frontend

Add a global provider for shared polling state.

Suggested modules:
- `src/api/provider-limits.ts`
- `src/schemas/provider-limits.ts`
- `src/components/provider-limits-provider.tsx`
- `src/components/provider-limits-sidebar-card.tsx`
- `src/components/provider-limits-summary-card.tsx`
- `src/components/provider-limits-detail.tsx`

### App-shell placement

Mount the global frontend provider near existing global providers in `src/main.tsx`.

This is appropriate because provider-limit state:
- is shared across multiple routes
- should survive route changes
- is not route-local data

---

## Surface plan

## 1. Sidebar

### Goal

Add a compact, always-visible provider status card below the main nav.

### Content

Per enabled provider, show:
- provider label
- one compact primary bar
- optional secondary bar
- reset countdown or reset time
- freshness / stale indicator

### Constraints

- must remain legible in collapsed sidebar mode
- should degrade to icon + tooltip or short status text when collapsed
- must not visually compete with the main navigation

### Suggested behavior

- expanded sidebar: stacked provider mini-cards
- collapsed sidebar: one small status glyph per provider or a single aggregate glyph with tooltip

## 2. Overview page

### Goal

Show a richer "Limits" section for quick situational awareness.

### Placement

Recommended: below the top stat cards, above or below the trend sections.

### Content

- one card per provider
- larger labels
- both windows when available
- source / freshness label
- action row with refresh

## 3. Usage / Cost

### Goal

Put the detailed subscription breakdown where users already think about consumption.

### Placement

Integrate into `src/pages/usage/cost-tab.tsx`.

Recommended: insert after the mini stat cards and before the existing cost/token charts.

### Content

- same snapshots as Overview, but with more metadata
- plan type
- source label
- credits block when present
- explanatory copy about what these percentages mean

### Important route decision

Do **not** add a new `/usage/limits` tab in V1.

Reason:
- current information architecture treats Usage tabs as stable analytics categories
- provider limits fit well inside Cost without introducing another tab or route change

---

## Provider strategy

## Phase 1 — Codex only

### Primary source

Use local `codex` app-server RPC for the current account snapshot.

Target methods:
- `account/read`
- `account/rateLimits/read`

### Why

- strongest source confidence in the current research
- local and subscription-aware
- no web scraping
- already available on the user's machine

### V1 implementation style

Start with a **short-lived probe process**, not a long-lived sidecar.

Why:
- polling cadence is low
- implementation is simpler
- lower risk than introducing another always-on child process immediately

If startup latency is poor, a persistent sidecar can be added later.

### Codex fallback

If RPC fails:
- read the most recent `rate_limits` snapshot from `~/.codex/sessions/**/*.jsonl`
- mark source as `codex-session-log`
- downgrade confidence
- mark the result stale if the snapshot age exceeds the freshness window

### Explicit V1 rule

Do not silently merge RPC and log fallback into one "authoritative" value.

Keep the chosen source visible.

## Phase 2 — Claude Max experimental

### Initial source

CLI probe via `claude` and `/usage`.

### Why this first

- avoids browser-cookie scraping
- stays closer to an installed, user-authorized local client
- aligns better with Ariadne's desktop-app posture

### Risks

- PTY parsing is more brittle than Codex RPC
- wording may change between CLI versions
- model/window naming may differ across Claude plans

### UI requirement

Claude should ship behind an explicit `experimental` label until its source quality is proven.

## Not recommended for V1

- browser cookie import
- WebView scraping
- undocumented web endpoints as the primary source

These may be explored later, but they should not be Ariadne's initial implementation posture.

---

## Backend design

## 1. In-memory cache

Add `ProviderLimitsCache` as a managed Tauri state.

Responsibilities:
- hold the latest snapshot per provider
- remember fetch timestamps
- track in-flight refreshes
- avoid duplicate probes when multiple frontend components request data

Suggested behavior:
- lazy initialization on first request
- manual refresh command
- periodic frontend polling still hits the backend cache, not the provider directly every time

## 2. Refresh semantics

### Default cadence

- automatic refresh every 5 minutes
- refresh on app startup
- refresh when app regains focus
- manual refresh button always available

### Freshness policy

Suggested initial values:
- `fresh` for snapshots <= 10 minutes old
- `stale` after 10 minutes
- preserve old snapshot while revalidating

This mirrors Ariadne's existing pattern of keeping previous UI data visible during silent refreshes.

## 3. Tauri commands

Suggested commands:
- `get_provider_limits()`
- `refresh_provider_limits()`

Optional future split:
- `get_provider_limits_summary()`
- `refresh_provider_limit(provider_id)`

### Command contract

- return all known providers in one payload
- include unavailable/error providers as explicit entries
- never hide provider failure by dropping it from the response

## 4. Codex adapter

Responsibilities:
- spawn `codex` app-server probe
- make `account/read`
- make `account/rateLimits/read`
- normalize response into Ariadne snapshot model
- fallback to latest session log when RPC fails

### Normalization expectations

Map:
- `planType` -> `plan_type`
- `primary.usedPercent` -> `used_percent`
- `primary.windowDurationMins` -> `window_minutes`
- `primary.resetsAt` -> `resets_at`
- same for `secondary`
- `credits` -> normalized credits object

### Error handling

Differentiate:
- `codex not installed`
- `not logged in`
- `rpc failed`
- `fallback log unavailable`

## 5. Claude adapter

Phase 2 module only.

Responsibilities:
- run CLI PTY probe
- parse `/usage`
- normalize session and weekly windows
- report partial confidence

---

## Frontend design

## 1. Global provider

Create `ProviderLimitsProvider` mounted near the app root.

Responsibilities:
- fetch initial provider data
- poll on interval
- refresh on window focus
- expose shared state to sidebar, Overview, and Usage / Cost

Suggested exposed shape:
- `snapshots`
- `loading`
- `refreshing`
- `error`
- `refresh()`

### Why global

Without a global provider:
- sidebar, Overview, and Usage would each fetch separately
- multiple refresh loops would duplicate backend work
- freshness could drift across surfaces

## 2. Sidebar component

Suggested file:
- `src/components/provider-limits-sidebar-card.tsx`

Responsibilities:
- compact display only
- no fetching
- no provider-specific logic

## 3. Overview component

Suggested file:
- `src/components/provider-limits-summary-card.tsx`

Responsibilities:
- render a cleaner, roomier card group
- show plan/source/freshness more explicitly

## 4. Usage / Cost component

Suggested file:
- `src/components/provider-limits-detail.tsx`

Responsibilities:
- richer detail layout
- helper text about variable message counts
- credits block if available
- same snapshot data, just more explanation

## 5. Manual refresh

The UI should expose a refresh affordance near provider limits, even though auto-refresh exists.

Suggested placement:
- small refresh button in the Overview / Cost section header
- optional tiny refresh icon in sidebar card expanded mode

---

## File touch points

## Backend

- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/commands/provider_limits.rs`
- `src-tauri/src/models/mod.rs`
- `src-tauri/src/models/provider_limits.rs`
- `src-tauri/src/provider_limits/mod.rs`
- `src-tauri/src/provider_limits/cache.rs`
- `src-tauri/src/provider_limits/codex.rs`
- `src-tauri/src/provider_limits/claude.rs` (Phase 2)

Potential dependency changes:
- add any Rust crates needed for process orchestration / JSON handling if current stdlib + serde are insufficient

## Frontend

- `src/main.tsx`
- `src/app.tsx`
- `src/api/provider-limits.ts`
- `src/schemas/provider-limits.ts`
- `src/components/provider-limits-provider.tsx`
- `src/components/provider-limits-sidebar-card.tsx`
- `src/components/provider-limits-summary-card.tsx`
- `src/components/provider-limits-detail.tsx`
- `src/pages/dashboard.tsx`
- `src/pages/usage/cost-tab.tsx`

## Documentation to update when implementation lands

- `docs/ARCHITECTURE.md`
- `docs/DESIGN.md`
- `docs/information-architecture.md`

Reason:
- new backend subsystem
- new global frontend provider
- new app-shell utility section
- new Overview / Usage responsibilities

---

## Implementation phases

## Phase A — Backend foundation

### Goal

Create the provider limits backend subsystem and return static / mocked normalized payloads first.

### Tasks

- add models and command module
- wire `ProviderLimitsCache` into Tauri state
- expose `get_provider_limits` and `refresh_provider_limits`
- define the normalized payload shape clearly

### Acceptance criteria

- frontend can call the command successfully
- payload schema is stable enough to build UI against

## Phase B — Codex adapter

### Goal

Replace mock data with live Codex data.

### Tasks

- implement Codex app-server probe
- parse `account/read`
- parse `account/rateLimits/read`
- normalize fields
- add session-log fallback
- return useful error states when unavailable

### Acceptance criteria

- Codex snapshot loads on the local machine
- fallback works when RPC fails
- source and freshness are visible in payload

## Phase C — Frontend global provider

### Goal

Create one shared refresh loop for all provider-limit surfaces.

### Tasks

- add Zod schemas
- add typed API wrapper
- add `ProviderLimitsProvider`
- poll every 5 minutes
- refresh on focus
- preserve stale data while refreshing

### Acceptance criteria

- consumers receive one shared snapshot set
- silent refreshes do not flash loading states unnecessarily

## Phase D — Sidebar surface

### Goal

Add the compact shell-level utility card.

### Tasks

- add sidebar component
- handle expanded/collapsed states
- show stale/error states clearly

### Acceptance criteria

- compact, legible status visible in the shell
- collapsed mode remains usable

## Phase E — Overview surface

### Goal

Add richer provider summary cards to the dashboard.

### Tasks

- integrate summary component into `dashboard.tsx`
- keep current dashboard hierarchy readable
- avoid overwhelming the top fold

### Acceptance criteria

- limits are visible without dominating the page
- refresh and freshness states are obvious

## Phase F — Usage / Cost surface

### Goal

Add the detailed breakdown to the Cost tab.

### Tasks

- integrate detail component into `cost-tab.tsx`
- align copy and layout with existing analytics cards

### Acceptance criteria

- detailed provider-limit information is available in the analytics workspace
- no route changes required

## Phase G — Claude experimental follow-up

### Goal

Add Claude Max support carefully after Codex is stable.

### Tasks

- implement CLI probe
- normalize session + weekly windows
- label provider as experimental until stable

### Acceptance criteria

- Claude appears when the probe succeeds
- failures are visible and non-destructive

---

## Validation

For each implementation phase, run:
- `bunx tsc --noEmit`
- `bun run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`

Manual verification:
- launch app with Codex installed and logged in
- confirm sidebar, Overview, and Usage / Cost all show the same snapshot
- confirm manual refresh updates all three surfaces
- confirm stale data remains visible during refresh
- confirm error states remain non-blocking
- confirm collapsed sidebar still communicates useful status

Phase 2 manual verification:
- confirm Claude absence does not break Codex
- confirm Claude failures render as explicit provider errors rather than disappearing

---

## Risks and mitigations

## Risk 1 — Codex RPC process complexity

If app-server probing is more complex than expected, implementation could drift.

Mitigation:
- start with a short-lived process
- keep fallback session-log parsing available
- avoid building a persistent sidecar until needed

## Risk 2 — Claude parsing brittleness

CLI text parsing may break with upstream changes.

Mitigation:
- defer Claude to Phase 2
- mark as experimental
- keep source / confidence visible

## Risk 3 — UI noise

Putting the feature in sidebar, Overview, and Usage could overwhelm the app.

Mitigation:
- keep sidebar compact
- keep Overview high-level
- put detail only in Usage / Cost

## Risk 4 — Source ambiguity

Users may assume all values are official and equally reliable.

Mitigation:
- always show source
- always show freshness
- distinguish partial / stale / error states explicitly

---

## Open questions

These do not block Phase A through F, but should be decided during implementation:

1. Should the sidebar show all providers individually or collapse to a single aggregate mini-card when more than two providers exist?
2. Should manual refresh live in the app header eventually, or remain local to the provider-limit surfaces?
3. Should Codex fallback logs be read only from the newest session, or should the adapter scan backwards until it finds the freshest entry with `rate_limits`?
4. Do we want a future settings surface for enabling / disabling providers, or should provider discovery remain automatic for now?

---

## Recommended implementation order

If this work is delegated or split across sessions, use this order:

1. Phase A — backend foundation
2. Phase B — Codex adapter
3. Phase C — global frontend provider
4. Phase D — sidebar
5. Phase E — Overview
6. Phase F — Usage / Cost
7. Phase G — Claude experimental

This keeps the most reliable provider and the shared data path working before UI polish expands.
