# Implementation Tasks

Status: active  
Last updated: 2026-04-08

This directory contains **agent-ready implementation briefs** for the highest-priority follow-up work after the Electron migration.

Each task is written so a subagent can execute it without needing extra historical context.

## Priority order

| Priority | Task | Why it matters | Depends on |
|---|---|---|---|
| P0 | `01-package-safe-qmd-bridge-runtime.md` | Packaged QMD write/search flows are the biggest runtime risk | — |
| P1 | `02-electron-dev-watch-workflow.md` | Current dev loop is brittle and slows all follow-up work | — |
| P1 | `03-qmd-parity-node-runner.md` | QMD parity is the only major backend surface not covered in regular checks | — |
| P1 | `04-package-output-hardening.md` | Packaging still includes broad artifacts and needs a tighter runtime boundary | `01-package-safe-qmd-bridge-runtime.md` |
| P2 | `05-typed-preload-contracts.md` | Strengthens the renderer ↔ preload boundary and removes `unknown` drift | — |
| P2 | `06-analytics-worker-thread.md` | Moves heavy analytics parsing off the backend event loop | — |
| P2 | `07-strict-session-replay-contract.md` | Replay payloads are still only permissively validated | — |
| P3 | `08-renderer-bundle-splitting.md` | Production bundle is too large and should be lazy-split | — |

## Suggested handoff order

If you are sending these to subagents one at a time, use this sequence:

1. `01-package-safe-qmd-bridge-runtime.md`
2. `02-electron-dev-watch-workflow.md`
3. `03-qmd-parity-node-runner.md`
4. `04-package-output-hardening.md`
5. `05-typed-preload-contracts.md`
6. `06-analytics-worker-thread.md`
7. `07-strict-session-replay-contract.md`
8. `08-renderer-bundle-splitting.md`

## Rules for task execution

- Use **Bun** for scripts and package management.
- Keep Electron main thin.
- Do not reintroduce legacy runtime assumptions.
- Prefer the smallest safe change that resolves the stated gap.
- Validate with the exact commands listed in each task.
