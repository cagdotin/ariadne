# Ariadne — Rebuild Spec 07: Session Viewer

> The most complex frontend subsystem (~2000 LOC). Renders full conversation trees from raw JSONL entries.

## Architecture

```
SessionDetail (page)
  └── SessionViewer
       ├── SessionDetailHeader    stats bar (messages, tokens, cost, model)
       ├── SessionTree            collapsible tree sidebar (left pane)
       │   └── SessionTreeNode    individual tree node
       └── MessageRenderer        message pane (right pane, scrollable)
            ├── UserMessage
            ├── AssistantMessage
            │   ├── ThinkingBlock
            │   ├── MarkdownContent
            │   └── ToolCallRenderer
            │        ├── BashToolCall
            │        ├── ReadToolCall
            │        ├── EditToolCall
            │        ├── WriteToolCall
            │        ├── GrepToolCall
            │        ├── FindToolCall
            │        ├── LsToolCall
            │        └── GenericToolCall
            ├── BashExecutionBlock
            ├── CompactionBlock
            ├── BranchSummaryBlock
            ├── ModelChangeBlock
            ├── CustomMessageBlock
            └── RawEntryInspector
```

## File Structure

```
src/components/session-viewer/
├── session-viewer.tsx        # Main two-pane viewer
├── session-tree.tsx          # Tree sidebar
├── session-tree-node.tsx     # Individual tree node
├── session-detail-header.tsx # Stats bar
├── message-renderer.tsx      # Entry → component routing
├── assistant-message.tsx     # Assistant message with tool calls
├── user-message.tsx          # User message
├── thinking-block.tsx        # Collapsible thinking/reasoning
├── bash-execution-block.tsx  # Bash output display
├── tool-call-renderer.tsx    # Tool call → specialized component
├── compaction-block.tsx      # Compaction event divider
├── branch-summary-block.tsx  # Branch summary display
├── model-change-block.tsx    # Model switch badge
├── custom-message-block.tsx  # Custom/extension messages
├── expandable-output.tsx     # Collapsible long output
├── markdown-content.tsx      # Markdown renderer
├── raw-entry-inspector.tsx   # JSON inspector for debugging
├── types.ts                  # All JSONL entry types
├── utils.ts                  # Tree building, path resolution, helpers
└── index.ts                  # Re-exports
```

---

## Types (`types.ts`)

### JSONL Entry Types

Every entry has a base shape:
```typescript
interface EntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}
```

**Entry types:**

| type | TypeScript interface | Key fields |
|---|---|---|
| `message` | `MessageEntry` | `message: MessageData` (see below) |
| `model_change` | `ModelChangeEntry` | `provider`, `modelId` |
| `compaction` | `CompactionEntry` | `summary`, `firstKeptEntryId`, `tokensBefore` |
| `branch_summary` | `BranchSummaryEntry` | `fromId`, `summary` |
| `custom` | `CustomEntry` | `customType`, `data` |
| `custom_message` | `CustomMessageEntry` | `customType`, `content`, `display` |
| `label` | `LabelEntry` | `targetId`, `label` |
| `session_info` | `SessionInfoEntry` | `name` |
| `thinking_level_change` | `ThinkingLevelChangeEntry` | `thinkingLevel` |

**Message roles:**

| role | TypeScript interface | Key fields |
|---|---|---|
| `user` | `UserMessage` | `content: string \| ContentBlock[]` |
| `assistant` | `AssistantMessageData` | `content: ContentBlock[]`, `model`, `provider`, `stopReason`, `usage` |
| `toolResult` | `ToolResultMessage` | `toolCallId`, `toolName`, `content`, `isError` |
| `bashExecution` | `BashExecutionMessage` | `command`, `output`, `exitCode`, `cancelled`, `truncated` |
| `custom` | `CustomRoleMessage` | `customType`, `content`, `display` |

**Content blocks:**
- `TextContent` — `{ type: "text", text: string }`
- `ImageContent` — `{ type: "image", data: string, mimeType: string }`
- `ThinkingContent` — `{ type: "thinking", thinking: string }`
- `ToolCallContent` — `{ type: "toolCall", id: string, name: string, arguments: Record<string, unknown> }`

**Tree types:**
- `TreeNode` — `{ entry, children: TreeNode[], label? }`
- `FlatTreeNode` — `{ node, indent, show_connector, is_last, gutters, is_virtual_root_child, multiple_roots }`

---

## Utilities (`utils.ts`)

### Tree Building

`build_tree(entries, label_map)`:
1. Create `node_map: Map<id, TreeNode>` for all entries
2. For each entry: if `parentId` is null or self-referencing → root; otherwise attach to parent node
3. Sort children by timestamp ascending
4. Return root nodes

### Path Resolution

`get_path(entries, leaf_id)`:
- Walk from `leaf_id` up through `parentId` chain to root
- Return array of entries from root to leaf (the "active conversation path")

`build_active_path_ids(entries, leaf_id)`:
- Same walk, but returns a `Set<string>` of entry IDs on the path
- Used to highlight active branches in the tree

### Tree Flattening

`flatten_tree(roots, active_path_ids)`:
- DFS traversal producing `FlatTreeNode[]` for rendering
- Sorts branches so the active branch appears first
- Computes ASCII connector characters (├─, └─, │) for tree lines
- Tracks indentation levels and gutter positions for vertical lines

### Tool Result Map

`build_tool_result_map(entries)`:
- Maps `toolCallId → ToolResultMessage`
- Used to pair tool calls with their results inline

### Tool Call Map

`build_tool_call_map(entries)`:
- Maps `toolCallId → { name, arguments }`
- Used to resolve tool result entries back to their call details

### Label Map

`build_label_map(entries)`:
- Maps `targetId → label string`
- Applied to tree nodes for named branches

### Stats Computation

`compute_stats(entries)`:
- Counts user/assistant/toolResult messages
- Sums tokens and costs from assistant message usage
- Collects unique models
- Counts tool calls, compactions, branch summaries

### Other Helpers

- `extract_text(content)` — extracts text from `string | ContentBlock[]`
- `shorten_path(path)` — replaces `/Users/xxx/` or `/home/xxx/` with `~/`
- `get_language_from_path(path)` — maps file extensions to syntax highlighter language names
- `format_tool_call_label(name, args)` — creates compact display labels for tree nodes
- `format_timestamp(ts)` — HH:MM:SS
- `find_newest_leaf(node_id, entries)` — finds the deepest leaf in a subtree
- `get_unrendered_properties(entry)` — finds entry keys not rendered by known components (for inspector)

---

## SessionViewer Component

**Layout:** Two-pane with resizable split:
- Left pane: Session tree (collapsible sidebar, ~300px default width)
- Right pane: Message pane (scrollable conversation)

**State:**
- `selected_leaf_id` — the leaf of the currently displayed path
- `expanded_nodes` — Set of tree node IDs that are expanded

**On mount:**
1. Build tree from entries + label map
2. Set `selected_leaf_id` to `leaf_id` from the response (most recent leaf)
3. Compute the active path
4. Build tool result map and tool call map

**On tree node click:**
1. If the node has children, find the newest leaf in that subtree
2. Set `selected_leaf_id` to that leaf
3. Recompute the active path
4. Scroll the message pane to show the clicked entry

---

## SessionDetailHeader

Displays a compact stats bar above the viewer:
- Messages: `{user} ↔ {assistant}` with tool result count
- Tokens: formatted total with input/output breakdown
- Cost: formatted total with category breakdown
- Model: primary model name
- Compactions count (if any)

---

## MessageRenderer

Routes each entry to the correct component based on `type` and `message.role`:

| type | role | Component |
|---|---|---|
| `message` | `user` | `UserMessage` |
| `message` | `assistant` | `AssistantMessage` |
| `message` | `toolResult` | (rendered inline within AssistantMessage) |
| `message` | `bashExecution` | `BashExecutionBlock` |
| `message` | `custom` | `CustomMessageBlock` |
| `compaction` | — | `CompactionBlock` |
| `branch_summary` | — | `BranchSummaryBlock` |
| `model_change` | — | `ModelChangeBlock` |
| `custom_message` | — | `CustomMessageBlock` |
| `session_info` | — | (not rendered, metadata only) |
| `label` | — | (not rendered, applied to tree) |

Each rendered entry also gets a `RawEntryInspector` button that expands to show the full JSON.

---

## Component Details

### UserMessage
- Renders user content as text or markdown
- Shows timestamp
- Light background styling

### AssistantMessage
- Iterates through `content` blocks:
  - `thinking` → `ThinkingBlock` (collapsible, mono font, dimmed)
  - `text` → `MarkdownContent`
  - `toolCall` → `ToolCallRenderer` (paired with result from tool_result_map)
- Shows model + provider badge
- Shows usage stats if present

### ThinkingBlock
- Collapsible section with "Thinking" header
- Mono font, smaller text, muted color
- Default: collapsed (shows first line as preview)

### MarkdownContent
- Uses `react-markdown` with:
  - `remark-gfm` for tables, strikethrough, etc.
  - `rehype-raw` for inline HTML
  - Custom code block renderer using `react-syntax-highlighter` (one-dark-pro theme)
  - Inline code gets a subtle background
- Wrapped in `.prose-session` CSS class for typography

### ToolCallRenderer
Routes to specialized tool components:

| Tool name | Component | Display |
|---|---|---|
| `bash` | `BashToolCall` | Shows command, collapsible output, exit code badge |
| `read` / `Read` | `ReadToolCall` | Shows file path (shortened), offset/limit, collapsible content |
| `edit` / `Edit` | `EditToolCall` | Shows file path, old → new text diff |
| `write` / `Write` | `WriteToolCall` | Shows file path, collapsible content |
| `grep` | `GrepToolCall` | Shows pattern + path, output |
| `find` | `FindToolCall` | Shows pattern + path, results |
| `ls` | `LsToolCall` | Shows path, directory listing |
| (other) | `GenericToolCall` | JSON display of arguments + result |

Each tool call shows:
- Tool name badge
- Arguments summary
- Result content (from tool_result_map)
- Error indicator if `isError` is true (red styling)

### BashExecutionBlock
- Shows command in mono font
- Exit code badge (green for 0, red for non-zero)
- `ExpandableOutput` for stdout/stderr
- Cancelled/truncated indicators

### ExpandableOutput
- Shows first N lines (default ~20)
- "Show more" button expands to full output
- Mono font, scrollable

### CompactionBlock
- Horizontal divider with icon
- Shows "Context compacted" with token reduction info
- Muted styling

### BranchSummaryBlock
- Shows summary text in a bordered card
- Indicates it's a branch summary (not a regular message)

### ModelChangeBlock
- Inline badge showing provider/model switch
- Small, dimmed, doesn't take much vertical space

### CustomMessageBlock
- Renders `content` as text/markdown
- Shows `customType` badge

### RawEntryInspector
- Button that expands to show full JSON of the entry
- Uses `JSON.stringify(entry, null, 2)` with syntax highlighting
- Also shows "unrendered properties" — entry keys not displayed by the normal renderer

---

## Session Tree

### Visual Design
- Mono font for tree connectors
- Each node shows a summary: icon + label
- Active path nodes are highlighted
- Branch points show connector characters (├─, └─, │)

### Node summaries by type

| Type/Role | Icon | Label |
|---|---|---|
| User message | 💬 | First ~40 chars of text content |
| Assistant message (text only) | 🤖 | First ~40 chars of text content |
| Assistant message (with tools) | 🤖 | Tool call labels (e.g., "[read: ~/foo.ts]") |
| Bash execution | ⚡ | Command (truncated) |
| Compaction | 🗜️ | "Compaction" |
| Branch summary | 📋 | "Branch summary" |
| Model change | 🔄 | Provider/model |
| Custom message | 📌 | Custom type |

### Interaction
- Click a node → navigate to that point in the conversation
- If the node has children, find and navigate to the newest leaf in its subtree
- Nodes on the active path are visually highlighted
- Branch connectors show tree structure

---

## QMD Tree Utilities (`src/lib/qmd-tree.ts`)

This is separate from the session tree. Used by the QMD collection file tree.

### `handelize_path(file_path)` 
Matches QMD's internal path normalization. Lowercase, replace non-alphanumeric with hyphens, preserve file extensions.

### `resolve_indexed_paths(filesystem_paths, db_indexed_paths)`
Maps handleized DB paths back to filesystem paths.

### `build_file_tree(paths, indexed_set?)`
Builds hierarchical `FileTreeNode[]` from flat paths:
1. Split each path by `/` and build nested directory structure
2. Count files per directory
3. Compute index status per directory (all/some/none)
4. Sort: directories first, then alphabetically
5. Collapse single-child directories (e.g., `docs/exec-plans/active` → one node)

### `flatten_tree(roots, collapsed)`
Flattens tree for rendering, respecting collapsed directories.

### `collect_file_paths(node)`
Recursively collects all descendant file paths.

---

## Toggle State (`src/lib/toggle-state.ts`)

Manages pending file toggle operations for the QMD collection file tree.

```typescript
class ToggleState {
  indexed_set: Set<string>           // currently indexed files
  pending_adds: Set<string>          // files to add
  pending_removes: Set<string>       // files to remove

  is_effectively_indexed(path)       // indexed + adds - removes
  toggle_file(path)                  // toggle single file
  toggle_dir(node)                   // toggle all descendants
  has_pending()                      // any pending changes?
  pending_count()                    // total pending changes
  clear()                            // reset pending state
}
```

When applied, sends `qmd_toggle_files(index, collection, repo_root, [...adds], [...removes])`.
