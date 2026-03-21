import type {
  SessionEntry,
  SessionStats,
  ContentBlock,
  TextContent,
  ToolResultMessage,
  MessageEntry,
  TreeNode,
  FlatTreeNode,
  LabelEntry,
} from "./types";

// ============================================================
// TEXT EXTRACTION
// ============================================================

export function extract_text(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is TextContent => c.type === "text" && Boolean(c.text))
    .map((c) => c.text)
    .join("");
}

export function has_text_content(content: string | ContentBlock[]): boolean {
  return extract_text(content).trim().length > 0;
}

// ============================================================
// PATH HELPERS
// ============================================================

export function shorten_path(p: unknown): string {
  if (typeof p !== "string") return "";
  if (p.startsWith("/Users/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/Users/" + parts[2]).length);
  }
  if (p.startsWith("/home/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/home/" + parts[2]).length);
  }
  return p;
}

export function get_language_from_path(file_path: string): string | undefined {
  const ext = file_path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
    php: "php", sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
    md: "markdown", dockerfile: "dockerfile", toml: "toml",
    graphql: "graphql", swift: "swift", kt: "kotlin",
  };
  return ext ? map[ext] : undefined;
}

// ============================================================
// TOOL RESULT LOOKUP
// ============================================================

export function build_tool_result_map(
  entries: SessionEntry[]
): Map<string, ToolResultMessage> {
  const map = new Map<string, ToolResultMessage>();
  for (const entry of entries) {
    if (
      entry.type === "message" &&
      (entry as MessageEntry).message.role === "toolResult"
    ) {
      const msg = (entry as MessageEntry).message as ToolResultMessage;
      if (msg.toolCallId) {
        map.set(msg.toolCallId, msg);
      }
    }
  }
  return map;
}

// ============================================================
// TOOL CALL LOOKUP (toolCallId → { name, arguments })
// ============================================================

export function build_tool_call_map(
  entries: SessionEntry[]
): Map<string, { name: string; arguments: Record<string, unknown> }> {
  const map = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = (entry as MessageEntry).message;
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "toolCall") {
            map.set(block.id, { name: block.name, arguments: block.arguments });
          }
        }
      }
    }
  }
  return map;
}

// ============================================================
// LABEL MAP
// ============================================================

export function build_label_map(entries: SessionEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "label") {
      const le = entry as LabelEntry;
      if (le.targetId && le.label) {
        map.set(le.targetId, le.label);
      }
    }
  }
  return map;
}

// ============================================================
// STATS COMPUTATION
// ============================================================

export function compute_stats(entries: SessionEntry[]): SessionStats {
  const stats: SessionStats = {
    user_messages: 0,
    assistant_messages: 0,
    tool_results: 0,
    custom_messages: 0,
    compactions: 0,
    branch_summaries: 0,
    tool_calls: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    models: [],
  };

  const model_set = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = (entry as MessageEntry).message;
      if (msg.role === "user") stats.user_messages++;
      if (msg.role === "assistant") {
        stats.assistant_messages++;
        if (msg.model)
          model_set.add(msg.provider ? `${msg.provider}/${msg.model}` : msg.model);
        if (msg.usage) {
          stats.tokens.input += msg.usage.input ?? 0;
          stats.tokens.output += msg.usage.output ?? 0;
          stats.tokens.cache_read += msg.usage.cacheRead ?? 0;
          stats.tokens.cache_write += msg.usage.cacheWrite ?? 0;
          if (msg.usage.cost) {
            stats.cost.input += msg.usage.cost.input ?? 0;
            stats.cost.output += msg.usage.cost.output ?? 0;
            stats.cost.cache_read += msg.usage.cost.cacheRead ?? 0;
            stats.cost.cache_write += msg.usage.cost.cacheWrite ?? 0;
          }
        }
        stats.tool_calls += msg.content.filter((c) => c.type === "toolCall").length;
      }
      if (msg.role === "toolResult") stats.tool_results++;
    } else if (entry.type === "compaction") {
      stats.compactions++;
    } else if (entry.type === "branch_summary") {
      stats.branch_summaries++;
    } else if (entry.type === "custom_message") {
      stats.custom_messages++;
    }
  }

  stats.models = Array.from(model_set);
  return stats;
}

// ============================================================
// TREE BUILDING
// ============================================================

export function build_tree(entries: SessionEntry[], label_map: Map<string, string>): TreeNode[] {
  const node_map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const entry of entries) {
    node_map.set(entry.id, {
      entry,
      children: [],
      label: label_map.get(entry.id),
    });
  }

  for (const entry of entries) {
    const node = node_map.get(entry.id)!;
    if (entry.parentId === null || entry.parentId === undefined || entry.parentId === entry.id) {
      roots.push(node);
    } else {
      const parent = node_map.get(entry.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  function sort_children(node: TreeNode) {
    node.children.sort(
      (a, b) =>
        new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime()
    );
    node.children.forEach(sort_children);
  }
  roots.forEach(sort_children);

  return roots;
}

// ============================================================
// PATH FROM ROOT TO LEAF
// ============================================================

export function get_path(
  entries: SessionEntry[],
  leaf_id: string
): SessionEntry[] {
  const by_id = new Map<string, SessionEntry>();
  for (const e of entries) by_id.set(e.id, e);

  const path: SessionEntry[] = [];
  let current = by_id.get(leaf_id);
  while (current) {
    path.unshift(current);
    if (!current.parentId || current.parentId === current.id) break;
    current = by_id.get(current.parentId);
  }
  return path;
}

export function build_active_path_ids(
  entries: SessionEntry[],
  leaf_id: string
): Set<string> {
  const by_id = new Map<string, SessionEntry>();
  for (const e of entries) by_id.set(e.id, e);

  const ids = new Set<string>();
  let current = by_id.get(leaf_id);
  while (current) {
    ids.add(current.id);
    if (!current.parentId || current.parentId === current.id) break;
    current = by_id.get(current.parentId);
  }
  return ids;
}

// ============================================================
// FLATTEN TREE (for sidebar rendering)
// ============================================================

export function flatten_tree(
  roots: TreeNode[],
  active_path_ids: Set<string>
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  const multiple_roots = roots.length > 1;

  // mark which subtrees contain active leaf
  const contains_active = new Map<TreeNode, boolean>();
  function mark_active(node: TreeNode): boolean {
    let has = active_path_ids.has(node.entry.id);
    for (const child of node.children) {
      if (mark_active(child)) has = true;
    }
    contains_active.set(node, has);
    return has;
  }
  roots.forEach(mark_active);

  type StackItem = [
    TreeNode, number, boolean, boolean, boolean,
    { position: number; show: boolean }[], boolean
  ];
  const stack: StackItem[] = [];

  const ordered_roots = [...roots].sort(
    (a, b) => Number(contains_active.get(b)) - Number(contains_active.get(a))
  );
  for (let i = ordered_roots.length - 1; i >= 0; i--) {
    const is_last = i === ordered_roots.length - 1;
    stack.push([
      ordered_roots[i],
      multiple_roots ? 1 : 0,
      multiple_roots,
      multiple_roots,
      is_last,
      [],
      multiple_roots,
    ]);
  }

  while (stack.length > 0) {
    const [node, indent, just_branched, show_connector, is_last, gutters, is_virtual_root_child] =
      stack.pop()!;

    result.push({
      node,
      indent,
      show_connector,
      is_last,
      gutters,
      is_virtual_root_child,
      multiple_roots,
    });

    const children = node.children;
    const multiple_children = children.length > 1;

    const ordered_children = [...children].sort(
      (a, b) => Number(contains_active.get(b)) - Number(contains_active.get(a))
    );

    let child_indent: number;
    if (multiple_children) {
      child_indent = indent + 1;
    } else if (just_branched && indent > 0) {
      child_indent = indent + 1;
    } else {
      child_indent = indent;
    }

    const connector_displayed = show_connector && !is_virtual_root_child;
    const current_display_indent = multiple_roots ? Math.max(0, indent - 1) : indent;
    const connector_position = Math.max(0, current_display_indent - 1);
    const child_gutters = connector_displayed
      ? [...gutters, { position: connector_position, show: !is_last }]
      : gutters;

    for (let i = ordered_children.length - 1; i >= 0; i--) {
      const child_is_last = i === ordered_children.length - 1;
      stack.push([
        ordered_children[i],
        child_indent,
        multiple_children,
        multiple_children,
        child_is_last,
        child_gutters,
        false,
      ]);
    }
  }

  return result;
}

// ============================================================
// TREE PREFIX (ASCII connectors)
// ============================================================

export function build_tree_prefix(flat_node: FlatTreeNode): string {
  const { indent, show_connector, is_last, gutters, is_virtual_root_child, multiple_roots } =
    flat_node;
  const display_indent = multiple_roots ? Math.max(0, indent - 1) : indent;
  const connector =
    show_connector && !is_virtual_root_child ? (is_last ? "└─ " : "├─ ") : "";
  const connector_position = connector ? display_indent - 1 : -1;

  const total_chars = display_indent * 3;
  const prefix_chars: string[] = [];
  for (let i = 0; i < total_chars; i++) {
    const level = Math.floor(i / 3);
    const pos_in_level = i % 3;

    const gutter = gutters.find((g) => g.position === level);
    if (gutter) {
      prefix_chars.push(pos_in_level === 0 ? (gutter.show ? "│" : " ") : " ");
    } else if (connector && level === connector_position) {
      if (pos_in_level === 0) {
        prefix_chars.push(is_last ? "└" : "├");
      } else if (pos_in_level === 1) {
        prefix_chars.push("─");
      } else {
        prefix_chars.push(" ");
      }
    } else {
      prefix_chars.push(" ");
    }
  }
  return prefix_chars.join("");
}

// ============================================================
// FIND NEWEST LEAF
// ============================================================

export function find_newest_leaf(node_id: string, entries: SessionEntry[], label_map: Map<string, string>): string {
  const tree = build_tree(entries, label_map);
  const node_map = new Map<string, TreeNode>();
  function map_nodes(node: TreeNode) {
    node_map.set(node.entry.id, node);
    node.children.forEach(map_nodes);
  }
  tree.forEach(map_nodes);

  const node = node_map.get(node_id);
  if (!node) return node_id;

  let current = node;
  while (current.children.length > 0) {
    current = current.children[current.children.length - 1];
  }
  return current.entry.id;
}

// ============================================================
// FORMAT TOOL CALL LABEL (for tree display)
// ============================================================

export function format_tool_call_label(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "read": {
      const path = shorten_path(String(args.path || args.file_path || ""));
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      let display = path;
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? start + limit - 1 : "";
        display += `:${start}${end ? `-${end}` : ""}`;
      }
      return `[read: ${display}]`;
    }
    case "write":
      return `[write: ${shorten_path(String(args.path || args.file_path || ""))}]`;
    case "edit":
      return `[edit: ${shorten_path(String(args.path || args.file_path || ""))}]`;
    case "bash": {
      const raw = String(args.command || "");
      const cmd = raw.replace(/[\n\t]/g, " ").trim().slice(0, 50);
      return `[bash: ${cmd}${raw.length > 50 ? "..." : ""}]`;
    }
    case "grep":
      return `[grep: /${args.pattern || ""}/ in ${shorten_path(String(args.path || "."))}]`;
    case "find":
      return `[find: ${args.pattern || ""} in ${shorten_path(String(args.path || "."))}]`;
    case "ls":
      return `[ls: ${shorten_path(String(args.path || "."))}]`;
    default: {
      const s = JSON.stringify(args);
      return `[${name}: ${s.slice(0, 40)}${s.length > 40 ? "..." : ""}]`;
    }
  }
}

// ============================================================
// FORMAT TIMESTAMP
// ============================================================

export function format_timestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================
// PROPERTY AUDIT (for RawEntryInspector)
// ============================================================

/** Known base keys present on every entry */
const BASE_KEYS = new Set(["type", "id", "parentId", "timestamp"]);

/** Keys rendered per entry type */
const RENDERED_KEYS: Record<string, Set<string>> = {
  message: new Set([...BASE_KEYS, "message"]),
  compaction: new Set([...BASE_KEYS, "summary", "firstKeptEntryId", "tokensBefore", "details", "fromHook"]),
  branch_summary: new Set([...BASE_KEYS, "fromId", "summary", "details", "fromHook"]),
  model_change: new Set([...BASE_KEYS, "provider", "modelId"]),
  thinking_level_change: new Set([...BASE_KEYS, "thinkingLevel"]),
  custom_message: new Set([...BASE_KEYS, "customType", "content", "details", "display"]),
  custom: new Set([...BASE_KEYS, "customType", "data"]),
  label: new Set([...BASE_KEYS, "targetId", "label"]),
  session_info: new Set([...BASE_KEYS, "name"]),
};

export function get_unrendered_properties(entry: SessionEntry): { key: string; value: unknown }[] {
  const rendered = RENDERED_KEYS[entry.type] ?? BASE_KEYS;
  const unrendered: { key: string; value: unknown }[] = [];
  for (const key of Object.keys(entry)) {
    if (!rendered.has(key)) {
      unrendered.push({ key, value: (entry as Record<string, unknown>)[key] });
    }
  }
  return unrendered;
}
