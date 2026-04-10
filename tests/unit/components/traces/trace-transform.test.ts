import { describe, it, expect } from "vitest";
import {
  build_span_tree,
  flatten_span_tree,
  collect_all_ids,
  format_duration,
} from "@/components/traces/trace-transform";
import type { SessionEntry, SessionHeader, MessageEntry } from "@/components/session-viewer/types";
import type { SpanNode } from "@/components/traces/types";

const SESSION_START = "2025-01-01T00:00:00Z";

function make_header(): SessionHeader {
  return { type: "session", id: "sess-1", timestamp: SESSION_START, cwd: "/project" };
}

function make_entry(
  id: string,
  timestamp: string,
  overrides: Record<string, unknown> = {},
): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp,
    ...overrides,
  } as SessionEntry;
}

function user_entry(id: string, timestamp: string): SessionEntry {
  return make_entry(id, timestamp, {
    message: { role: "user", content: "hello" },
  });
}

function assistant_entry(
  id: string,
  timestamp: string,
  content: Record<string, unknown>[] = [{ type: "text", text: "response" }],
  extra: Record<string, unknown> = {},
): SessionEntry {
  return make_entry(id, timestamp, {
    message: { role: "assistant", content, ...extra },
  });
}

function tool_result_entry(
  id: string,
  timestamp: string,
  tool_call_id: string,
  extra: Record<string, unknown> = {},
): SessionEntry {
  return make_entry(id, timestamp, {
    message: {
      role: "toolResult",
      toolCallId: tool_call_id,
      toolName: "read",
      content: [],
      ...extra,
    },
  });
}

// ── build_span_tree ─────────────────────────────────────────────────────

describe("build_span_tree", () => {
  it("returns empty tree for no entries", () => {
    const tree = build_span_tree(make_header(), []);
    expect(tree.roots).toEqual([]);
    expect(tree.stats.event_count).toBe(0);
    expect(tree.stats.tool_count).toBe(0);
    expect(tree.stats.error_count).toBe(0);
    expect(tree.total_duration_ms).toBe(1000); // minimum
  });

  it("creates a user span at root level", () => {
    const entries = [user_entry("u1", "2025-01-01T00:00:01Z")];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].kind).toBe("user");
    expect(tree.roots[0].label).toBe("User prompt");
  });

  it("nests assistant under preceding user", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      assistant_entry("a1", "2025-01-01T00:00:02Z"),
    ];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].kind).toBe("assistant");
  });

  it("places assistant at root when no preceding user", () => {
    const entries = [assistant_entry("a1", "2025-01-01T00:00:01Z")];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].kind).toBe("assistant");
  });

  it("creates children for multi-block assistant content", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [
        { type: "text", text: "let me check" },
        { type: "thinking", thinking: "hmm..." },
        { type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/a.ts" } },
      ]),
    ];
    const tree = build_span_tree(make_header(), entries);
    const assistant = tree.roots[0];

    expect(assistant.children).toHaveLength(3);
    expect(assistant.children[0].kind).toBe("text");
    expect(assistant.children[1].kind).toBe("thinking");
    expect(assistant.children[2].kind).toBe("tool_call");
    expect(assistant.children[2].label).toBe("tool: read");
  });

  it("does not create children for single text block", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [
        { type: "text", text: "simple response" },
      ]),
    ];
    const tree = build_span_tree(make_header(), entries);

    // Single text block should not be expanded into children
    expect(tree.roots[0].children).toHaveLength(0);
  });

  it("pairs tool results with tool calls", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [
        { type: "toolCall", id: "tc-1", name: "read", arguments: {} },
      ]),
      tool_result_entry("tr1", "2025-01-01T00:00:02Z", "tc-1"),
    ];
    const tree = build_span_tree(make_header(), entries);

    const assistant = tree.roots[0];
    const tool_span = assistant.children[0];
    expect(tool_span.result_entry).toBeDefined();
    // End time should be extended to cover the result
    expect(tool_span.end_ms).toBeGreaterThan(tool_span.start_ms);
  });

  it("marks error on assistant with errorMessage", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [], { errorMessage: "rate limit" }),
    ];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots[0].is_error).toBe(true);
    expect(tree.roots[0].label).toBe("Assistant (error)");
    expect(tree.stats.error_count).toBe(1);
  });

  it("marks error on tool result with isError", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [
        { type: "toolCall", id: "tc-1", name: "bash", arguments: {} },
      ]),
      tool_result_entry("tr1", "2025-01-01T00:00:02Z", "tc-1", { isError: true }),
    ];
    const tree = build_span_tree(make_header(), entries);

    const tool_span = tree.roots[0].children[0];
    expect(tool_span.is_error).toBe(true);
    expect(tree.stats.error_count).toBe(1);
  });

  it("counts tool calls in stats", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [
        { type: "toolCall", id: "tc-1", name: "read", arguments: {} },
        { type: "toolCall", id: "tc-2", name: "write", arguments: {} },
      ]),
    ];
    const tree = build_span_tree(make_header(), entries);
    expect(tree.stats.tool_count).toBe(2);
  });

  it("handles metadata entries at root level", () => {
    const entries = [
      make_entry("mc1", "2025-01-01T00:00:01Z", {
        type: "model_change",
        modelId: "claude-3",
      }),
    ];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].kind).toBe("metadata");
    expect(tree.roots[0].label).toBe("MODEL CHANGE");
    expect(tree.stats.model).toBe("claude-3");
  });

  it("extracts model from first assistant message", () => {
    const entries = [
      assistant_entry("a1", "2025-01-01T00:00:01Z", [], { model: "claude-3-opus" }),
    ];
    const tree = build_span_tree(make_header(), entries);
    expect(tree.stats.model).toBe("claude-3-opus");
  });

  it("handles bashExecution entries", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      assistant_entry("a1", "2025-01-01T00:00:02Z"),
      make_entry("b1", "2025-01-01T00:00:03Z", {
        message: { role: "bashExecution", exitCode: 0 },
      }),
    ];
    const tree = build_span_tree(make_header(), entries);

    // Bash should be nested under assistant
    const assistant = tree.roots[0].children[0];
    expect(assistant.children.some((c) => c.kind === "bash")).toBe(true);
  });

  it("marks bash execution errors (non-zero exit code)", () => {
    const entries = [
      make_entry("b1", "2025-01-01T00:00:01Z", {
        message: { role: "bashExecution", exitCode: 1 },
      }),
    ];
    const tree = build_span_tree(make_header(), entries);
    expect(tree.roots[0].is_error).toBe(true);
    expect(tree.stats.error_count).toBe(1);
  });

  it("handles null header gracefully", () => {
    const entries = [user_entry("u1", "2025-01-01T00:00:01Z")];
    const tree = build_span_tree(null, entries);
    expect(tree.roots).toHaveLength(1);
    expect(tree.session_start_iso).toBe("");
  });

  it("computes depth correctly", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      assistant_entry("a1", "2025-01-01T00:00:02Z", [
        { type: "text", text: "hi" },
        { type: "toolCall", id: "tc1", name: "read", arguments: {} },
      ]),
    ];
    const tree = build_span_tree(make_header(), entries);

    expect(tree.roots[0].depth).toBe(0); // user
    expect(tree.roots[0].children[0].depth).toBe(1); // assistant
    expect(tree.roots[0].children[0].children[0].depth).toBe(2); // text child
  });

  it("computes subtree timing", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      assistant_entry("a1", "2025-01-01T00:00:05Z"),
    ];
    const tree = build_span_tree(make_header(), entries);

    const user = tree.roots[0];
    // subtree_end should be at least as large as child's end
    expect(user.subtree_end_ms).toBeGreaterThanOrEqual(user.end_ms);
  });

  it("handles multiple user turns", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      assistant_entry("a1", "2025-01-01T00:00:02Z"),
      user_entry("u2", "2025-01-01T00:00:03Z"),
      assistant_entry("a2", "2025-01-01T00:00:04Z"),
    ];
    const tree = build_span_tree(make_header(), entries);
    expect(tree.roots).toHaveLength(2); // 2 user turns
  });

  it("handles custom entries within a turn", () => {
    const entries = [
      user_entry("u1", "2025-01-01T00:00:01Z"),
      make_entry("c1", "2025-01-01T00:00:02Z", {
        message: { role: "custom", customType: "hook_output" },
      }),
    ];
    const tree = build_span_tree(make_header(), entries);
    // Custom should be under user turn
    expect(tree.roots[0].children.some((c) => c.kind === "custom")).toBe(true);
  });
});

// ── flatten_span_tree ───────────────────────────────────────────────────

describe("flatten_span_tree", () => {
  function make_span(
    id: string,
    children: SpanNode[] = [],
  ): SpanNode {
    return {
      id,
      label: id,
      kind: "user",
      start_ms: 0,
      end_ms: 100,
      subtree_start_ms: 0,
      subtree_end_ms: 100,
      duration_ms: 100,
      subtree_duration_ms: 100,
      color: "red",
      is_error: false,
      depth: 0,
      children,
      entry: {} as SessionEntry,
    };
  }

  it("returns all nodes when all are expanded", () => {
    const root = make_span("root", [
      make_span("child-1"),
      make_span("child-2"),
    ]);
    const rows = flatten_span_tree([root], new Set(["root"]));
    expect(rows).toHaveLength(3);
  });

  it("hides children when parent is collapsed", () => {
    const root = make_span("root", [make_span("child")]);
    const rows = flatten_span_tree([root], new Set()); // nothing expanded
    expect(rows).toHaveLength(1);
    expect(rows[0].has_children).toBe(true);
    expect(rows[0].is_expanded).toBe(false);
  });

  it("returns empty for empty roots", () => {
    expect(flatten_span_tree([], new Set())).toEqual([]);
  });

  it("handles deeply nested expansion", () => {
    const deep = make_span("c", []);
    const mid = make_span("b", [deep]);
    const root = make_span("a", [mid]);

    const rows = flatten_span_tree([root], new Set(["a", "b"]));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.node.id)).toEqual(["a", "b", "c"]);
  });

  it("tracks depth in rows", () => {
    const child = make_span("child");
    child.depth = 1;
    const root = make_span("root", [child]);
    root.depth = 0;

    const rows = flatten_span_tree([root], new Set(["root"]));
    expect(rows[0].depth).toBe(0);
    expect(rows[1].depth).toBe(1);
  });
});

// ── collect_all_ids ─────────────────────────────────────────────────────

describe("collect_all_ids", () => {
  function make_span(id: string, children: SpanNode[] = []): SpanNode {
    return {
      id, label: id, kind: "user", start_ms: 0, end_ms: 0,
      subtree_start_ms: 0, subtree_end_ms: 0, duration_ms: 0,
      subtree_duration_ms: 0, color: "", is_error: false, depth: 0,
      children, entry: {} as SessionEntry,
    };
  }

  it("collects IDs of nodes with children only", () => {
    const tree = [make_span("root", [make_span("child")])];
    const ids = collect_all_ids(tree);
    expect(ids.has("root")).toBe(true);
    expect(ids.has("child")).toBe(false); // leaf node
  });

  it("returns empty set for flat tree", () => {
    const tree = [make_span("a"), make_span("b")];
    const ids = collect_all_ids(tree);
    expect(ids.size).toBe(0);
  });

  it("returns empty set for empty tree", () => {
    expect(collect_all_ids([]).size).toBe(0);
  });

  it("collects deeply nested parent IDs", () => {
    const tree = [
      make_span("a", [
        make_span("b", [
          make_span("c", [make_span("d")]),
        ]),
      ]),
    ];
    const ids = collect_all_ids(tree);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
    expect(ids.has("d")).toBe(false);
  });
});

// ── format_duration ─────────────────────────────────────────────────────

describe("format_duration (trace-transform)", () => {
  it("formats sub-millisecond as microseconds", () => {
    expect(format_duration(0.5)).toBe("500µs");
    expect(format_duration(0.001)).toBe("1µs");
  });

  it("formats milliseconds", () => {
    expect(format_duration(1)).toBe("1ms");
    expect(format_duration(500)).toBe("500ms");
    expect(format_duration(999)).toBe("999ms");
  });

  it("formats seconds", () => {
    expect(format_duration(1000)).toBe("1s");
    expect(format_duration(5000)).toBe("5s");
    expect(format_duration(59999)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(format_duration(60000)).toBe("1:00");
    expect(format_duration(90000)).toBe("1:30");
    expect(format_duration(125000)).toBe("2:05");
  });

  it("pads seconds in minute format", () => {
    expect(format_duration(61000)).toBe("1:01");
    expect(format_duration(69000)).toBe("1:09");
  });

  it("handles zero", () => {
    expect(format_duration(0)).toBe("0µs");
  });

  it("handles fractional milliseconds near boundary", () => {
    expect(format_duration(0.999)).toBe("999µs");
  });
});
