# Scenario 3: Branching Replay

Session with a branch point to verify `get_session_entries()` preserves raw branch data.

## Fixture files

- `%2Fhome%2Ftest%2Fproject-alpha/session-branch.jsonl`

## Branch structure

```
session-header -> entry-b-01 -> entry-b-02 -> entry-b-03 -> entry-b-04 -> entry-b-05a (branch A)
                                                                        \-> entry-b-05b -> entry-b-06 -> entry-b-07 -> entry-b-08 (branch B, main)
```

- Branch point: `entry-b-04` (parentId shared by `entry-b-05a` and `entry-b-05b`)
- `entry-b-05a` timestamp: 2026-03-10T08:00:10Z
- `entry-b-05b` timestamp: 2026-03-10T08:00:12Z

## Expected values

| Metric | Value |
|---|---|
| header.id | aaaaaaaa-0003-0001-0001-000000000001 |
| entry_count | 9 (all entries except header) |
| leaf_id | entry-b-08 (last entry by file order) |
| branch_points | 1 (entry-b-04 has two children) |

All entries are returned as raw JSON — the parser does not filter branches.
