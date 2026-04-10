import { describe, it, expect } from "vitest";
import {
  build_tree,
  get_path,
  build_active_path_ids,
  find_newest_leaf,
  flatten_tree,
  build_tree_prefix,
} from "@/components/session-viewer/utils/tree";
import type { SessionEntry } from "@/components/session-viewer/types";

function make_entry(
  id: string,
  parent_id: string | null,
  timestamp: string,
): SessionEntry {
  return {
    type: "message",
    id,
    parentId: parent_id,
    timestamp,
    message: { role: "user", content: "msg" },
  } as SessionEntry;
}

// ── build_tree ──────────────────────────────────────────────────────────

describe("build_tree", () => {
  it("builds roots from entries with no parent", () => {
    const entries = [
      make_entry("a", null, "2025-01-01T00:00:00Z"),
      make_entry("b", null, "2025-01-01T00:01:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    expect(roots).toHaveLength(2);
  });

  it("builds parent-child relationships", () => {
    const entries = [
      make_entry("root", null, "2025-01-01T00:00:00Z"),
      make_entry("child", "root", "2025-01-01T00:01:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].entry.id).toBe("child");
  });

  it("sorts children by timestamp", () => {
    const entries = [
      make_entry("root", null, "2025-01-01T00:00:00Z"),
      make_entry("late", "root", "2025-01-01T00:03:00Z"),
      make_entry("early", "root", "2025-01-01T00:01:00Z"),
      make_entry("mid", "root", "2025-01-01T00:02:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    const child_ids = roots[0].children.map((c) => c.entry.id);
    expect(child_ids).toEqual(["early", "mid", "late"]);
  });

  it("treats self-referencing parentId as root", () => {
    const entries = [make_entry("self", "self", "2025-01-01T00:00:00Z")];
    const roots = build_tree(entries, new Map());
    expect(roots).toHaveLength(1);
    expect(roots[0].entry.id).toBe("self");
  });

  it("promotes orphans (missing parent) to roots", () => {
    const entries = [make_entry("orphan", "nonexistent", "2025-01-01T00:00:00Z")];
    const roots = build_tree(entries, new Map());
    expect(roots).toHaveLength(1);
  });

  it("attaches labels from label map", () => {
    const entries = [make_entry("a", null, "2025-01-01T00:00:00Z")];
    const labels = new Map([["a", "Step 1"]]);
    const roots = build_tree(entries, labels);
    expect(roots[0].label).toBe("Step 1");
  });

  it("returns empty array for empty entries", () => {
    expect(build_tree([], new Map())).toEqual([]);
  });

  it("handles deep nesting", () => {
    const entries = [
      make_entry("a", null, "2025-01-01T00:00:00Z"),
      make_entry("b", "a", "2025-01-01T00:01:00Z"),
      make_entry("c", "b", "2025-01-01T00:02:00Z"),
      make_entry("d", "c", "2025-01-01T00:03:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    expect(roots).toHaveLength(1);

    let node = roots[0];
    const path: string[] = [node.entry.id];
    while (node.children.length > 0) {
      node = node.children[0];
      path.push(node.entry.id);
    }
    expect(path).toEqual(["a", "b", "c", "d"]);
  });
});

// ── get_path ────────────────────────────────────────────────────────────

describe("get_path", () => {
  const entries = [
    make_entry("a", null, "2025-01-01T00:00:00Z"),
    make_entry("b", "a", "2025-01-01T00:01:00Z"),
    make_entry("c", "b", "2025-01-01T00:02:00Z"),
  ];

  it("returns path from root to specified leaf", () => {
    const path = get_path(entries, "c");
    expect(path.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("returns single entry when leaf is root", () => {
    const path = get_path(entries, "a");
    expect(path.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns empty array when leaf not found", () => {
    const path = get_path(entries, "nonexistent");
    expect(path).toEqual([]);
  });

  it("stops at self-referencing parent", () => {
    const self_ref = [make_entry("x", "x", "2025-01-01T00:00:00Z")];
    const path = get_path(self_ref, "x");
    expect(path.map((e) => e.id)).toEqual(["x"]);
  });
});

// ── build_active_path_ids ───────────────────────────────────────────────

describe("build_active_path_ids", () => {
  const entries = [
    make_entry("a", null, "2025-01-01T00:00:00Z"),
    make_entry("b", "a", "2025-01-01T00:01:00Z"),
    make_entry("c", "b", "2025-01-01T00:02:00Z"),
  ];

  it("returns set of IDs from root to leaf", () => {
    const ids = build_active_path_ids(entries, "c");
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
  });

  it("returns empty set for nonexistent leaf", () => {
    const ids = build_active_path_ids(entries, "missing");
    expect(ids.size).toBe(0);
  });
});

// ── find_newest_leaf ────────────────────────────────────────────────────

describe("find_newest_leaf", () => {
  it("returns the deepest last child (newest leaf)", () => {
    const entries = [
      make_entry("root", null, "2025-01-01T00:00:00Z"),
      make_entry("a", "root", "2025-01-01T00:01:00Z"),
      make_entry("b", "root", "2025-01-01T00:02:00Z"),
      make_entry("c", "b", "2025-01-01T00:03:00Z"),
    ];

    // Starting from root, the newest leaf should be "c" (deepest path via "b")
    const leaf = find_newest_leaf("root", entries, new Map());
    expect(leaf).toBe("c");
  });

  it("returns the node itself when it has no children", () => {
    const entries = [make_entry("leaf", null, "2025-01-01T00:00:00Z")];
    expect(find_newest_leaf("leaf", entries, new Map())).toBe("leaf");
  });

  it("returns node_id when node is not found", () => {
    expect(find_newest_leaf("missing", [], new Map())).toBe("missing");
  });
});

// ── flatten_tree ────────────────────────────────────────────────────────

describe("flatten_tree", () => {
  it("flattens a single-root tree", () => {
    const entries = [
      make_entry("root", null, "2025-01-01T00:00:00Z"),
      make_entry("child", "root", "2025-01-01T00:01:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    const active = new Set(["root", "child"]);
    const flat = flatten_tree(roots, active);

    expect(flat.length).toBe(2);
    expect(flat[0].multiple_roots).toBe(false);
  });

  it("marks multiple_roots=true for branching trees", () => {
    const entries = [
      make_entry("a", null, "2025-01-01T00:00:00Z"),
      make_entry("b", null, "2025-01-01T00:01:00Z"),
    ];
    const roots = build_tree(entries, new Map());
    const flat = flatten_tree(roots, new Set(["a"]));

    expect(flat.every((f) => f.multiple_roots)).toBe(true);
  });

  it("returns empty for empty roots", () => {
    expect(flatten_tree([], new Set())).toEqual([]);
  });
});

// ── build_tree_prefix ───────────────────────────────────────────────────

describe("build_tree_prefix", () => {
  it("returns empty string for root-level single-root node", () => {
    const prefix = build_tree_prefix({
      node: { entry: make_entry("a", null, ""), children: [] },
      indent: 0,
      show_connector: false,
      is_last: true,
      gutters: [],
      is_virtual_root_child: false,
      multiple_roots: false,
    });
    expect(prefix).toBe("");
  });

  it("returns connector characters for indented nodes", () => {
    const prefix = build_tree_prefix({
      node: { entry: make_entry("a", null, ""), children: [] },
      indent: 1,
      show_connector: true,
      is_last: true,
      gutters: [],
      is_virtual_root_child: false,
      multiple_roots: false,
    });
    // Should contain tree drawing characters
    expect(prefix.length).toBeGreaterThan(0);
  });
});
