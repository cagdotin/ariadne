# QMD Multi-Index — Named Knowledge Base Workspaces

Status: Implemented
Date: 2026-03-21
Depends on: `docs/specs/2026-03-20-qmd-v2-sidecar-and-tree.md` (v2, implemented)
Knowledge doc: `docs/knowledge/qmd.md`

## 1. Problem Statement

Ariadne's QMD integration currently supports a single hardcoded index (`~/.cache/qmd/index.sqlite`). Users who organize their knowledge into distinct domains — personal notes, work documentation, training materials, friend-group projects — are forced to mix everything into one flat pool of collections. This makes it harder to reason about what's indexed, creates noise in search results, and offers no separation of concerns.

QMD already supports named indexes natively: each index is an independent SQLite database at `~/.cache/qmd/{name}.sqlite` with its own YAML config at `~/.config/qmd/{name}.yml`. The CLI exposes this via `qmd --index work search "..."`. Ariadne should surface this capability with a first-class multi-index UI.

## 2. Goals and Non-Goals

### 2.1 Goals
- **Discover** all existing QMD indexes on disk (`~/.cache/qmd/*.sqlite`)
- **Auto-create** a `default` index if none exists, treat the existing `index.sqlite` as `default`
- **Create** new named indexes from the dashboard
- **Delete** and **rename** indexes
- **Route-based index selection** — each index gets its own route segment (`/qmd/:index`)
- **Single sidecar** with `switch_index` support — no multiple processes
- **Index selector** in the QMD page header for quick switching
- **Remember** last-visited index and auto-navigate to it
- All existing collection/file/context management works per-index, unchanged
- Detailed frontend design spec for agent execution

### 2.2 Non-Goals
- Cross-index search (future — needs orchestrator/router layer)
- Index templates or preset configurations
- Automatic collection suggestions based on filesystem scanning
- Merging or splitting indexes
- Sharing indexes between machines

## 3. How QMD Named Indexes Work

Each named index is a completely isolated SQLite database + optional YAML config:

| Component | Default (`index`) | Named (e.g. `work`) |
|---|---|---|
| Database | `~/.cache/qmd/index.sqlite` | `~/.cache/qmd/work.sqlite` |
| Config | `~/.config/qmd/index.yml` | `~/.config/qmd/work.yml` |
| CLI | `qmd search "..."` | `qmd --index work search "..."` |
| SDK | `createStore({ dbPath: getDefaultDbPath() })` | `createStore({ dbPath: getDefaultDbPath("work") })` |

The key SDK function:
```typescript
export function getDefaultDbPath(indexName = "index") {
    const cacheDir = process.env.XDG_CACHE_HOME || resolve(homedir(), ".cache");
    return resolve(cacheDir, "qmd", `${indexName}.sqlite`);
}
```

Each index has its own: collections, documents, embeddings, global context, LLM cache. They share only the models directory (`~/.cache/qmd/models/`).

## 4. Architecture

### 4.1 Naming Convention

The existing `index.sqlite` is displayed as **"default"** in the UI. Internally, the index name `"default"` maps to the file stem `"index"` (matching QMD's convention where `getDefaultDbPath()` with no argument produces `index.sqlite`). All other indexes use their name directly as the file stem (e.g. `"work"` → `work.sqlite`).

```
UI name     →  file stem   →  file path
"default"   →  "index"     →  ~/.cache/qmd/index.sqlite
"work"      →  "work"      →  ~/.cache/qmd/work.sqlite
"personal"  →  "personal"  →  ~/.cache/qmd/personal.sqlite
```

### 4.2 Route Structure

```
/qmd                              →  Redirect to /qmd/default (or last-visited index)
/qmd/:index                       →  Index overview (collections, stats, global context)
/qmd/:index/:collection           →  Collection detail (files, settings, contexts)
```

Examples:
```
/qmd/default                      →  The existing default index
/qmd/default/yilmaz               →  Collection detail within default index
/qmd/work                         →  Work index overview
/qmd/work/api-docs                →  Collection detail within work index
```

### 4.3 Breadcrumbs

```
QMD / default                     ← index overview
QMD / default / yilmaz            ← collection detail
QMD / work                        ← index overview
QMD / work / api-docs             ← collection detail
```

### 4.4 Sidecar — Single Process, Index Switching

The sidecar keeps one `QMDStore` open at a time. When the user navigates to a different index, Rust sends a `switch_index` command before the next operation. The sidecar closes the current store and opens the new one.

```
┌─────────────────────────────────────────────────┐
│ Ariadne (Tauri App)                             │
│                                                 │
│  Rust Backend                                   │
│    ├── qmd_get_status("work")                   │
│    │   → sidecar.ensure_index("work")           │
│    │   → sidecar.call("get_status", ...)        │
│    │                                            │
│  qmd-bridge (single process)                    │
│    ├── current_index: "default"                 │
│    ├── switch_index("work")                     │
│    │   → store.close()                          │
│    │   → store = createStore({ dbPath: ... })   │
│    │   → current_index = "work"                 │
│    └── handles all methods on current store      │
└─────────────────────────────────────────────────┘
```

Switch latency: ~50ms (SQLite reopen, no model loading). Models are lazy-loaded on first search/embed and shared via filesystem cache. Acceptable since switching is user-initiated and infrequent.

### 4.5 Index Discovery

Rust scans `~/.cache/qmd/*.sqlite` to find all indexes. For each file:
1. Extract stem: `work.sqlite` → `work`, `index.sqlite` → display as `default`
2. Open read-only, query basic stats (collection count, document count)
3. Get file size and modification time

The `default` index is auto-created if no `index.sqlite` exists (empty SQLite DB with QMD schema — the sidecar handles this via `createStore`).

## 5. Data Model Changes

### 5.1 Rust — New Struct

```rust
// src-tauri/src/models/qmd.rs

#[derive(Serialize)]
pub struct QmdIndex {
    pub name: String,           // Display name ("default", "work", etc.)
    pub file_stem: String,      // File stem ("index", "work", etc.)
    pub db_path: String,        // Full path to .sqlite file
    pub db_size_bytes: u64,
    pub collection_count: u32,
    pub document_count: u32,
    pub last_modified: Option<String>,
}
```

### 5.2 TypeScript — New Schema

```typescript
// src/schemas/qmd.ts

export const QmdIndexSchema = z.object({
  name: z.string(),
  file_stem: z.string(),
  db_path: z.string(),
  db_size_bytes: z.number(),
  collection_count: z.number(),
  document_count: z.number(),
  last_modified: z.string().nullable(),
});
export type QmdIndex = z.infer<typeof QmdIndexSchema>;
```

### 5.3 Sidecar — New Methods

| Method | Params | Returns | Description |
|---|---|---|---|
| `switch_index` | `{ db_path: string }` | `{ ok: true }` | Close current store, open new one |
| `create_index` | `{ db_path: string }` | `{ ok: true }` | Create empty store at path |
| `get_current_index` | — | `{ db_path: string }` | Report which index is currently open |

### 5.4 Rust — Modified Commands

Every existing QMD command gains an `index: String` parameter. Rust resolves the display name to a db path, ensures the sidecar has that index open, then proceeds.

**New commands:**
| Command | Description |
|---|---|
| `qmd_list_indexes` | Scan `~/.cache/qmd/*.sqlite`, return `Vec<QmdIndex>` |
| `qmd_create_index(name)` | Validate name, tell sidecar to create empty store |
| `qmd_delete_index(name)` | Delete `.sqlite` + WAL/SHM files. Refuse to delete `default`. |
| `qmd_rename_index(old, new)` | Rename files on disk. Update sidecar if it has that index open. |

**Modified commands** (add `index: String` first param):
- `qmd_get_status(index)`
- `qmd_list_collections(index)`
- `qmd_get_collection_detail(index, name)`
- `qmd_get_collection_documents(index, collection)`
- `qmd_add_collection(index, name, path, pattern)`
- `qmd_remove_collection(index, name)`
- `qmd_rename_collection(index, old_name, new_name)`
- `qmd_add_context(index, collection, path, text)`
- `qmd_remove_context(index, collection, path)`
- `qmd_set_global_context(index, text)`
- `qmd_reindex(index)`
- `qmd_embed(index)`
- `qmd_cleanup(index)`
- `qmd_scan_filesystem(index, collection)`
- `qmd_get_indexed_paths(index, collection)`
- `qmd_toggle_files(index, collection, repo_root, adds, removes)`

### 5.5 Index Name to DB Path Resolution

```rust
fn resolve_index_db_path(index_name: &str) -> PathBuf {
    let base = std::env::var("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".cache"));
    let file_stem = if index_name == "default" { "index" } else { index_name };
    base.join("qmd").join(format!("{}.sqlite", file_stem))
}
```

### 5.6 Sidecar — Index Tracking

The Rust `QmdSidecar` struct gains a `current_index` field:

```rust
struct QmdSidecarInner {
    process: Mutex<Option<SidecarProcess>>,
    current_index: Mutex<Option<String>>,   // ← NEW: db_path of current index
    next_id: AtomicU64,
}
```

Before every sidecar call, Rust checks if the requested index matches `current_index`. If not, it sends `switch_index` first. This is transparent to callers.

```rust
impl QmdSidecar {
    pub fn ensure_index(&self, db_path: &str) -> Result<(), String> {
        self.ensure_running()?;
        let mut current = self.inner.current_index.lock().map_err(|e| e.to_string())?;
        if current.as_deref() != Some(db_path) {
            self.send_and_read("switch_index", json!({ "db_path": db_path }))?;
            *current = Some(db_path.to_string());
        }
        Ok(())
    }
}
```

## 6. Frontend Design

### 6.1 Design Direction

Ariadne uses Geist Variable as its primary font with a cool-toned neutral palette (oklch hue 260). The design language is **utilitarian-refined** — minimal chrome, dense information display, monospaced metadata, compact stat cards. We maintain this direction for multi-index, keeping the UI cohesive.

The index selector should feel like a **workspace switcher** — prominent enough to always know which index you're in, but not dominating the page. Think of it like VS Code's workspace indicator or a Slack workspace switcher.

### 6.2 Page Layout — QMD Index Overview (`/qmd/:index`)

This replaces the current `/qmd` page. The existing page content (stat cards, health banner, global context, collections table, actions) is unchanged — it's just scoped to the selected index.

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─ INDEX SELECTOR BAR ─────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  ┌─default─┐  work        personal        training          │ │
│ │  │2 collec.│  0           0               0        [ + ? ]  │ │
│ │  └─────────┘                                                │ │
│ │  ↑ active = ring-1 ring-primary + bg-accent                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ PAGE HEADER ────────────────────────────────────────────────┐ │
│ │  QMD                                           [actions...] │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ HEALTH BANNER (if needed) ────────────────────────────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ STAT CARDS ───────────────────────────────────────────────┐  │
│  │  Total Docs │ Embedded Chunks │ Collections │ DB Size      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ GLOBAL CONTEXT ──────────────────────────────────────────┐   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ COLLECTIONS TABLE ───────────────────────────────────────┐   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Index Selector Component

The index selector sits **above the page header**, spanning the full content width. It's the first thing visible on any QMD page and persists when navigating between index overview and collection detail.

**Visual design:**

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─default──┐  work          personal           [ + New ? ] │
│  │2 collect.│  empty         3 collections                  │
│  └──────────┘                                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Each index is a **clickable card-like region** in a horizontal row:

- **Active index**: Solid border (`ring-1 ring-primary`), elevated background (`bg-accent`), name in `text-foreground font-medium`
- **Inactive index**: No border, transparent background, name in `text-muted-foreground`, hover → `bg-accent/50`
- **Empty index**: Shows "empty" as subtitle in `muted-foreground` italic
- **Index with data**: Shows `{n} collections` as subtitle
- **"+ New Index" button**: Ghost style, same height as index items, aligned right. Adjacent `InfoTip` (?) explains what indexes are.

**Layout**: Horizontal scroll if more than ~5 indexes fit the viewport. No wrapping. `gap-1` between items. The whole selector is a `div` with `rounded-lg border border-border bg-card p-1.5` for a grouped feel.

**Active indicator**: The active index has a `ring-1 ring-primary` border (solid primary-color border all around). This reads clearly in both light and dark mode.

**Interaction flow:**
1. Click an index → navigate to `/qmd/{name}`
2. All page content below reloads for that index
3. Last-visited index stored in `localStorage` key `ariadne:qmd:last-index`
4. Visiting `/qmd` (no index segment) redirects to the last-visited index, or `default`

**Context menu** (hover `⋯` button on non-default indexes):
- **Rename** — inline text input replaces the name
- **Delete** — confirmation dialog (destructive). Not available for `default` index.

**Info tip** (?) next to "New Index" button:
- Explains what indexes are and why you'd create multiple

### 6.4 Index Selector — Detailed Component Spec

**File:** `src/components/index-selector.tsx`

```typescript
interface IndexSelectorProps {
  indexes: QmdIndex[];
  active_index: string;           // current index name from route
  on_navigate: (name: string) => void;
  on_create: () => void;
  on_delete: (name: string) => void;
  on_rename: (old_name: string, new_name: string) => void;
}
```

**Rendering per index item:**

| State | Border | Background | Name Style | Subtitle |
|---|---|---|---|---|
| Active, has data | `ring-1 ring-primary` | `bg-accent` | `text-foreground font-medium` | `{n} collections` in `text-muted-foreground text-[11px]` |
| Active, empty | `ring-1 ring-primary` | `bg-accent` | `text-foreground font-medium` | `empty` in `text-muted-foreground text-[11px] italic` |
| Inactive, has data | none | `transparent` | `text-muted-foreground` | `{n} collections` in `text-muted-foreground/70 text-[11px]` |
| Inactive, empty | none | `transparent` | `text-muted-foreground` | `empty` in `text-muted-foreground/50 text-[11px] italic` |
| Hover (inactive) | none | `bg-accent/50` | unchanged | unchanged |

**Item dimensions:** `px-3 py-1.5`, min-width `120px`, rounded `radius-md`.

**"+ New Index" button:** `variant="ghost" size="sm"` with `Plus` icon. Placed at the end of the row, vertically centered. Label: `New Index`. Adjacent `InfoTip` (?) explains the concept of indexes.

### 6.5 Create Index Dialog

**File:** `src/components/create-index-dialog.tsx`

Triggered by the "+ New Index" button in the index selector. Modal overlay (same pattern as `AddCollectionDialog`).

```
┌─────────────────────────────────────────┐
│ Create Index                        [×] │
├─────────────────────────────────────────┤
│                                         │
│  Name                                   │
│  ┌─────────────────────────────────┐    │
│  │ work                            │    │
│  └─────────────────────────────────┘    │
│  Lowercase letters, numbers, and        │
│  hyphens only.                          │
│                                         │
│  Description (optional)                 │
│  ┌─────────────────────────────────┐    │
│  │ Work projects and documentation │    │
│  └─────────────────────────────────┘    │
│  Sets the global context for this       │
│  index. Can be changed later.           │
│                                         │
│              [Cancel]  [Create Index]   │
│                                         │
└─────────────────────────────────────────┘
```

**Fields:**
- **Name** (required): Text input. Validated: lowercase `a-z`, digits `0-9`, hyphens `-`. No spaces, no uppercase, no special chars. Max 32 chars. Must not conflict with existing index names. Must not be `index` (reserved for default).
- **Description** (optional): Text input. If provided, set as the global context for the new index.

**On submit:**
1. Call `qmd_create_index(name)`
2. If description provided, call `qmd_set_global_context(name, description)`
3. Navigate to `/qmd/{name}`
4. Close dialog

### 6.6 Delete Index Confirmation

Triggered by right-click → Delete on an index in the selector (or a delete button in the context menu).

```
┌─────────────────────────────────────────┐
│ Delete Index                        [×] │
├─────────────────────────────────────────┤
│                                         │
│  ⚠ Are you sure you want to delete     │
│  the "work" index?                      │
│                                         │
│  This will permanently remove:          │
│  • 5 collections                        │
│  • 238 documents                        │
│  • All vector embeddings                │
│                                         │
│  This action cannot be undone.          │
│                                         │
│  Type "work" to confirm:               │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│              [Cancel]  [Delete Index]   │
│                                         │
└─────────────────────────────────────────┘
```

**Safety:**
- Cannot delete the `default` index (button disabled, tooltip explains why)
- Requires typing the index name to confirm (destructive action pattern)
- Delete button is `variant="destructive"`, disabled until confirmation text matches

**On submit:**
1. Call `qmd_delete_index(name)`
2. Navigate to `/qmd/default`
3. Close dialog

### 6.7 Rename Index — Inline Edit

Triggered by right-click → Rename, or double-click on the index name in the selector.

The index name text becomes an inline `Input` field, pre-filled with the current name, auto-focused and auto-selected. Same validation as create (lowercase, hyphens, no conflicts).

- **Enter** → commit rename (`qmd_rename_index(old, new)`)
- **Escape** → cancel, revert to original name
- **Click outside** → cancel

Cannot rename `default`.

### 6.8 Updated Breadcrumbs

The breadcrumb logic in `app.tsx` updates:

```typescript
if (parts[0] === "qmd" && parts[2]) {
  // Collection detail: QMD / {index} / {collection}
  return [
    { label: "QMD", href: "/qmd" },
    { label: parts[1], href: `/qmd/${parts[1]}` },
    { label: decodeURIComponent(parts[2]) },
  ];
}
if (parts[0] === "qmd" && parts[1]) {
  // Index overview: QMD / {index}
  return [
    { label: "QMD", href: "/qmd" },
    { label: parts[1] },
  ];
}
if (parts[0] === "qmd") {
  return [{ label: "QMD" }];
}
```

### 6.9 QMD Root Route (`/qmd`) — Redirect

The `/qmd` route becomes a **redirect page**, not a content page:

1. Read `localStorage` key `ariadne:qmd:last-index`
2. If it has a value and that index exists → redirect to `/qmd/{last_index}`
3. Otherwise → redirect to `/qmd/default`

If the default index doesn't exist yet, the redirect still goes to `/qmd/default`, and that page handles the "no index" state (creates it on first load or prompts the user).

### 6.10 QMD Index Overview Page (`/qmd/:index`)

This is the existing QMD overview page, refactored to:
1. Read `:index` from route params
2. Pass `index` to all API calls
3. Show the index selector at the top
4. Auto-create the `default` index if it doesn't exist and the route is `/qmd/default`
5. Store current index in `localStorage` on load

**Page structure:**
```
IndexSelector                     ← always visible
PageHeader + Actions              ← scoped to active index
QmdProgress                       ← if operation running
QmdHealthBanner                   ← if needed
StatCards                         ← scoped to active index
GlobalContextEditor               ← scoped to active index
CollectionsTable                  ← scoped to active index
AddCollectionDialog               ← when triggered
```

### 6.11 QMD Collection Detail Page (`/qmd/:index/:collection`)

The existing collection detail page, refactored to:
1. Read `:index` and `:collection` from route params (previously `$name` → now `$collection`)
2. Pass `index` to all API calls
3. Show the index selector at the top (active index highlighted)
4. Breadcrumb: QMD / {index} / {collection}

**Page structure:**
```
IndexSelector                     ← always visible, active index highlighted
PageHeader + Actions              ← collection name + actions
QmdProgress                       ← if operation running
StatCards                         ← collection stats
Tabs (Files / Settings / Contexts)
TabContent
```

### 6.12 Sidebar — No Change

The sidebar QMD entry stays as-is. Clicking it navigates to `/qmd`, which redirects to the last-visited index. The sidebar active state triggers for any path starting with `/qmd`.

### 6.13 Empty State — First-Time User

If no `.sqlite` files exist in `~/.cache/qmd/`:

```
┌──────────────────────────────────────────────────────────────┐
│ QMD                                                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  No indexes found. A default index has been created.         │
│                                                              │
│  QMD indexes are independent knowledge bases, each with      │
│  their own collections, documents, and embeddings.           │
│                                                              │
│  Add your first collection to start indexing documents.      │
│                                                              │
│  [ Add Collection ]                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The `default` index is automatically created (empty DB) when the user first visits `/qmd/default` and no `index.sqlite` exists.

### 6.14 Index Selector — Empty vs. Populated Visual States

When there's only one index (the default), the selector still renders but appears minimal — just one item. This establishes the pattern so users discover they can add more.

```
One index:
┌──────────────────────────────────────────────────────────────┐
│  ┌─default──┐                                   [ + New ? ] │
│  │2 collect.│                                               │
│  └──────────┘                                               │
└──────────────────────────────────────────────────────────────┘

Multiple indexes:
┌──────────────────────────────────────────────────────────────┐
│  ┌─default──┐  work          personal           [ + New ? ] │
│  │2 collect.│  5 collections  empty                         │
│  └──────────┘                                               │
└──────────────────────────────────────────────────────────────┘
```

## 7. API Changes

### 7.1 New Frontend API Functions

```typescript
// src/api/qmd.ts — NEW functions

export async function qmd_list_indexes(): Promise<QmdIndex[]> {
  const raw = await invoke("qmd_list_indexes");
  return z.array(QmdIndexSchema).parse(raw);
}

export async function qmd_create_index(name: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_create_index", { name });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_delete_index(name: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_delete_index", { name });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_rename_index(
  old_name: string,
  new_name: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_rename_index", { oldName: old_name, newName: new_name });
  return QmdCommandResultSchema.parse(raw);
}
```

### 7.2 Modified Frontend API Functions

Every existing function gains `index: string` as the first parameter:

```typescript
// Example of the pattern — apply to ALL existing functions
export async function qmd_get_status(index: string): Promise<QmdStatus> {
  const raw = await invoke("qmd_get_status", { index });
  return QmdStatusSchema.parse(raw);
}

export async function qmd_list_collections(index: string): Promise<QmdCollection[]> {
  const raw = await invoke("qmd_list_collections", { index });
  return z.array(QmdCollectionSchema).parse(raw);
}

// ... same pattern for all other functions
```

Full list of functions to modify:
- `qmd_check_availability` — **NO CHANGE** (global, not per-index)
- `qmd_get_status(index)`
- `qmd_list_collections(index)`
- `qmd_get_collection_detail(index, name)`
- `qmd_add_collection(index, name, path, pattern)`
- `qmd_remove_collection(index, name)`
- `qmd_rename_collection(index, old_name, new_name)`
- `qmd_add_context(index, collection, path, text)`
- `qmd_remove_context(index, collection, path)`
- `qmd_set_global_context(index, text)`
- `qmd_reindex(index)`
- `qmd_embed(index)`
- `qmd_cleanup(index)`
- `qmd_scan_filesystem(index, collection)`
- `qmd_get_indexed_paths(index, collection)`
- `qmd_toggle_files(index, collection, repo_root, adds, removes)`

## 8. File Manifest

### New Files

| File | Purpose |
|---|---|
| `src/components/index-selector.tsx` | Index switcher bar component |
| `src/components/create-index-dialog.tsx` | Modal for creating a new named index |
| `src/components/delete-index-dialog.tsx` | Destructive confirmation modal for deleting an index |
| `src/pages/qmd-redirect.tsx` | Redirect logic: `/qmd` → `/qmd/{last_index}` |

### Modified Files

| File | Change |
|---|---|
| **Rust Backend** | |
| `src-tauri/src/models/qmd.rs` | Add `QmdIndex` struct |
| `src-tauri/src/commands/qmd.rs` | Add `index` param to all commands. Add `qmd_list_indexes`, `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index`. Refactor `get_db_path()` → `resolve_index_db_path(name)`. Refactor `open_db()` → `open_db(index)`. |
| `src-tauri/src/sidecar.rs` | Add `current_index` tracking. Add `ensure_index(db_path)` method. On `ensure_running()`, set initial index. Add `switch_index` handling. |
| `src-tauri/src/lib.rs` | Register new commands: `qmd_list_indexes`, `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index` |
| **Sidecar** | |
| `src-sidecar/qmd-bridge.ts` | Add `switch_index` and `create_index` method handlers. Track `current_db_path`. |
| **Frontend — Schemas & API** | |
| `src/schemas/qmd.ts` | Add `QmdIndexSchema` and `QmdIndex` type |
| `src/api/qmd.ts` | Add `index` param to all functions. Add `qmd_list_indexes`, `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index`. |
| **Frontend — Routing** | |
| `src/router.tsx` | Replace `qmd_route` and `qmd_collection_route` with new route tree: `/qmd` (redirect), `/qmd/$index` (overview), `/qmd/$index/$collection` (detail) |
| `src/app.tsx` | Update breadcrumb logic for 3-segment QMD paths |
| **Frontend — Pages** | |
| `src/pages/qmd.tsx` | Refactor: read `$index` from route params, pass to all API calls, add `IndexSelector` at top, save last-visited to localStorage |
| `src/pages/qmd-collection.tsx` | Refactor: read `$index` and `$collection` from route params (was `$name`), pass `index` to all API calls, add `IndexSelector` at top |
| **Frontend — Hooks** | |
| `src/hooks/use-qmd-operation.ts` | No structural change, but progress events should include index name for disambiguation |
| **Docs** | |
| `docs/information-architecture.md` | Update QMD route structure to show `/qmd/:index` and `/qmd/:index/:collection` |
| `docs/knowledge/qmd.md` | Add multi-index section documenting the feature |

## 9. Execution Order

### Phase 1: Backend — Index Resolution & Discovery
1. **`src-tauri/src/models/qmd.rs`** — Add `QmdIndex` struct
2. **`src-tauri/src/commands/qmd.rs`** — Refactor `get_db_path()` to `resolve_index_db_path(name: &str)` and `open_db()` to `open_db(index: &str)`. Add `qmd_list_indexes` command. Add `index: String` parameter to all existing commands.
3. **`src-tauri/src/lib.rs`** — Register `qmd_list_indexes` (and later `qmd_create_index`, etc.)
4. **Test**: Verify existing functionality still works with `index = "default"` passed everywhere.

### Phase 2: Sidecar — Index Switching
5. **`src-tauri/src/sidecar.rs`** — Add `current_index: Mutex<Option<String>>` to inner struct. Add `ensure_index(db_path)` method that sends `switch_index` if needed. Call `ensure_index` before every `call_blocking` / `call_with_progress_blocking`.
6. **`src-sidecar/qmd-bridge.ts`** — Add `switch_index` method handler: close current store, open new one. Add `create_index` method handler. Track `current_db_path`.
7. **Test**: Manually send switch_index via sidecar, verify it reopens correctly.

### Phase 3: Backend — CRUD for Indexes
8. **`src-tauri/src/commands/qmd.rs`** — Add `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index` commands.
9. **`src-tauri/src/lib.rs`** — Register all new commands.
10. **Test**: Create, rename, delete indexes from Rust tests or manual invocation.

### Phase 4: Frontend — API & Schema Updates
11. **`src/schemas/qmd.ts`** — Add `QmdIndexSchema` type.
12. **`src/api/qmd.ts`** — Add `index` param to all existing functions. Add new `qmd_list_indexes`, `qmd_create_index`, `qmd_delete_index`, `qmd_rename_index` functions.

### Phase 5: Frontend — Routing
13. **`src/router.tsx`** — Add new route tree with `/qmd` (redirect), `/qmd/$index`, `/qmd/$index/$collection`.
14. **`src/pages/qmd-redirect.tsx`** — Create redirect component that reads localStorage and navigates.
15. **`src/app.tsx`** — Update breadcrumb logic for 3-segment QMD paths.

### Phase 6: Frontend — Index Selector & Dialogs
16. **`src/components/index-selector.tsx`** — Build the index selector bar.
17. **`src/components/create-index-dialog.tsx`** — Build the create index modal.
18. **`src/components/delete-index-dialog.tsx`** — Build the delete confirmation modal.

### Phase 7: Frontend — Page Integration
19. **`src/pages/qmd.tsx`** — Refactor to read `$index` param, integrate IndexSelector, pass index to all API calls, save to localStorage.
20. **`src/pages/qmd-collection.tsx`** — Refactor to read `$index` and `$collection` params, integrate IndexSelector, pass index to all API calls.
21. **Test full flow**: Navigate between indexes, create new index, add collections, delete index, verify all operations are scoped correctly.

### Phase 8: Documentation
22. **`docs/information-architecture.md`** — Update QMD section with new route structure and index concept.
23. **`docs/knowledge/qmd.md`** — Add multi-index documentation section.

## 10. Sidecar Bridge — Implementation Detail

### `switch_index` Method Handler

```typescript
// Added to methods object in qmd-bridge.ts

async switch_index(_store: QMDStore, id: number, params: Record<string, unknown>) {
  const db_path = params.db_path as string;

  // Close current store
  try {
    await store.close();
  } catch {
    // Ignore close errors — store may already be closed
  }

  // Open new store
  try {
    store = await createStore({ dbPath: db_path });
    current_db_path = db_path;
    process.stderr.write(`[qmd-bridge] Switched to index at ${db_path}\n`);
    send_result(id, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send_error(id, -1, `Failed to switch index: ${message}`);
  }
},

async create_index(_store: QMDStore, id: number, params: Record<string, unknown>) {
  const db_path = params.db_path as string;

  // createStore with an explicit dbPath creates the DB if it doesn't exist
  let new_store: QMDStore;
  try {
    new_store = await createStore({ dbPath: db_path });
    await new_store.close();
    send_result(id, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send_error(id, -1, `Failed to create index: ${message}`);
  }
},
```

**Important**: The `switch_index` handler needs to update the module-level `store` variable. The current bridge uses a single `store` variable in `main()`. The handler functions receive the store as their first param, but `switch_index` needs to replace it. Two approaches:

**Approach A** (recommended): Make `store` a module-level `let` variable instead of passing it as a function argument. Method handlers access it directly. `switch_index` reassigns it.

**Approach B**: The handler returns a signal to `main()` to replace the store. More complex, less direct.

Go with **Approach A**: refactor the bridge so `store` is a module-level variable. The method handlers already use it for `toggle_files` (where they call `store.embed()`), so this is consistent.

## 11. Validation Rules

### Index Name Validation
- Pattern: `/^[a-z][a-z0-9-]*$/` (starts with letter, then letters/digits/hyphens)
- Length: 1–32 characters
- Reserved names: `index` (internal stem for default), `models` (QMD models directory)
- Must not conflict with existing index names (case-insensitive check)

### Default Index Protection
- Cannot be deleted
- Cannot be renamed
- Always appears first in the index selector

## 12. localStorage Keys

| Key | Value | Purpose |
|---|---|---|
| `ariadne:qmd:last-index` | Index name string (e.g. `"work"`) | Auto-navigate to last-visited index on `/qmd` |

## 13. Open Considerations

1. **Concurrent operations**: If user starts an embed on index A, switches to index B, and starts an embed there — the sidecar can only handle one index at a time. The `switch_index` during an active operation would be problematic. **Mitigation**: Disable index switching while an operation is in progress. The `use_qmd_operation` hook already tracks busy state — extend it to block the index selector.

2. **Auto-create default**: When `/qmd/default` is visited and no `index.sqlite` exists, the page should auto-create it via `qmd_create_index("default")`. This is a one-time initialization that happens silently.

3. **Index discovery performance**: Scanning `~/.cache/qmd/*.sqlite` and opening each one for stats could be slow if there are many indexes. For v1, this is fine (expect 2-6 indexes). If it becomes an issue, cache stats and only refresh on explicit action.

4. **WAL/SHM cleanup**: When deleting an index, also delete `-wal` and `-shm` companion files if they exist.
