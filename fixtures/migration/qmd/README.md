# Scenario 5: QMD Status/Index/Collection Reads

Two valid QMD SQLite databases with known data for verifying QMD read behavior.

## Fixture files

- `cache-root/index.sqlite` — maps to display name "default"
- `cache-root/work.sqlite` — maps to display name "work"

## Expected values: index.sqlite (default)

| Metric | Value |
|---|---|
| collection_count | 1 |
| total_documents | 3 |
| active_documents | 2 |
| embedded_chunks | 3 |
| needs_embedding | 1 |
| global_context | "This is the default QMD index for project-alpha documentation." |
| last_modified | 2026-03-02T12:00:00Z |

### Collection: "docs"

| Field | Value |
|---|---|
| path | /home/test/project-alpha/docs |
| pattern | **/*.md |
| ignore_patterns | node_modules |
| include_by_default | true |

### Documents

| id | path | title | active | hash | has_vectors |
|---|---|---|---|---|---|
| 1 | docs/auth.md | Authentication Guide | true | hash-doc-001 | yes (3 chunks) |
| 2 | docs/api.md | API Reference | true | hash-doc-002 | no |
| 3 | docs/old-guide.md | Deprecated Guide | false | hash-doc-003 | no |

## Expected values: work.sqlite

| Metric | Value |
|---|---|
| collection_count | 1 |
| total_documents | 1 |
| active_documents | 1 |
| embedded_chunks | 2 |
| needs_embedding | 0 |
| global_context | (none) |
| last_modified | 2026-03-10T14:00:00Z |
