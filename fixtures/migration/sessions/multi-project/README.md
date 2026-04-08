# Scenario 2 + 4: Analytics Multi-Project + File Analytics

Three sessions across two projects with different dates for range filtering.

## Fixture files

- `%2Fhome%2Ftest%2Fproject-alpha/session-001.jsonl` — 2026-03-01
- `%2Fhome%2Ftest%2Fproject-alpha/session-002.jsonl` — 2026-03-20
- `%2Fhome%2Ftest%2Fproject-beta/session-003.jsonl` — 2026-03-15

## Range filter behavior

With reference date 2026-03-22:
- `range_days=7` (2026-03-15 to 2026-03-22): session-002 (Alpha) + session-003 (Beta)
- `range_days=30` (2026-02-20 to 2026-03-22): all 3 sessions
- `project_path=/home/test/project-alpha`: session-001 + session-002 only

## Expected values per session

### session-001 (Alpha, 2026-03-01)

| Metric | Value |
|---|---|
| total_cost | 0.0222 |
| total_tokens | 3600 |
| user_message_count | 1 |
| assistant_message_count | 2 |
| tool_result_count | 3 |

#### Tools: read=2, edit=1, write=1, bash=1
#### Bash commands: npm=1
#### read_files: /home/test/project-alpha/src/utils.ts, /home/test/project-alpha/src/auth.ts
#### edit_files: /home/test/project-alpha/src/utils.ts
#### write_files: /home/test/project-alpha/src/helpers.ts

### session-002 (Alpha, 2026-03-20)

| Metric | Value |
|---|---|
| total_cost | 0.02706 |
| total_tokens | 4770 |
| user_message_count | 1 |
| assistant_message_count | 2 |
| tool_result_count | 4 |

#### Tools: read=2, edit=1, bash=1
#### Bash commands: grep=1
#### read_files: /home/test/project-alpha/src/routes/api.ts, /home/test/project-alpha/src/utils.ts
#### edit_files: /home/test/project-alpha/src/routes/api.ts

### session-003 (Beta, 2026-03-15)

| Metric | Value |
|---|---|
| total_cost | 0.0271 |
| total_tokens | 4550 |
| user_message_count | 1 |
| assistant_message_count | 2 |
| tool_result_count | 5 |

#### Tools: read=2, edit=1, write=1, bash=1
#### Bash commands: node=1
#### read_files: /home/test/project-beta/package.json, /home/test/project-beta/src/config.ts
#### edit_files: /home/test/project-beta/src/config.ts
#### write_files: /home/test/project-beta/.github/workflows/ci.yml

## File analytics (Scenario 4)

### Overlapping file paths (for distinct_session_count)

- `/home/test/project-alpha/src/utils.ts` — read in session-001 AND session-002 (distinct_session_count=2)
- `/home/test/project-alpha/src/auth.ts` — read in session-001 only (distinct_session_count=1)

### Directory aggregation

- `/home/test/project-alpha/src/` — multiple files across sessions
- `/home/test/project-alpha/src/routes/` — subdirectory with api.ts
