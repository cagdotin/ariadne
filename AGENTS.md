# Ariadne

> Ariadne is an observation layer for AI coding agents. Named after the mythological figure who gave Theseus the thread to navigate the Minotaur's labyrinth — Ariadne gives developers the thread to navigate what their agents are actually doing across complex codebases. It sits on top of existing agent infrastructure (currently pi) and provides visibility into agent sessions, tool usage, file activity, and behavioral patterns.

## Coding Styles

- file and folder names - kebab-case only
- functions and variables - snake_case only
- types and classes - CamelCase

## Package Manager

- **Always use Bun in this repository.**
- Use `bun install`, `bun run <script>`, and `bunx <tool>`.
- Do not use `npm`, `npx`, `yarn`, or `pnpm`.

## Architecture

- **[Docs Map](docs/README.md)** — Documentation reading order and what each doc owns.
- **[Architecture](docs/ARCHITECTURE.md)** — Codemap, subsystem boundaries, and invariants.
- **[Design](docs/DESIGN.md)** — Subsystem rationale, important data flows, and design decisions.
- **[Documentation Maintenance](docs/documentation-maintenance.md)** — Read before updating, reorganizing, or cleaning documentation.
- **[Information Architecture](docs/information-architecture.md)** — Frontend page structure, navigation hierarchy, data grouping, and layout rules. All UI changes must align with this document.

## Git Rules

- **Never commit or push without explicit user approval.** All code must be reviewed first.
- Only run `git commit` or `git push` when the user explicitly tells you to.
