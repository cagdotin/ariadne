import { describe, it, expect, beforeEach } from "vitest";
import { ToggleState } from "@/lib/toggle-state";
import type { FileTreeNode } from "@/lib/qmd-tree";

function make_file(path: string): FileTreeNode {
  return {
    name: path.split("/").pop()!,
    path,
    is_dir: false,
    children: [],
    file_count: 0,
    indexed: false,
    dir_index_status: "none",
  };
}

function make_dir(path: string, children: FileTreeNode[]): FileTreeNode {
  return {
    name: path.split("/").pop()!,
    path,
    is_dir: true,
    children,
    file_count: children.length,
    indexed: false,
    dir_index_status: "none",
  };
}

describe("ToggleState", () => {
  let state: ToggleState;

  beforeEach(() => {
    state = new ToggleState(["a.ts", "b.ts"]);
  });

  // ── Constructor ───────────────────────────────────────────────────

  it("initializes indexed_set from constructor argument", () => {
    expect(state.indexed_set.has("a.ts")).toBe(true);
    expect(state.indexed_set.has("b.ts")).toBe(true);
    expect(state.indexed_set.has("c.ts")).toBe(false);
  });

  it("starts with no pending changes", () => {
    expect(state.has_pending()).toBe(false);
    expect(state.pending_count()).toBe(0);
  });

  // ── is_effectively_indexed ────────────────────────────────────────

  describe("is_effectively_indexed", () => {
    it("returns true for originally indexed files", () => {
      expect(state.is_effectively_indexed("a.ts")).toBe(true);
    });

    it("returns false for non-indexed files", () => {
      expect(state.is_effectively_indexed("c.ts")).toBe(false);
    });

    it("reflects pending adds", () => {
      state.set_file_state("c.ts", true);
      expect(state.is_effectively_indexed("c.ts")).toBe(true);
    });

    it("reflects pending removes", () => {
      state.set_file_state("a.ts", false);
      expect(state.is_effectively_indexed("a.ts")).toBe(false);
    });

    it("pending add takes priority over indexed_set", () => {
      // File is indexed AND has a pending add — should return true
      state.pending_adds.add("a.ts");
      expect(state.is_effectively_indexed("a.ts")).toBe(true);
    });

    it("pending remove takes priority over indexed_set", () => {
      state.pending_removes.add("a.ts");
      expect(state.is_effectively_indexed("a.ts")).toBe(false);
    });
  });

  // ── set_file_state ────────────────────────────────────────────────

  describe("set_file_state", () => {
    it("adds to pending_adds for new file that should be indexed", () => {
      state.set_file_state("c.ts", true);
      expect(state.pending_adds.has("c.ts")).toBe(true);
      expect(state.pending_removes.has("c.ts")).toBe(false);
    });

    it("adds to pending_removes for indexed file that should be unindexed", () => {
      state.set_file_state("a.ts", false);
      expect(state.pending_removes.has("a.ts")).toBe(true);
      expect(state.pending_adds.has("a.ts")).toBe(false);
    });

    it("clears pending state when reverting to original", () => {
      // Add then revert
      state.set_file_state("c.ts", true);
      expect(state.has_pending()).toBe(true);

      state.set_file_state("c.ts", false); // c.ts was originally not indexed
      expect(state.pending_adds.has("c.ts")).toBe(false);
      expect(state.pending_removes.has("c.ts")).toBe(false);
    });

    it("clears pending state when setting indexed file back to indexed", () => {
      state.set_file_state("a.ts", false); // mark for removal
      state.set_file_state("a.ts", true);  // revert
      expect(state.pending_adds.has("a.ts")).toBe(false);
      expect(state.pending_removes.has("a.ts")).toBe(false);
    });

    it("prevents a file from being in both adds and removes", () => {
      state.set_file_state("c.ts", true);
      state.set_file_state("c.ts", false);
      // c.ts was originally not indexed, setting to false is original state
      expect(state.pending_adds.has("c.ts")).toBe(false);
      expect(state.pending_removes.has("c.ts")).toBe(false);
    });
  });

  // ── toggle_file ───────────────────────────────────────────────────

  describe("toggle_file", () => {
    it("marks indexed file for removal", () => {
      state.toggle_file("a.ts");
      expect(state.is_effectively_indexed("a.ts")).toBe(false);
      expect(state.pending_removes.has("a.ts")).toBe(true);
    });

    it("marks non-indexed file for addition", () => {
      state.toggle_file("c.ts");
      expect(state.is_effectively_indexed("c.ts")).toBe(true);
      expect(state.pending_adds.has("c.ts")).toBe(true);
    });

    it("double-toggle returns to original state", () => {
      state.toggle_file("a.ts");
      state.toggle_file("a.ts");
      expect(state.has_pending()).toBe(false);
      expect(state.is_effectively_indexed("a.ts")).toBe(true);
    });
  });

  // ── toggle_dir ────────────────────────────────────────────────────

  describe("toggle_dir", () => {
    it("removes all descendants when any are included", () => {
      const dir = make_dir("src", [make_file("a.ts"), make_file("c.ts")]);
      // a.ts is indexed, c.ts is not
      state.toggle_dir(dir);

      expect(state.is_effectively_indexed("a.ts")).toBe(false);
      expect(state.is_effectively_indexed("c.ts")).toBe(false);
    });

    it("adds all descendants when none are included", () => {
      const dir = make_dir("src", [make_file("x.ts"), make_file("y.ts")]);
      // neither x.ts nor y.ts are indexed
      state.toggle_dir(dir);

      expect(state.is_effectively_indexed("x.ts")).toBe(true);
      expect(state.is_effectively_indexed("y.ts")).toBe(true);
    });

    it("handles nested directory structures", () => {
      const inner = make_dir("src/sub", [make_file("d.ts"), make_file("e.ts")]);
      const outer = make_dir("src", [make_file("c.ts"), inner]);

      state.toggle_dir(outer);
      // None were indexed, so all should be added
      expect(state.is_effectively_indexed("c.ts")).toBe(true);
      expect(state.is_effectively_indexed("d.ts")).toBe(true);
      expect(state.is_effectively_indexed("e.ts")).toBe(true);
    });
  });

  // ── toggle_node ───────────────────────────────────────────────────

  describe("toggle_node", () => {
    it("dispatches to toggle_file for file nodes", () => {
      state.toggle_node(make_file("c.ts"));
      expect(state.is_effectively_indexed("c.ts")).toBe(true);
    });

    it("dispatches to toggle_dir for directory nodes", () => {
      const dir = make_dir("src", [make_file("x.ts")]);
      state.toggle_node(dir);
      expect(state.is_effectively_indexed("x.ts")).toBe(true);
    });
  });

  // ── has_pending / pending_count ───────────────────────────────────

  describe("has_pending / pending_count", () => {
    it("returns false/0 initially", () => {
      expect(state.has_pending()).toBe(false);
      expect(state.pending_count()).toBe(0);
    });

    it("counts adds and removes together", () => {
      state.set_file_state("a.ts", false); // remove
      state.set_file_state("c.ts", true);  // add
      expect(state.pending_count()).toBe(2);
      expect(state.has_pending()).toBe(true);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────

  describe("clear", () => {
    it("resets all pending state", () => {
      state.set_file_state("a.ts", false);
      state.set_file_state("c.ts", true);
      state.clear();

      expect(state.has_pending()).toBe(false);
      expect(state.pending_count()).toBe(0);
      expect(state.is_effectively_indexed("a.ts")).toBe(true);  // back to original
      expect(state.is_effectively_indexed("c.ts")).toBe(false); // back to original
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty indexed_paths", () => {
      const empty = new ToggleState([]);
      expect(empty.is_effectively_indexed("anything")).toBe(false);
    });

    it("handles toggle on directory with no files", () => {
      const empty_dir = make_dir("empty", []);
      state.toggle_dir(empty_dir);
      // Nothing to toggle, state unchanged
      expect(state.has_pending()).toBe(false);
    });
  });
});
