# Session Graph Structure Reference

> Canonical reference for the graph IR that powers session exploration in Ariadne.

## Overview

Ariadne builds a **typed, provenance-tracked graph** for every AI agent session. The graph is derived from raw pi replay logs and optionally augmented with live repository context. It serves as the single source of truth for understanding what an agent did, which files it touched, what context framed the session, and how those elements relate.

The graph operates in two layers:

1. **Graph IR** (`SessionGraphPayload`) — the canonical, richly-typed intermediate representation.
2. **Exploration Payload** (`ExplorationPayload`) — a flatter, UI-oriented projection of the graph IR for frontend consumption.

---

## Graph IR

**Contract:** `contracts/graph/types.ts`
**Derivation:** `backend/analytics/graph/derive-session-graph.ts`
**Augmentation:** `backend/analytics/graph/augment-repo-context.ts`

### Payload shape

```ts
SessionGraphPayload {
  session_id: string;
  project_path: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  has_repo_context: boolean;
  derived_at: string; // ISO timestamp
}
```

---

## Nodes

Every node carries identity, classification, provenance, and optional metadata:

```ts
GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  availability: AvailabilityState;
  confidence: Confidence;
  evidence: GraphEvidence[];
  metadata?: Record<string, unknown>;
}
```

### Node kinds

| Kind | Purpose | Typical metadata |
|---|---|---|
| `session` | Root node for the entire session | `{ session_id }` |
| `session_framing` | Synthetic group for all context that *frames* the session | — |
| `runtime_context` | CWD, model changes, thinking level, custom messages (e.g. `cmux-detected`) | `{ cwd }`, `{ provider, model_id }`, `{ thinking_level }`, `{ custom_type }` |
| `instruction_source` | Ambient instruction files found in repo (CURSOR.md, .cursorrules, COPILOT.md, etc.) | `{ path }` |
| `system_prompt` | System prompt placeholder — always `unavailable` (not captured in replay logs) | — |
| `developer_prompt` | Developer prompt placeholder — always `unavailable` | — |
| `agents_doc` | AGENTS.md files — either explicitly read during session or discovered in repo tree | `{ path }` |
| `user_prompt` | Each user message, one per conversation turn | `{ turn_index, text }` |
| `assistant_turn` | Each assistant response turn; groups tool calls for that turn | `{ turn_index }` |
| `tool_call` | A non-discovery tool invocation (Read, Edit, Write, etc.) | `{ tool_name, tool_index, turn_index, file_path? }` |
| `search_query` | A discovery/search tool invocation (Glob, Grep, Bash+rg/find/ls, etc.) | `{ tool_name, tool_index, turn_index }` |
| `directory` | Directory node (defined in schema; not yet emitted by derivation) | — |
| `source_file` | Code file (.ts, .tsx, .py, etc.) | `{ path }` |
| `doc_file` | Documentation file (.md, .mdx, .txt, .rst) | `{ path }` |
| `doc_section` | A section within a document (defined in schema; not yet emitted) | — |

### Node ID conventions

Node IDs are deterministic and collision-free. Key patterns:

| Pattern | Example |
|---|---|
| `session_{session_id}` | `session_abc123` |
| `framing_{session_id}` | `framing_abc123` |
| `framing_cwd` | `framing_cwd` |
| `framing_model_{entry_id}` | `framing_model_e7` |
| `framing_system_prompt` | `framing_system_prompt` |
| `user_prompt_{turn_index}` | `user_prompt_0` |
| `assistant_turn_{turn_index}` | `assistant_turn_0` |
| `tool_{turn_index}_{tool_index}` | `tool_0_2` |
| `file_{sanitized_path}` | `file_src_lib_utils.ts` |

File node IDs are generated via `make_file_node_id()` (`backend/analytics/graph/graph-ids.ts`) — the path is normalized to project-relative, then sanitized (non-alphanumeric/dot/hyphen/underscore characters become underscores). This ensures identity stability between replay derivation and repo augmentation.

---

## Edges

Every edge carries source/target, classification, provenance, and an optional label:

```ts
GraphEdge {
  source_id: string;
  target_id: string;
  kind: GraphEdgeKind;
  availability: AvailabilityState;
  confidence: Confidence;
  evidence: GraphEvidence[];
  label: string | null;
}
```

### Edge kinds

| Kind | Meaning | Typical source → target |
|---|---|---|
| `framed_by` | Structural framing relationship | session → session_framing, session_framing → runtime_context/prompts |
| `prompted` | User initiated an action | session → user_prompt, user_prompt → assistant_turn |
| `invoked_tool` | Tool execution within a turn | assistant_turn → tool_call / search_query |
| `searched_for` | Search action | search_query → artifact |
| `read` | File read operation | tool_call → source_file / doc_file |
| `edited` | File edit operation | tool_call → source_file / doc_file |
| `wrote` | File write/create operation | tool_call → source_file / doc_file |
| `discovered` | Discovery result (defined; not yet emitted) | search_query → file |
| `linked_to` | Markdown cross-reference link | doc → doc |
| `imports` | Code-level import dependency | source_file → source_file |
| `belongs_to` | Containment relationship | doc_section → doc_file |
| `influenced_by` | Inferred causal influence | (reserved for future use) |
| `constrained_by` | Instruction constraint on session | session_framing → agents_doc / instruction_source |
| `adjacent_unexplored` | Structurally nearby but not touched | file → file |

---

## Provenance System

Every node and edge carries provenance metadata so the UI can explain *why* a graph assertion exists and *how confident* the system is.

### Availability states

| State | Meaning |
|---|---|
| `available_observed` | Directly present in replay data |
| `available_ambient` | Reconstructed from repo context (file exists on disk, not explicitly read) |
| `derived_inferred` | Inferred from strong sequencing or structure |
| `unavailable` | Not present in logs and not reconstructable (e.g. system prompt) |
| `unknown` | Theoretically possible but not currently determinable |

### Confidence levels

| Level | Meaning |
|---|---|
| `high` | Directly observed or structurally certain |
| `medium` | Strong inference from ordering/structure |
| `low` | Weak heuristic; should be visually distinguished in the UI |

### Evidence records

```ts
GraphEvidence {
  kind: GraphEvidenceKind;
  source_ref: string | null; // replay entry id, file path, tool call id
  detail: string | null;     // human-readable explanation
}
```

Evidence kinds:

| Kind | Source |
|---|---|
| `observed_replay` | Directly present in replay entries |
| `observed_tool_args` | Extracted from tool call arguments |
| `observed_custom_message` | Derived from runtime custom messages |
| `parsed_markdown_link` | Derived from markdown link structure |
| `parsed_import` | Derived from code import structure |
| `ambient_repo_context` | Current project tree context |
| `inferred_temporal` | Inferred from replay ordering / turn structure |
| `heuristic` | Weaker signal, used sparingly |

---

## Tool Classification

**Contract:** `contracts/graph/tool-classification.ts`

Every tool invocation is classified into a category that determines the node kind and edge kind:

| Category | Node kind | Edge kind | Examples |
|---|---|---|---|
| `search` | `search_query` | (no file edge) | Glob, Grep, Search, ListDir, Bash+rg/find/ls/cat/head/tail/fd/tree/wc |
| `read` | `tool_call` | `read` | Read on .ts, .tsx, .py, etc. |
| `doc_read` | `tool_call` | `read` | Read on .md, .mdx, .txt, .rst |
| `edit` | `tool_call` | `edited` | Edit |
| `write` | `tool_call` | `wrote` | Write |
| `opaque` | `tool_call` | (no file edge) | Any unrecognized tool |

Discovery detection for Bash commands checks the first word of the command against: `rg`, `grep`, `find`, `ls`, `cat`, `head`, `tail`, `fd`, `tree`, `wc`.

---

## Derivation Pipeline

```
Raw replay entries (SessionEntry[])
  │
  ├── group_into_turns()
  │     Groups messages into user → assistant turn pairs
  │
  ├── derive_session_graph()
  │     Builds nodes and edges from replay data:
  │       • Session root + framing cluster
  │       • Runtime context nodes (cwd, model, thinking, custom messages)
  │       • System/developer prompt placeholders (unavailable)
  │       • Turn structure: user_prompt → assistant_turn → tool_call(s)
  │       • File/doc nodes with read/edit/write edges
  │       • AGENTS.md detection and relabeling
  │
  ├── graph-cache (in-memory, 5 min TTL, max 20 entries)
  │     Caches the replay-only graph per session_id
  │
  ├── clone cached graph (so augmentation doesn't mutate cache)
  │
  └── augment_repo_context()
        Scans project tree (max depth 3) for ambient instruction files:
          AGENTS.md, CLAUDE.md, CURSOR.md, .cursorrules, COPILOT.md, CODEOWNERS
        Adds them as ambient nodes with constrained_by edges to framing
        Skips files already observed in replay
        Sets has_repo_context = true
```

### Key behaviors

- **File node deduplication** — if the same file is read and then edited across turns, both tool_call nodes point to the same source_file/doc_file node.
- **AGENTS.md special handling** — explicitly read AGENTS.md files are relabeled from `doc_file` → `agents_doc` with a `constrained_by` edge to framing (observed). Ambient AGENTS.md files get `available_ambient` availability and `medium` confidence.
- **Cache freshness** — replay-derived graphs are cached for 5 minutes. Repo augmentation is always applied fresh (on a clone of the cached graph).
- **Graceful degradation** — if repo scanning fails, the replay-observed graph is still valid; `has_repo_context` remains `false`.

---

## Exploration Payload (Projected View)

**Contract:** `contracts/exploration/types.ts`
**Adapter:** `contracts/graph/graph-to-exploration-adapter.ts`

The graph IR is projected into a flatter, UI-oriented shape for frontend consumption. This is a transitional adapter — the graph IR is the source of truth.

### Projection mapping

| Exploration concept | Graph source |
|---|---|
| `ExplorationTurn` | `user_prompt` + `assistant_turn` nodes |
| `ExplorationEvent` | Tool call nodes, classified into event kinds |
| `ExplorationArtifact` | `source_file`, `doc_file`, `doc_section`, `agents_doc` nodes |
| `ExplorationRelation` | Edges between artifacts |

### Event kinds

| Event kind | Derived from |
|---|---|
| `user_message` | `user_prompt` node |
| `discovery_command` | `search_query` node |
| `file_read` | `tool_call` classified as `read` |
| `file_edit` | `tool_call` classified as `edit` |
| `file_write` | `tool_call` classified as `write` |
| `doc_read` | `tool_call` classified as `doc_read` |
| `opaque_tool` | `tool_call` classified as `opaque` |
| `turn_boundary` | (defined; emitted by other subsystems) |
| `failed_discovery` | (defined; emitted by other subsystems) |

### Relation kinds

| Relation kind | Category | Graph edge kind source |
|---|---|---|
| `command_led_to_read` | dynamic | `read` |
| `read_preceded_edit` | dynamic | `edited`, `wrote` |
| `file_imports_file` | static | `imports` |
| `doc_links_doc` | static | `linked_to` |
| `section_belongs_to_doc` | static | `belongs_to` |
| `adjacent_unexplored` | contextual | `adjacent_unexplored` |
| `prompt_triggered` | dynamic | (defined; not yet mapped from graph edges) |
| `doc_influenced_read` | dynamic | (defined; not yet mapped) |
| `sequential_read` | dynamic | (defined; not yet mapped) |
| `user_followup_continued` | dynamic | (defined; not yet mapped) |
| `doc_references_file` | static | (defined; not yet mapped) |

### Evidence classes

| Class | Mapped from availability |
|---|---|
| `explicit_session` | `available_observed` |
| `explicit_doc` | `available_ambient` |
| `sequencing_inference` | `derived_inferred` |
| `adjacency_only` | all others |
| `structural_code` | (defined; for import-based relationships) |

---

## Typical Graph Shape

```
session ─── framed_by ──→ session_framing
                              ├── framed_by → cwd (runtime_context)
                              ├── framed_by → model (runtime_context)
                              ├── framed_by → thinking_level (runtime_context)
                              ├── framed_by → system_prompt (unavailable)
                              ├── framed_by → developer_prompt (unavailable)
                              ├── constrained_by → AGENTS.md (agents_doc, observed)
                              └── constrained_by → CLAUDE.md (instruction_source, ambient)

session ─── prompted ──→ user_prompt_0
                              └── prompted → assistant_turn_0
                                    ├── invoked_tool → search_query (Grep: "foo")
                                    ├── invoked_tool → tool_call (Read: bar.ts)
                                    │                    └── read → source_file (bar.ts)
                                    └── invoked_tool → tool_call (Edit: bar.ts)
                                                         └── edited → source_file (bar.ts)

session ─── prompted ──→ user_prompt_1
                              └── prompted → assistant_turn_1
                                    ├── invoked_tool → tool_call (Read: README.md)
                                    │                    └── read → doc_file (README.md)
                                    └── invoked_tool → tool_call (Write: new-feature.ts)
                                                         └── wrote → source_file (new-feature.ts)
```

---

## File Index

| File | Responsibility |
|---|---|
| `contracts/graph/types.ts` | Zod schemas and TypeScript types for all graph primitives |
| `contracts/graph/tool-classification.ts` | Tool categorization rules (search, read, edit, write, opaque) |
| `contracts/graph/graph-to-exploration-adapter.ts` | Projects graph IR → ExplorationPayload |
| `contracts/graph/index.ts` | Barrel re-exports |
| `contracts/exploration/types.ts` | Zod schemas for the exploration projection |
| `backend/analytics/graph/derive-session-graph.ts` | Main derivation: replay entries → SessionGraphPayload |
| `backend/analytics/graph/graph-ids.ts` | Deterministic node ID generation and path normalization |
| `backend/analytics/graph/augment-repo-context.ts` | Ambient repo context augmentation (AGENTS.md, CLAUDE.md, etc.) |
| `backend/analytics/graph/graph-cache.ts` | In-memory TTL cache for replay-derived graphs |
| `backend/analytics/graph/commands.ts` | Wires `get_session_graph` handler into request router |
