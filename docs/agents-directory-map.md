# Agents Directory Map

> Reference: `/Users/cgn/git/0xcgn/agents`
> This is the **pi package** that defines all custom agent infrastructure — extensions, skills, themes, and documentation.

## What It Is

A pi package registered in `~/.pi/agent/settings.json` under `packages`. Pi discovers extensions, skills, and themes from it via the `pi` manifest in `package.json`. Everything here runs inside pi sessions.

## Directory Structure

```
agents/
├── AGENTS.md                    # Agent operating notes — the entry point
├── package.json                 # Pi manifest + bun scripts
├── biome.json                   # Linting/formatting config
├── lefthook.yml                 # Pre-commit hooks (runs `bun run check`)
├── vitest.config.ts             # Test runner config
├── skills-lock.json             # Skill version lock
│
├── extensions/                  # Runtime code — loaded by pi at startup
│   ├── __mocks__/               # Shared test mocks (pi-ai, pi-tui, pi-coding-agent)
│   ├── answer/                  # Q&A extraction from assistant messages
│   ├── autoresearch/            # Autonomous experiment loop infrastructure
│   ├── cmux/                    # cmux terminal multiplexer integration
│   ├── damage-control/          # Safety guardrails for destructive operations
│   ├── expert/                  # Domain expertise persistence (.pi/expertise/)
│   ├── qmd/                     # QMD markdown search with TUI dashboard
│   ├── session-stats/           # In-session observability panel
│   ├── tmux/                    # tmux integration (notifications, pane titles)
│   ├── todos/                   # File-based todo management with TUI
│   └── tracks/                  # Workstream tracking across sessions
│
├── skills/                      # On-demand instruction bundles (markdown, not runtime)
│   ├── autoresearch-create/     # Set up + run experiment loops
│   ├── browser/                 # Lightpanda headless browser for web fetching
│   ├── github/                  # Git/GitHub workflows (commits, PRs, CI, issues)
│   ├── linear/                  # Linear issue tracker CLI
│   ├── plan/                    # Spec + execution plan creation
│   ├── qmd/                     # QMD search skill (how to query)
│   ├── review/                  # Multi-lens code review
│   └── youtube-transcript/      # YouTube transcript extraction
│
├── pi-themes/
│   └── tokyo-night.json         # Dark theme with Tokyo Night palette
│
├── scripts/                     # Validation & automation
│   ├── audit-docs.ts            # Documentation audit
│   ├── validate-docs.ts         # Doc structure validation
│   └── validate-boundaries.ts   # Architecture boundary checks
│
├── docs/                        # Knowledge base
│   ├── ARCHITECTURE.md          # Repository map & invariants
│   ├── QUALITY.md               # Quality scorecard & gaps
│   ├── TESTING.md               # Testing model & boundaries
│   ├── CONTRIBUTING-DOCS.md     # Doc contribution rules
│   ├── specs/                   # Implementation specs (what/why/how)
│   ├── exec-plans/              # Execution plans (active/ + completed/)
│   ├── references/              # Pi API reference, internal docs
│   └── resources/               # External resource captures
│
└── .pi/                         # Runtime state (not source code)
    ├── expertise/               # Domain expertise YAML files
    ├── todos/                   # Project todos
    ├── tracks/                  # Workstream tracks
    ├── skills/                  # Local-only skills (audit, frontend-design)
    └── qmd.json                 # QMD freshness state
```

## Extensions — What Each One Does

| Extension | Purpose | Trigger | Data |
|---|---|---|---|
| **answer** | Extracts questions from assistant output, interactive Q&A TUI | `/answer`, `Ctrl+Q` | — |
| **autoresearch** | Autonomous experiment loop with dashboard | `/autoresearch` | `autoresearch.jsonl`, `.md`, `.sh` in project |
| **cmux** | cmux detection, notifications, tab titles, skill injection | Auto-detected | — |
| **damage-control** | Safety guardrails — blocks/asks on destructive commands | Always on | `damage-control-rules.yaml` |
| **expert** | Persistent domain expertise (mental models) | `/expert`, `expertise` tool | `.pi/expertise/*.yaml` |
| **qmd** | QMD markdown search with split-pane TUI | `/qmd`, `Ctrl+Alt+Q` | `.pi/qmd.json` |
| **session-stats** | In-session observability — tool calls, turns, models, files | `/session-stats`, `Ctrl+Alt+T` | In-memory per session |
| **tmux** | tmux badges, notification sounds, pane titles | Auto-detected | — |
| **todos** | File-based todos with claim/release + TUI | `/todos`, `todo` tool | `.pi/todos/*.md` |
| **tracks** | Multi-session workstream tracking | `/track`, `track` tool | `.pi/tracks/<slug>/` |

## Skills — What Each One Does

| Skill | Purpose | Loaded When |
|---|---|---|
| **autoresearch-create** | Sets up + runs optimization experiment loops | "run autoresearch", "optimize X" |
| **browser** | Fetch web pages via Lightpanda headless browser | Need to read web content |
| **github** | Conventional commits, PR review, CI, issues, gh CLI | Committing, PRs, GitHub ops |
| **linear** | Linear issue management via `linear` CLI | Managing issues/projects |
| **plan** | Create implementation specs + execution plans | Medium+ tasks, planning |
| **qmd** | QMD search reference (query types, commands) | Semantic search of repo docs |
| **review** | Multi-lens code review (architecture, security, quality...) | Reviewing code/diffs |
| **youtube-transcript** | Extract YouTube video transcripts | Summarize/analyze videos |

## Pi Data Layout

### Session Storage

```
~/.pi/
├── agent/
│   ├── settings.json          # Global config (model, packages, theme)
│   ├── auth.json              # API keys (encrypted)
│   ├── keybindings.json       # Custom keybindings
│   ├── sessions/              # All session .jsonl files
│   │   └── --<encoded-path>--/
│   │       └── YYYY-MM-DDTHH-MM-SS-sssZ_<uuid>.jsonl
│   ├── git/                   # Cloned git packages
│   └── skills/                # Local skill definitions
│
├── history/
│   └── <project>/
│       └── artifacts/
│           └── <session-id>/  # Artifacts written via write_artifact
│               ├── plans/
│               ├── context/
│               └── *.md
│
└── todos/                     # Global todos (rarely used)
```

### Session .jsonl Format

Each session is an append-only event log. Event types:
- `session` — init header (version, id, timestamp, cwd)
- `model_change` — provider + model switch
- `thinking_level_change` — thinking level update
- `message` — user/assistant/toolResult messages with content blocks
- `custom_message` — extension events (cmux-detected, branch-summary, etc.)

Content block types within messages:
- `text` — plain text
- `thinking` — model reasoning (with signature)
- `toolCall` — tool invocation (id, name, arguments)

Each message includes: `usage` (tokens, cost), `stopReason`, `responseId`, `provider`, `model`.

### Per-Project Runtime State

```
<project>/.pi/
├── tracks/          # Workstream tracks (YAML + markdown)
├── todos/           # Project todos (markdown files)
├── expertise/       # Domain expertise (YAML per domain)
├── qmd.json         # QMD freshness tracking
└── autoresearch.jsonl  # Experiment log (when active)
```

## Conventions

- **Naming**: files `kebab-case`, functions `snake_case`, types `CamelCase`
- **Package manager**: Bun only (`bun install`, `bun run`, `bunx`)
- **Validation**: TypeBox + StringEnum at tool boundaries, Zod at runtime data boundaries
- **Extensions**: each has `index.ts`, `README.md`, types, helpers, storage, tool
- **Skills**: each has `SKILL.md` + optional `references/` directory
- **Git**: never commit without explicit user approval
- **Docs**: every extension gets a README; decisions in repo files, not chat
