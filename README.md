# Ariadne

> An observation layer for AI coding agents. Named after the mythological figure who gave Theseus the thread to navigate the Minotaur's labyrinth — Ariadne gives developers the thread to navigate what their agents are actually doing across complex codebases.

Ariadne is a Tauri v2 desktop application that sits on top of existing agent infrastructure (currently [pi](https://github.com/mariozechner/pi-coding-agent)) and provides visibility into agent sessions, tool usage, file activity, and behavioral patterns.

## What It Does

- **Session analytics** — parses pi agent session logs, extracts cost, token, tool, model, and file activity data, aggregates across projects
- **Session replay** — renders full conversation trees with branching, tool calls, thinking blocks, compactions, and model changes
- **Project analytics** — per-project drill-downs into file hotspots, directory activity, tool distribution
- **Usage analytics** — cross-project tool/model/cost/time-pattern breakdowns
- **QMD integration** — manages [QMD](https://github.com/tobi/qmd) semantic search indexes with hybrid search (BM25 + vector + LLM reranking)

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Rust, Tauri v2, rusqlite, serde, tokio |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn/ui, Recharts, TanStack Router/Table, Zod |
| Sidecar | Bun, @tobilu/qmd v2, node-llama-cpp (local LLM inference) |

## Development

```bash
# Install frontend dependencies
bun install

# Install sidecar dependencies
cd src-sidecar && bun install && cd ..

# Run in development mode
bun run tauri dev
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — codemap, technology stack, boundaries, invariants
- **[Design](docs/DESIGN.md)** — detailed design for every subsystem, data flows, implementation decisions
- **[Information Architecture](docs/information-architecture.md)** — frontend page structure, navigation, layout rules
- **[QMD Knowledge](docs/knowledge/qmd.md)** — QMD capabilities, schema, sidecar protocol reference

## Project Structure

```
src/                  React frontend (pages, components, API layer, schemas)
src-tauri/            Rust backend (parser, cache, sidecar manager, Tauri commands)
src-sidecar/          QMD bridge sidecar (TypeScript, JSON-RPC over stdio)
docs/                 Project documentation
```
