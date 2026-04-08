# Scenario 8: Provider Limits (Codex Session Log Fallback)

Codex-format JSONL session file with rate limit data for testing the fallback path.

## Fixture files

- `codex-session-log/sessions/session-codex.jsonl`

## Expected values (from latest rate_limits entry)

| Field | Value |
|---|---|
| provider_id | codex |
| source | codex-session-log |
| plan_type | max_5 |

### Primary window

| Field | Value |
|---|---|
| used_percent | 45.0 |
| window_minutes | 300 |
| resets_at | 1743357600 (Unix timestamp) |

### Secondary window

| Field | Value |
|---|---|
| used_percent | 15.5 |
| window_minutes | 10080 |
| resets_at | 1743897600 (Unix timestamp) |

### Credits

| Field | Value |
|---|---|
| has_credits | true |
| unlimited | false |
| balance | $86.25 |

## Notes

- The file contains two rate_limits entries; the parser should use the last one (2026-03-25T16:05:10Z)
- The session header (first line) is a standard session event — the parser skips it since it has no `rate_limits`
- `ARIADNE_CODEX_HOME` should point to `codex-session-log/` (not `codex-session-log/sessions/`)
