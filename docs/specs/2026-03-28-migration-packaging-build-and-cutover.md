# Migration Spec — Packaging, Build, and Cutover

Status: Approved
Date: 2026-03-28
Approved: 2026-04-08
Execution plan: `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`
Related: `docs/specs/2026-03-28-electron-node-backend-migration-overview.md`

## 1. Problem statement

Ariadne currently ships with a Tauri-oriented workflow:

- renderer dev/build through Vite
- desktop packaging through Tauri config in `src-tauri/tauri.conf.json`
- Rust backend compiled as part of the Tauri app

The migration needs a new Electron-compatible build and packaging system that works with the repo’s Bun-only package-manager policy, supports separate renderer/main/preload/backend artifacts, and allows staged cutover without deleting Tauri too early.

## 2. Goals and non-goals

### 2.1 Goals
- Define the Electron dev workflow.
- Define how renderer, main/preload, and backend service builds coordinate.
- Recommend a packaging tool and artifact layout.
- Define rollback/fallback strategy and migration milestones.
- Define explicit Tauri removal criteria.

### 2.2 Non-goals
- Designing auto-update infrastructure.
- Shipping multiple desktop shells permanently.
- Reorganizing frontend routes/pages as part of packaging work.

## 3. System context

### 3.1 Source files/docs to study
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `src-tauri/tauri.conf.json`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`

### 3.2 Current constraints
- Bun is the required package manager in this repo.
- The renderer already builds successfully with Vite.
- New Electron runtime code will introduce separate build targets: main, preload, backend service.
- The migration should keep Tauri runnable until Electron parity is proven.

## 4. Conventions and style

Recommended artifact layout:

```text
dist/                  renderer build output (keep current Vite target)
dist-electron/
  main/
  preload/
  backend/
```

Recommended config roots:

```text
electron/
backend/
tsconfig.electron.json
tsconfig.backend.json
```

## 5. Domain model

### 5.1 Build targets
1. **Renderer** — existing React/Vite app from `src/`
2. **Electron main** — window lifecycle and backend supervisor
3. **Electron preload** — named renderer bridge
4. **Backend service** — Node/TS backend runtime
5. **Internal QMD bridge** — bundled as part of backend assets or its own emitted file

### 5.2 Packaging requirements
Packaged app must include:
- renderer static assets
- Electron main/preload files
- backend service runtime files
- QMD bridge runtime files if separate
- runtime configuration necessary to locate bundled backend assets from main process

## 6. Detailed design

### 6.1 Recommended build-tool posture
Recommendation:
- keep **Vite** for the renderer
- compile Electron main/preload/backend with an explicit TypeScript bundler such as **tsup**
- package the app with **electron-builder**

Why this combination is recommended here:
- it keeps the current renderer path stable
- it keeps main/preload/backend build steps explicit and agent-readable
- it avoids coupling the entire migration to a new all-in-one Electron framework while still using a mature packager
- `electron-builder` is widely understood for macOS packaging and is compatible with Bun-driven scripts

Alternative considered: Electron Forge.
- Pros: integrated developer ergonomics
- Cons: more opinionated app/tool structure during a migration that already has enough moving parts

### 6.2 Dev workflow recommendation
Recommended scripts after migration scaffolding:

- `bun run dev:renderer` — start Vite renderer dev server
- `bun run dev:electron` — build/watch main/preload/backend and launch Electron against the Vite URL
- `bun run dev` — orchestrate renderer + electron dev processes
- `bun run build:renderer` — current renderer production build
- `bun run build:electron` — compile main/preload/backend to `dist-electron/`
- `bun run build` — full production build
- `bun run package:electron` — package Electron app

Migration rule:
- keep `bun run tauri` available until Tauri removal criteria are met

### 6.3 Bun/Electron coordination
Bun remains the package manager and task runner, but Electron runtime code should target the packaged Node/Electron environment, not Bun runtime assumptions.

Implications:
- do not require Bun to exist inside the packaged app
- current QMD bridge logic that prefers Bun at runtime must be revisited for packaged Electron
- build outputs should run under Electron/Node even if dev tooling is launched from Bun scripts

### 6.4 Packaged runtime asset resolution
Electron main must know how to find:
- renderer `dist/`
- backend service entry file in `dist-electron/backend/`
- preload bundle in `dist-electron/preload/`
- internal QMD bridge entry if emitted separately

Use one shared path-resolution helper in Electron main so asset lookup does not drift between dev and prod.

### 6.5 Staged cutover strategy
Recommended cutover stages:

#### Stage 1 — parallel scaffolding
- Electron shell exists
- Tauri remains the default working shell
- Node backend runtime may still proxy or stub some subsystems

#### Stage 2 — parity-backed subsystem cutovers
- analytics/session commands served from Node backend
- then QMD logs and provider limits
- then QMD read/write/search path
- renderer remains mostly unchanged beyond platform adapters

#### Stage 3 — Electron default dev path
- `bun run dev` launches Electron by default
- Tauri remains available as fallback

#### Stage 4 — Electron packaging default
- packaged Electron app passes smoke tests
- Tauri package flow retained only as rollback option

#### Stage 5 — Tauri removal
- only after explicit removal criteria are satisfied

### 6.6 Rollback / fallback strategy
Required rollback posture during migration:
- keep Tauri build/dev path intact until subsystem parity is proven
- keep runtime selection explicit in scripts or environment flags during transition
- do not delete `src-tauri/` or Tauri deps when the first Electron build works
- if Electron packaging reveals unresolved path/runtime issues, fallback should be “run Tauri” rather than emergency shell fixes on the migration branch

### 6.7 Tauri removal criteria
Tauri should only be removed when all of the following are true:
- shared contract freeze is complete
- Node backend passes parity on analytics/session fixtures
- Node backend passes parity on QMD read/write/search fixtures
- Node backend passes parity on QMD-log fixtures
- Node backend passes parity on provider-limit fixtures
- Electron shell replaces current dialog/event behavior successfully
- packaged Electron app passes manual smoke tests across all major surfaces
- there is no remaining renderer dependency on Tauri libraries

### 6.8 Migration milestones
1. approve build/package tool choices
2. land Electron + backend build scaffolding without changing default shell
3. land renderer platform adapters
4. cut over subsystems with parity evidence
5. switch default dev path to Electron
6. switch default packaged artifact to Electron
7. remove Tauri only after explicit acceptance gate

## 7. Error handling and failure modes

- build steps should fail independently and clearly: renderer vs main/preload vs backend
- packaged-app startup failures must surface missing-asset/path issues clearly in logs
- runtime path resolution must distinguish dev vs prod explicitly to avoid silent asset mismatches
- CI/build scripts should fail if a required emitted backend or preload artifact is missing

## 8. Security and safety considerations

- packaged app should not ship development-only backend endpoints or debug bridges
- preload bundle must remain the only renderer access point to desktop capabilities
- packaging config should avoid including unnecessary source/dev artifacts in the distributable

## 9. Testing strategy

### 9.1 Build validation
- `bun run build:renderer`
- `bun run build:electron`
- full `bun run build`
- packaged Electron smoke launch

### 9.2 Manual smoke checks
- app launches to Overview
- Sessions, Usage, QMD, QMD Logs, and Provider Limits render and load data
- folder picker works
- QMD progress events still animate in packaged Electron
- backend restarts do not hard-crash the shell

## 10. Implementation checklist
- [ ] Add Electron build outputs and scripts.
- [ ] Add backend/main/preload tsconfig + bundling config.
- [ ] Add packaged asset-path resolution helpers.
- [ ] Add Electron packaging config.
- [ ] Keep Tauri scripts/config intact during transition.
- [ ] Define and enforce Tauri removal checklist.

## 11. Rollout / cutover notes

- This spec should land early enough that subsystem teams know their target output locations and dev commands.
- Do not merge Tauri-removal PRs until the full migration checklist is satisfied.

## 12. Dependencies and parallelization

### Depends on
- backend runtime layout decision
- shell/preload direction

### Can proceed in parallel with
- contract freeze/parity harness
- subsystem backend ports, as long as emitted target paths remain stable

### Must not run in parallel with
- broad package.json/build-script rewrites from multiple agents without ownership boundaries

## 13. Resolved questions
- **Packaging tool:** `electron-builder`. Less opinionated than Electron Forge, doesn't try to own the dev workflow, compatible with our existing Vite + tsup + Bun setup. Avoids unnecessary tool churn during an already complex migration. (Approved 2026-04-08)
- **Runtime selection during overlap:** separate scripts (`bun run dev:electron` vs `bun run dev:tauri`). Explicit and clear — no hidden env-flag behavior. (Approved 2026-04-08)
