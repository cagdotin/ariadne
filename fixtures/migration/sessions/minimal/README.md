# Scenario 1: Analytics Minimal

One project, one session with stable known totals.

## Fixture files

- `%2Fhome%2Ftest%2Fproject-alpha/session-001.jsonl`

## Expected values

| Metric | Value |
|---|---|
| session_count | 1 |
| project_path | /home/test/project-alpha |
| project_name | project-alpha |
| title | Fix login validation |
| user_message_count | 2 |
| assistant_message_count | 3 |
| turn_count | 3 |
| tool_result_count | 3 |
| compaction_count | 0 |
| total_tokens | 7750 |
| input_tokens | 4500 |
| output_tokens | 1600 |
| cache_read_tokens | 1200 |
| cache_write_tokens | 450 |
| total_cost | 0.0405 |
| input_cost | 0.0135 |
| output_cost | 0.024 |
| cache_read_cost | 0.0012 |
| cache_write_cost | 0.0018 |

### Tool call counts

| Tool | Count |
|---|---|
| read | 1 |
| edit | 1 |
| bash | 1 |

### Bash commands

| Command | Count |
|---|---|
| grep | 1 |

### File paths

| Category | Paths |
|---|---|
| read_files | /home/test/project-alpha/src/auth.ts |
| edit_files | /home/test/project-alpha/src/auth.ts |

### Models used

| Model | Provider | Message count |
|---|---|---|
| claude-sonnet-4-20250514 | anthropic | 3 |
