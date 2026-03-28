# QMD Integration — Spec

Status: Implemented
Date: 2026-03-20
Knowledge doc: `docs/knowledge/qmd.md`

> Note: this spec describes the original QMD integration milestone. Later work shipped the sidecar mutation path, multi-index support, in-app search, and QMD logs observability.

## 1. Problem Statement

Ariadne observes AI agent activity but has no visibility into the knowledge bases those agents search. QMD (`@tobilu/qmd` v2.0.1) is an on-device hybrid search engine for markdown files — it manages collections, contexts, vector embeddings, and search across indexed directories. Currently, QMD is managed entirely via CLI with no graphical interface.

Ariadne should provide a management UI for QMD: see what's indexed, manage collections and contexts, trigger re-indexing/embedding, and monitor index health.

## 2. Goals and Non-Goals

### 2.1 Goals
- New top-level sidebar entry **"QMD"** at route `/qmd`
- Overview page showing index health, collection list, and global context
- Collection detail page with settings, context editor, and file browser
- Rust backend reads QMD's SQLite directly for fast dashboard data
- Mutations (add/remove collection, context CRUD, reindex, embed) via `qmd` CLI subprocess
- Detect missing `qmd` CLI and show install instructions
- Zod schemas validate all QMD data crossing Rust → TypeScript boundary
- Update `information-architecture.md` with the new QMD section

### 2.2 Non-Goals
- Search UI from within Ariadne (defer to v2 — requires LLM models loaded)
- Real-time progress bars for `qmd update` / `qmd embed` (defer — needs sidecar)
- Editing collection YAML config directly (use CLI commands instead)
- Managing multiple named indexes (support default index only for v1)
- Bundling or installing QMD — user must have `qmd` installed

## 3. Information Architecture

### Updated Sidebar
```
├── Overview        /
├── Projects        /projects
├── Sessions        /sessions
├── Usage           /usage
└── QMD             /qmd                    ← NEW
```

### Routes
```
/qmd                   →  QMD overview (index health, collections, global context)
/qmd/:name             →  Collection detail (breadcrumb: QMD / {name})
```

### Question It Answers
"What's in my knowledge base and how is it doing?"

## 4. Pages

### 4.1 QMD Overview (`/qmd`)

**Purpose**: At-a-glance health of the QMD index. Manage collections and global context.

| Section | Component | Data Source |
|---------|-----------|-------------|
| Health banner | `QmdHealthBanner` | Shows warnings: qmd not installed, needs embedding, stale index |
| Stat cards × 4 | `StatCard` | Total Documents, Embedded Chunks, Collections, DB Size |
| Global context | `GlobalContextEditor` | Inline editable text field. Read from `store_config`, write via `qmd context add / "text"` |
| Collections table | `DataTable` | Columns: Name, Path, Pattern, Documents, Embedded, Last Updated, Default. Click → `/qmd/:name` |
| Actions | Button group | "Add Collection" (dialog), "Re-index All", "Embed All", "Cleanup" |

**Empty state**: If `qmd` CLI is not found, show a full-page message with install instructions (`bun add -g @tobilu/qmd`). If installed but no collections, show "Add your first collection" prompt.

### 4.2 Collection Detail (`/qmd/:name`)

**Purpose**: Deep-dive into a single collection — settings, contexts, and files.

| Section | Component | Description |
|---------|-----------|-------------|
| Breadcrumb | `Breadcrumb` | QMD / {name} |
| Stat cards × 3 | `StatCard` | Documents, Needing Embedding, Last Updated |
| Settings card | `CollectionSettings` | Read-only display of: Path, Glob Pattern, Ignore Patterns, Include By Default (toggle), Update Command. Edit via action buttons. |
| Context editor | `ContextEditor` | Key-value list: path prefix → description. Add/edit/remove rows. Each mutation calls `qmd context add/rm`. |
| Documents table | `DataTable` | Columns: Path, Title, Docid, Modified At. Sortable, searchable. |
| Actions | Button group | "Re-index", "Embed", "Rename", "Remove Collection" (with confirmation) |

## 5. Backend (Rust)

### 5.1 New Module: `src-tauri/src/commands/qmd.rs`

All commands follow the pattern: read from SQLite for queries, shell out to `qmd` CLI for mutations.

#### Read Commands (SQLite)

| Command | Query | Returns |
|---------|-------|---------|
| `qmd_get_status` | Join `store_collections` + `documents` + `content_vectors` + `store_config` | `QmdStatus` — totals, health, db size |
| `qmd_list_collections` | `store_collections` LEFT JOIN doc/vector counts | `Vec<QmdCollection>` |
| `qmd_get_collection_detail` | Collection row + its documents + contexts | `QmdCollectionDetail` |
| `qmd_get_collection_documents` | `documents` WHERE collection = ? AND active = 1 | `Vec<QmdDocument>` |
| `qmd_check_availability` | Run `qmd --version` | `QmdAvailability` — installed bool, version string, db path |

#### Write Commands (CLI subprocess)

| Command | CLI Invocation | Notes |
|---------|---------------|-------|
| `qmd_add_collection` | `qmd collection add <path> --name <name> [--mask <pattern>]` | |
| `qmd_remove_collection` | `qmd collection remove <name>` | |
| `qmd_rename_collection` | `qmd collection rename <old> <new>` | |
| `qmd_add_context` | `qmd context add qmd://<collection>/<path> "<text>"` | |
| `qmd_remove_context` | `qmd context rm qmd://<collection>/<path>` | |
| `qmd_set_global_context` | `qmd context add / "<text>"` | |
| `qmd_reindex` | `qmd update` | Optional: `--pull` flag |
| `qmd_embed` | `qmd embed` | |
| `qmd_cleanup` | `qmd cleanup` | |

### 5.2 SQLite Access

- Open `~/.cache/qmd/index.sqlite` in **read-only mode** (`SQLITE_OPEN_READONLY`)
- Use `rusqlite` (already compatible with Tauri's async model via `spawn_blocking`)
- The DB uses WAL mode, so read-only access won't conflict with a running `qmd` process
- Cache the DB connection in a `QmdState` managed by Tauri (similar to existing `SessionCache`)
- Re-open connection if the file changes (detect via mtime or inotify)

### 5.3 Rust Models

```rust
// src-tauri/src/models/qmd.rs

#[derive(Serialize)]
pub struct QmdAvailability {
    pub installed: bool,
    pub version: Option<String>,
    pub db_path: Option<String>,
    pub db_size_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct QmdStatus {
    pub total_documents: u32,
    pub active_documents: u32,
    pub embedded_chunks: u32,
    pub needs_embedding: u32,
    pub collection_count: u32,
    pub db_size_bytes: u64,
    pub global_context: Option<String>,
    pub days_since_update: Option<u32>,
}

#[derive(Serialize)]
pub struct QmdCollection {
    pub name: String,
    pub path: String,
    pub pattern: String,
    pub ignore_patterns: Vec<String>,
    pub include_by_default: bool,
    pub update_command: Option<String>,
    pub doc_count: u32,
    pub active_doc_count: u32,
    pub embedded_count: u32,
    pub last_modified: Option<String>,
    pub contexts: Vec<QmdContext>,
}

#[derive(Serialize)]
pub struct QmdContext {
    pub path: String,
    pub context: String,
}

#[derive(Serialize)]
pub struct QmdDocument {
    pub path: String,
    pub title: String,
    pub docid: String,        // first 6 chars of hash
    pub collection: String,
    pub modified_at: String,
    pub body_length: u32,
}

#[derive(Serialize)]
pub struct QmdCollectionDetail {
    pub collection: QmdCollection,
    pub documents: Vec<QmdDocument>,
}

#[derive(Serialize)]
pub struct QmdCommandResult {
    pub success: bool,
    pub output: String,
}
```

### 5.4 Database Path Resolution

QMD stores its default index at:
```
$XDG_CACHE_HOME/qmd/index.sqlite    (if XDG_CACHE_HOME is set)
~/.cache/qmd/index.sqlite           (default)
```

Resolve in this order:
1. Check `$XDG_CACHE_HOME/qmd/index.sqlite`
2. Fall back to `~/.cache/qmd/index.sqlite`
3. If neither exists, report "no index found"

### 5.5 SQL Queries

**Collection list with counts:**
```sql
SELECT
  sc.name,
  sc.path,
  sc.pattern,
  sc.ignore_patterns,
  sc.include_by_default,
  sc.update_command,
  sc.context,
  COUNT(DISTINCT d.id) FILTER (WHERE d.active = 1) as doc_count,
  COUNT(DISTINCT cv.hash) as embedded_count,
  MAX(d.modified_at) as last_modified
FROM store_collections sc
LEFT JOIN documents d ON d.collection = sc.name
LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 AND d.active = 1
GROUP BY sc.name
```

**Documents for a collection:**
```sql
SELECT
  d.path,
  d.title,
  SUBSTR(d.hash, 1, 6) as docid,
  d.collection,
  d.modified_at,
  LENGTH(c.doc) as body_length
FROM documents d
JOIN content c ON c.hash = d.hash
WHERE d.collection = ? AND d.active = 1
ORDER BY d.modified_at DESC
```

**Index status:**
```sql
-- Total active documents
SELECT COUNT(*) FROM documents WHERE active = 1;

-- Documents needing embedding
SELECT COUNT(DISTINCT d.hash)
FROM documents d
LEFT JOIN content_vectors cv ON d.hash = cv.hash AND cv.seq = 0
WHERE d.active = 1 AND cv.hash IS NULL;

-- Total embedded chunks
SELECT COUNT(*) FROM content_vectors;

-- Global context
SELECT value FROM store_config WHERE key = 'global_context';
```

## 6. Frontend

### 6.1 API Layer

**`src/api/qmd.ts`** — Tauri invoke wrappers:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { QmdStatusSchema, QmdCollectionSchema, QmdCollectionDetailSchema, QmdAvailabilitySchema, QmdCommandResultSchema } from "../schemas/qmd";

export async function qmd_check_availability() {
  const raw = await invoke("qmd_check_availability");
  return QmdAvailabilitySchema.parse(raw);
}

export async function qmd_get_status() {
  const raw = await invoke("qmd_get_status");
  return QmdStatusSchema.parse(raw);
}

export async function qmd_list_collections() {
  const raw = await invoke("qmd_list_collections");
  return z.array(QmdCollectionSchema).parse(raw);
}

export async function qmd_get_collection_detail(name: string) {
  const raw = await invoke("qmd_get_collection_detail", { name });
  return QmdCollectionDetailSchema.parse(raw);
}

export async function qmd_add_collection(name: string, path: string, pattern?: string) {
  const raw = await invoke("qmd_add_collection", { name, path, pattern });
  return QmdCommandResultSchema.parse(raw);
}

// ... similar for remove, rename, context CRUD, reindex, embed, cleanup
```

### 6.2 Zod Schemas

**`src/schemas/qmd.ts`**:

```typescript
import { z } from "zod";

export const QmdAvailabilitySchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  db_path: z.string().nullable(),
  db_size_bytes: z.number().nullable(),
});

export const QmdContextSchema = z.object({
  path: z.string(),
  context: z.string(),
});

export const QmdCollectionSchema = z.object({
  name: z.string(),
  path: z.string(),
  pattern: z.string(),
  ignore_patterns: z.array(z.string()),
  include_by_default: z.boolean(),
  update_command: z.string().nullable(),
  doc_count: z.number(),
  active_doc_count: z.number(),
  embedded_count: z.number(),
  last_modified: z.string().nullable(),
  contexts: z.array(QmdContextSchema),
});

export const QmdDocumentSchema = z.object({
  path: z.string(),
  title: z.string(),
  docid: z.string(),
  collection: z.string(),
  modified_at: z.string(),
  body_length: z.number(),
});

export const QmdStatusSchema = z.object({
  total_documents: z.number(),
  active_documents: z.number(),
  embedded_chunks: z.number(),
  needs_embedding: z.number(),
  collection_count: z.number(),
  db_size_bytes: z.number(),
  global_context: z.string().nullable(),
  days_since_update: z.number().nullable(),
});

export const QmdCollectionDetailSchema = z.object({
  collection: QmdCollectionSchema,
  documents: z.array(QmdDocumentSchema),
});

export const QmdCommandResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
});
```

### 6.3 Pages

**`src/pages/qmd.tsx`** — Overview page
- Loads `qmd_check_availability()` first
- If not installed: full-page install prompt
- If installed: loads `qmd_get_status()` + `qmd_list_collections()`
- Renders stat cards, health banner, global context editor, collections table, action buttons
- Collections table rows link to `/qmd/:name`

**`src/pages/qmd-collection.tsx`** — Collection detail
- Route param `$name`
- Loads `qmd_get_collection_detail(name)`
- Renders breadcrumb, stat cards, settings card, context editor, documents table, action buttons

### 6.4 Components

| File | Purpose |
|------|---------|
| `src/components/qmd-health-banner.tsx` | Warning/info banner for: needs embedding, stale index, qmd not found |
| `src/components/context-editor.tsx` | Key-value editor for path→description contexts. Add row, edit inline, delete with confirm. |
| `src/components/global-context-editor.tsx` | Single text field for global context with save button |
| `src/components/add-collection-dialog.tsx` | Dialog with inputs: name, path (with folder picker if possible), glob pattern |
| `src/components/columns/qmd-collection-columns.tsx` | DataTable column definitions for collections |
| `src/components/columns/qmd-document-columns.tsx` | DataTable column definitions for documents |

### 6.5 Sidebar Addition

In `src/app.tsx`, add after the Usage menu item:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    render={<Link to="/qmd" />}
    isActive={is_active("/qmd")}
    tooltip="QMD"
  >
    <Search />
    <span>QMD</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Icon: `Search` from lucide-react (magnifying glass — represents QMD's search purpose).

### 6.6 Router Addition

In `src/router.tsx`:

```typescript
const qmd_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd',
  component: Qmd,
});

const qmd_collection_route = createRoute({
  getParentRoute: () => root_route,
  path: '/qmd/$name',
  component: QmdCollection,
});
```

## 7. User Flows

### First Visit (QMD not installed)
1. User clicks QMD in sidebar
2. `qmd_check_availability()` returns `{ installed: false }`
3. Full-page message: "QMD is not installed. Install with: `bun add -g @tobilu/qmd`"

### First Visit (installed, no collections)
1. `qmd_check_availability()` returns `{ installed: true }`
2. `qmd_list_collections()` returns `[]`
3. Empty state: "No collections yet. Add your first collection to start indexing."
4. Prominent "Add Collection" button

### Normal Dashboard
1. Stat cards show totals
2. Health banner shows warnings if applicable (e.g. "47 documents need embedding — click Embed All")
3. Collections table shows all collections with stats
4. Click a collection → detail page

### Adding a Collection
1. Click "Add Collection" → dialog opens
2. Enter name, path, optional glob pattern
3. Submit → `qmd_add_collection(name, path, pattern)` → CLI runs
4. On success: refresh collection list
5. Show "Collection added. Run Re-index to scan files."

### Managing Contexts
1. On collection detail, context editor shows current contexts
2. Click "Add Context" → new row appears with path prefix input + description input
3. Fill in and save → `qmd_add_context(collection, path, text)`
4. Click delete on a row → confirmation → `qmd_remove_context(collection, path)`

### Re-indexing
1. Click "Re-index All" (overview) or "Re-index" (collection detail)
2. Button shows loading spinner
3. `qmd_reindex()` shells out to `qmd update`
4. On completion: refresh status data
5. If documents need embedding, health banner updates

## 8. Tauri Configuration Changes

### `src-tauri/Cargo.toml`

Add `rusqlite`:
```toml
[dependencies]
rusqlite = { version = "0.34", features = ["bundled"] }
```

### `src-tauri/capabilities/default.json`

Add shell permission for `qmd` CLI:
```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "shell:allow-execute"
  ]
}
```

### `src-tauri/src/lib.rs`

Register new commands and QMD state.

## 9. File Manifest

### New Files

| File | Purpose |
|------|---------|
| `src-tauri/src/commands/qmd.rs` | Tauri commands — SQLite reads + CLI subprocess calls |
| `src-tauri/src/models/qmd.rs` | Rust structs for QMD data |
| `src/api/qmd.ts` | Frontend API layer — Tauri invoke wrappers |
| `src/schemas/qmd.ts` | Zod schemas for QMD types |
| `src/pages/qmd.tsx` | QMD overview page |
| `src/pages/qmd-collection.tsx` | Collection detail page |
| `src/components/qmd-health-banner.tsx` | Health/warning banner |
| `src/components/context-editor.tsx` | Path→description key-value editor |
| `src/components/global-context-editor.tsx` | Global context text editor |
| `src/components/add-collection-dialog.tsx` | Add collection dialog |
| `src/components/columns/qmd-collection-columns.tsx` | Collection table columns |
| `src/components/columns/qmd-document-columns.tsx` | Document table columns |
| `docs/knowledge/qmd.md` | QMD reference documentation |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `rusqlite` dependency |
| `src-tauri/src/lib.rs` | Register QMD commands + state |
| `src-tauri/src/commands/mod.rs` | Add `pub mod qmd;` |
| `src-tauri/src/models/mod.rs` | Add `pub mod qmd;` |
| `src-tauri/capabilities/default.json` | Add shell permission |
| `src/app.tsx` | Add QMD sidebar item + breadcrumb handling |
| `src/router.tsx` | Add QMD routes |
| `docs/information-architecture.md` | Add QMD section |

## 10. Future (v2 — Sidecar Upgrade)

When we need features the CLI can't provide:

- **Progress streaming** for `update()` and `embed()` — real-time progress bars
- **Search UI** — full hybrid search with reranking from within Ariadne
- **Document preview** — render markdown content inline

We'll add a Node/Bun sidecar process:
1. `src-sidecar/qmd-bridge.ts` — JSON-RPC over stdio wrapping the QMD SDK
2. Compile with `bun build --compile` for a standalone binary
3. Tauri launches as managed child process via `tauri-plugin-shell` sidecar support
4. Rust commands dispatch to sidecar instead of CLI for the upgraded features
5. SQLite direct reads remain for the dashboard (faster than IPC)

This is documented in `docs/knowledge/qmd.md` under "Integration Architecture".
