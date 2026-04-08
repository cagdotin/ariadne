# Scenario 7: QMD CLI Log Extraction

Session with bash tool calls invoking the `qmd` CLI to verify the QMD log parser.

## Fixture files

- `%2Fhome%2Ftest%2Fproject-alpha/session-qmd.jsonl`

## QMD commands in fixture

| tool_call_id | Raw command | Subcommand | Index | Collections | isError | Has output |
|---|---|---|---|---|---|---|
| tc-q-01 | `qmd search "authentication patterns"` | search | (none) | (none) | false | true |
| tc-q-02 | `QMD_INDEX=work qmd search "auth middleware"` | search | (none, env prefix stripped) | (none) | false | true |
| tc-q-03 | `qmd search --collections docs "login flow"` | search | (none) | [docs] | false | true |
| tc-q-04 | `qmd status --json` | status | (none) | (none) | false | true (JSON) |
| tc-q-05 | `qmd search "nonexistent query" --index missing` | search | missing | (none) | true | true |
| tc-q-06 | `qmd ls` | ls | (none) | (none) | false | false (no toolResult) |

## Expected log entry count

6 QMD log entries extracted from bash tool calls.

## Notes

- `tc-q-06` has no corresponding toolResult — `has_output` should be false
- `tc-q-02` has an env var prefix that the parser must strip
- `tc-q-04` output is JSON — `output_kind` should be "search_json" or similar
- `tc-q-05` has `isError: true`
