# Task: Build Curated Fixture Bundles for Parity Testing

**Status: ✅ Completed**
**Depends on: ✅ fixture-root-overrides (completed)**

## Context

This is part of the Tauri → Electron migration (Milestone 2: Contract Freeze & Parity Harness). We need synthetic, deterministic test data that the parity harness can run both the current Rust backend and future Node backend against to prove behavioral equivalence.

The env var overrides (`ARIADNE_PI_SESSIONS_ROOT`, `ARIADNE_QMD_CACHE_ROOT`, `ARIADNE_CODEX_HOME`) are already in place.

## Spec references

- `docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md` — Sections 6.2, 6.5, 8
- `docs/exec-plans/active/2026-03-28-electron-node-backend-migration.md`

## Target directory structure

```
fixtures/migration/
  sessions/
    minimal/                          # Scenario 1 + 3
      %2Fhome%2Ftest%2Fproject-alpha/
        session-001.jsonl
    multi-project/                    # Scenario 2 + 4
      %2Fhome%2Ftest%2Fproject-alpha/
        session-001.jsonl
        session-002.jsonl
      %2Fhome%2Ftest%2Fproject-beta/
        session-003.jsonl
    branching-replay/                 # Scenario 3
      %2Fhome%2Ftest%2Fproject-alpha/
        session-branch.jsonl
    qmd-cli/                          # Scenario 7
      %2Fhome%2Ftest%2Fproject-alpha/
        session-qmd.jsonl
  qmd/
    cache-root/                       # Scenario 5
      index.sqlite
      work.sqlite
  provider-limits/
    codex-session-log/                # Scenario 8
      sessions/
        session-codex.jsonl
  golden/                             # Empty — populated by the golden-recording task
    analytics/
    qmd/
    qmd-logs/
    provider-limits/
```

## Session JSONL format

The Rust parser (`src-tauri/src/parser/session.rs`) reads JSONL files line-by-line. Each line is a JSON object with a `type` field. The parser understands these entry types:

### Required entry types for fixtures

**Session header** (first line of every file):
```json
{"type":"session","id":"uuid-here","timestamp":"2026-03-01T10:00:00Z","cwd":"/home/test/project-alpha","version":1}
```

**Session info** (optional, sets the session title):
```json
{"type":"session_info","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:00:01Z","name":"Fix login bug"}
```

**User message:**
```json
{"type":"message","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:00:02Z","message":{"role":"user","content":"Fix the login validation"}}
```

**Assistant message** (with usage, cost, model, tool calls):
```json
{"type":"message","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:00:05Z","message":{"role":"assistant","model":"claude-sonnet-4-20250514","provider":"anthropic","stopReason":"end_turn","content":[{"type":"text","text":"I'll fix that."},{"type":"toolCall","id":"tc-1","name":"read","arguments":{"path":"/src/login.ts"}}],"usage":{"input":1000,"output":500,"cacheRead":200,"cacheWrite":100,"totalTokens":1800,"cost":{"input":0.003,"output":0.0075,"cacheRead":0.0002,"cacheWrite":0.0004,"total":0.0111}}}}
```

**Tool result:**
```json
{"type":"message","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:00:06Z","message":{"role":"toolResult","toolCallId":"tc-1","toolName":"read","content":[{"type":"text","text":"file contents here"}],"isError":false}}
```

**Compaction:**
```json
{"type":"compaction","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:02:00Z","summary":"Summarized conversation","firstKeptEntryId":"kept-id","tokensBefore":50000}
```

**Model change:**
```json
{"type":"model_change","id":"entry-id","parentId":"parent-id","timestamp":"2026-03-01T10:03:00Z","provider":"anthropic","modelId":"claude-sonnet-4-20250514"}
```

### Directory naming convention

Session directories use URL-encoded project paths. The `cwd` from the session header is the canonical path. Examples:
- `/home/test/project-alpha` → directory name `%2Fhome%2Ftest%2Fproject-alpha`
- The parser reads `dir_name` from the filesystem directory name, NOT from the session header

### Branching

Entries form a tree via `id` and `parentId`. For branching replay fixtures, create entries where multiple entries share the same `parentId`. The `leaf_id` in the replay response is the last entry by timestamp on the main branch.

## Fixture scenarios

### Scenario 1: Analytics Minimal
**File:** `sessions/minimal/%2Fhome%2Ftest%2Fproject-alpha/session-001.jsonl`
**Purpose:** One project, one session with stable known totals.
**Requirements:**
- 1 session header with fixed UUID and fixed timestamps
- 2 user messages, 2 assistant messages with known token/cost values
- 1 `read` tool call, 1 `edit` tool call, 1 `bash` tool call (e.g., `grep`)
- Corresponding tool results
- Total cost, tokens, tool counts must be deterministic and easy to assert

### Scenario 2: Analytics Multi-Project + Range Filter
**File:** `sessions/multi-project/` with 3 sessions across 2 projects
**Purpose:** Verify `project_path` filtering and `range_days` filtering work correctly.
**Requirements:**
- Project Alpha: 2 sessions — one from 2026-03-01, one from 2026-03-20
- Project Beta: 1 session from 2026-03-15
- Timestamps must be chosen so that `range_days=7` (relative to a pinned reference date) returns a different subset than `range_days=30`
- Different cost/token values per session to verify aggregation

### Scenario 3: Branching Replay
**File:** `sessions/branching-replay/%2Fhome%2Ftest%2Fproject-alpha/session-branch.jsonl`
**Purpose:** Verify `get_session_entries()` preserves raw branch data and `leaf_id`.
**Requirements:**
- Session header + at least 5 entries
- At least one branch point: two entries with the same `parentId`
- The parser returns all entries as raw JSON — verify they survive round-trip
- `leaf_id` must be the last entry by timestamp on the longest chain

### Scenario 4: File Analytics
**Covered by:** Scenario 2's multi-project sessions
**Purpose:** Verify `distinct_session_count`, directory aggregation, `tool_distribution`, `read_files`, `edit_files`, `write_files`, `bash_commands`.
**Requirements:**
- Multiple sessions must touch overlapping file paths (to test `distinct_session_count`)
- File paths should share common directories (to test `directory_stats` aggregation)
- Use a mix of `read`, `edit`, `write`, and `bash` tool calls

### Scenario 5: QMD Status/Index/Collection Reads
**Files:** `qmd/cache-root/index.sqlite`, `qmd/cache-root/work.sqlite`
**Purpose:** Validate QMD SQLite read behavior on known sample indexes.
**Requirements:**
- Create two valid QMD SQLite databases with the schema the Rust backend expects
- Required tables: `store_collections`, `documents`, `content`, `content_vectors`, `store_config`
- `index.sqlite` (maps to display name "default"): 1 collection with 3 documents (2 active, 1 inactive), some embedded
- `work.sqlite`: 1 collection with 1 document
- Include a global context in `store_config` for at least one index
- Known values for: `total_documents`, `active_documents`, `embedded_chunks`, `needs_embedding`, `collection_count`, `db_size_bytes`

**QMD SQLite schema** (reverse-engineered from `src-tauri/src/commands/qmd.rs`):
```sql
CREATE TABLE store_collections (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  pattern TEXT NOT NULL,
  ignore_patterns TEXT DEFAULT '',
  include_by_default INTEGER DEFAULT 1,
  update_command TEXT,
  context TEXT  -- JSON: {"path": "context text", ...}
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  title TEXT DEFAULT '',
  hash TEXT NOT NULL,
  collection TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE content (
  hash TEXT PRIMARY KEY,
  doc TEXT NOT NULL  -- full document body
);

CREATE TABLE content_vectors (
  hash TEXT NOT NULL,
  seq INTEGER NOT NULL,
  -- other embedding columns
  PRIMARY KEY (hash, seq)
);

CREATE TABLE store_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### Scenario 6: QMD Progress-Producing Operations
**Approach:** This scenario tests event payload shapes, NOT live QMD SDK behavior. For the parity harness, record/stub the expected progress payloads and validate them against the Zod schemas in `contracts/qmd/events.ts`.
**Deliverable:** JSON files in `golden/qmd/` representing the expected progress event payloads for update, embed, and search operations. No fixture data files needed — just golden event samples.

### Scenario 7: QMD CLI Log Extraction
**File:** `sessions/qmd-cli/%2Fhome%2Ftest%2Fproject-alpha/session-qmd.jsonl`
**Purpose:** Verify the QMD log parser (`src-tauri/src/parser/qmd_logs.rs`) extracts entries correctly.
**Requirements:**
- Session with bash tool calls that invoke `qmd` CLI
- Include these cases:
  - Plain command: `qmd search "query"` with normal text output
  - Env-prefixed command: `QMD_INDEX=work qmd search "query"` (parser must strip env prefix)
  - Command with `--collections` flag
  - Command that produces JSON output (e.g., `qmd status --json`)
  - Command where the tool result has `isError: true`
  - Command where the tool result is missing (assistant called bash with qmd but no toolResult follows)
- The parser looks for bash tool calls where the command starts with `qmd` (after stripping env vars)
- It correlates assistant toolCall blocks with toolResult blocks via `toolCallId`

### Scenario 8: Provider Limits
**File:** `provider-limits/codex-session-log/sessions/session-codex.jsonl`
**Purpose:** Test the fallback-to-session-log path for Codex provider limits.
**Note:** The app-server probe (`probe_app_server`) requires a live `codex` binary — that path cannot be fixture-tested. Only the session-log fallback path is testable with fixtures.
**Requirements:**
- A Codex-format JSONL session file with usage data that the parser can extract rate limit information from
- This is pointed at via `ARIADNE_CODEX_HOME` → the fixture's `provider-limits/codex-session-log/` directory
- Include at least one session with model usage headers that contain rate limit data

## Rules

- **All fixture data must be synthetic.** Do not copy real session logs, personal paths, or account identifiers.
- **Use deterministic, fixed timestamps.** No `Date.now()` or relative dates in fixture files.
- **Use stable UUIDs.** Generate them once and hardcode them (e.g., `aaaaaaaa-0001-0001-0001-000000000001`).
- **Use synthetic project paths.** Always use `/home/test/project-alpha`, `/home/test/project-beta`, etc.
- **Keep fixtures minimal.** Each scenario should have the smallest data needed to exercise the behavior. Don't create 100-line sessions when 10 lines suffice.
- **Document expected values.** Add a `README.md` in each scenario directory with the expected totals/counts that goldens should match.

## Verification

1. Set `ARIADNE_PI_SESSIONS_ROOT=fixtures/migration/sessions/minimal` and run the app — Overview should show 1 session with known totals.
2. Set `ARIADNE_QMD_CACHE_ROOT=fixtures/migration/qmd/cache-root` — QMD page should show the "default" and "work" indexes with known counts.
3. Set `ARIADNE_CODEX_HOME=fixtures/migration/provider-limits/codex-session-log` — Provider limits should attempt the session-log fallback.

## Acceptance

- All 8 scenarios have fixture data files in `fixtures/migration/`
- Each scenario directory has a `README.md` documenting expected values
- `golden/` subdirectories exist (empty — populated by the next task)
- Fixture data is synthetic, deterministic, and minimal
- QMD SQLite files are valid and queryable
