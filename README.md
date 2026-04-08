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
| QMD bridge | Bun + TypeScript (`src-sidecar/qmd-bridge.ts`) |

## Development

```bash
# Install root dependencies
bun install

# Install QMD bridge dependencies
cd src-sidecar && bun install && cd ..

# Run the desktop app in development
bun run dev
```

Useful scripts:

```bash
bun run dev:renderer   # Vite only
bun run build          # Renderer build
bun run build:electron # Backend + preload + Electron main bundles
bun run package        # Full packaged Electron build
bun run check          # Typecheck + parity tests
bun run test:parity    # Fixture-backed backend parity tests
```

## Documentation

- **[Docs Map](docs/README.md)** — reading order for the documentation set
- **[Architecture](docs/ARCHITECTURE.md)** — system shape, subsystem boundaries, major entry points, and invariants
- **[Design](docs/DESIGN.md)** — rationale, important flows, and non-obvious design decisions
- **[Information Architecture](docs/information-architecture.md)** — frontend page structure, navigation, route ownership, and layout rules
- **[Documentation Maintenance Guide](docs/documentation-maintenance.md)** — how to update docs and keep them clean
- **[QMD Knowledge](docs/knowledge/qmd.md)** — current QMD integration model, constraints, and gotchas

## Project structure

```text
src/                  React renderer
backend/              Node/TypeScript backend service
contracts/            Shared contracts and channel names
electron/             Electron main + preload
src-sidecar/          QMD bridge process
tests/parity/         Fixture-backed backend parity harness
fixtures/migration/   Frozen migration fixtures and goldens
docs/                 Project documentation
```
