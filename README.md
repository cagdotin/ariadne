# Ariadne

> An observation layer for AI coding agents. Named after the mythological figure who gave Theseus the thread to navigate the Minotaur's labyrinth — Ariadne gives developers the thread to navigate what their agents are actually doing across complex codebases.

Ariadne is an Electron desktop application for exploring pi agent activity: session replay, usage analytics, file hotspots, QMD knowledge-base management, QMD CLI observability, and provider limit snapshots.

## What it does

- **Session analytics** — parses pi session logs and aggregates cost, token, model, tool, and file activity
- **Session replay** — renders full conversation trees with branching, tool calls, compactions, and model changes
- **Usage workspace** — cross-project breakdowns for cost, tools, patterns, and scoped file activity
- **QMD integration** — manages QMD indexes, collections, search, and file inclusion
- **QMD logs** — shows how agents actually used the QMD CLI across sessions
- **Provider limits** — surfaces current coding-provider quota snapshots and freshness state

## Tech stack

| Layer | Technologies |
|---|---|
| Desktop shell | Electron, preload bridge, electron-builder |
| Backend | TypeScript, Node child process, better-sqlite3 |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, TanStack Router/Table, Recharts, Zod |
| QMD bridge | TypeScript sidecar, compiled to JS for packaged builds |

## Development

```bash
# Install root dependencies
bun install

# Install QMD bridge dependencies
cd src-sidecar && bun install && cd ..

# Run the desktop app in development
bun run dev
```

### How `bun run dev` works

The dev workflow is orchestrated by `scripts/dev.ts`:

1. Starts **Vite** dev server for the renderer (port 1420)
2. Starts **esbuild** in watch mode for backend, preload, QMD bridge, and Electron main
3. **Polls Vite** until it responds (no `sleep` hacks)
4. Launches **Electron** once both Vite and initial builds are ready
5. **Auto-restarts Electron** when main or preload artifacts are rebuilt
6. Backend rebuilds are picked up by the backend supervisor on next restart

All processes shut down cleanly on Ctrl+C or when the Electron window is closed.

### Scripts

```bash
bun run dev              # Full dev environment (Vite + esbuild watch + Electron)
bun run dev:renderer     # Vite only (no Electron)
bun run build            # Renderer production build
bun run build:electron   # Backend + preload + QMD bridge + Electron main bundles
bun run package          # Full packaged Electron app
bun run check            # Typecheck + all tests + all parity
bun run test             # Unit tests (vitest)
bun run test:parity      # Non-QMD parity tests (Bun)
bun run test:parity:qmd  # QMD parity tests (Electron Node via vitest)
bun run test:parity:all  # All parity tests
bun run typecheck        # TypeScript across all tsconfig targets
```

### QMD parity tests and native modules

`better-sqlite3` is a native Node addon. The QMD parity tests run under Electron's bundled Node (via `ELECTRON_RUN_AS_NODE=1`) so the native addon ABI matches both the app and the tests. No manual rebuild step is needed after `bun install`.

## Documentation

- **[Docs Map](docs/README.md)** — reading order for the documentation set
- **[Architecture](docs/ARCHITECTURE.md)** — system shape, subsystem boundaries, major entry points, and invariants
- **[Design](docs/DESIGN.md)** — rationale, important flows, and non-obvious design decisions
- **[Information Architecture](docs/information-architecture.md)** — frontend page structure, navigation, route ownership, and layout rules
- **[Documentation Maintenance Guide](docs/documentation-maintenance.md)** — how to update docs and keep them clean
- **[QMD Knowledge](docs/knowledge/qmd.md)** — current QMD integration model, constraints, and gotchas

## Packaged runtime layout

The packaged Electron app includes only built artifacts and native modules:

```text
app.asar
  dist/                          # Vite renderer output
  electron/main/dist/            # Electron main bundle (CJS)
  electron/preload/dist/         # Preload bundle (CJS)
  backend/dist/                  # Backend bundle + analytics worker (ESM)
  src-sidecar/dist/              # QMD bridge bundle (ESM)
  src-sidecar/node_modules/      # Sidecar native dependencies
  node_modules/better-sqlite3/   # Native SQLite addon (externalized)
  node_modules/bindings/         # Native module loader
  node_modules/file-uri-to-path/ # Dependency of bindings
```

Native `.node` addons are unpacked outside the asar via `asarUnpack`. Source files, tests, fixtures, and bundled JS dependencies (react, recharts, etc.) are excluded.

## Project structure

```text
src/                  React renderer (lazy-loaded routes)
backend/              Node/TypeScript backend service
backend/workers/      Worker threads (analytics cache builder)
contracts/            Shared contracts, Zod schemas, IPC command types
electron/             Electron main + preload
src-sidecar/          QMD bridge sidecar (compiled to JS for packaged builds)
scripts/              Dev tooling (orchestrator, etc.)
tests/                Unit tests (vitest)
tests/parity/         Fixture-backed backend parity harness
fixtures/migration/   Frozen migration fixtures and goldens
docs/                 Project documentation
```
