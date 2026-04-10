import { describe, it, expect } from "vitest";
import {
  parse_excludes,
  is_excluded,
  recompute_directory_stats,
  get_active_file_list,
  get_hidden_count,
} from "@/components/scoped-file-analytics/utils";
import type { ProjectFileStats } from "@contracts/analytics/files";

// ── parse_excludes ──────────────────────────────────────────────────────

describe("parse_excludes", () => {
  it("splits comma-separated values", () => {
    expect(parse_excludes("node_modules,dist,.git"))
      .toEqual(["node_modules", "dist", ".git"]);
  });

  it("trims whitespace around segments", () => {
    expect(parse_excludes("  node_modules , dist , .git  "))
      .toEqual(["node_modules", "dist", ".git"]);
  });

  it("filters out empty segments", () => {
    expect(parse_excludes("a,,b,,,c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty string", () => {
    expect(parse_excludes("")).toEqual([]);
  });

  it("returns empty array for only whitespace/commas", () => {
    expect(parse_excludes(" , , ")).toEqual([]);
  });

  it("handles single value", () => {
    expect(parse_excludes("node_modules")).toEqual(["node_modules"]);
  });
});

// ── is_excluded ─────────────────────────────────────────────────────────

describe("is_excluded", () => {
  it("returns true when path contains an exclude pattern", () => {
    expect(is_excluded("src/node_modules/pkg/index.js", ["node_modules"])).toBe(true);
  });

  it("returns false when path contains no exclude patterns", () => {
    expect(is_excluded("src/lib/utils.ts", ["node_modules", "dist"])).toBe(false);
  });

  it("matches anywhere in the path (not just prefix)", () => {
    expect(is_excluded("/project/dist/bundle.js", ["dist"])).toBe(true);
    expect(is_excluded("/project/src/dist-helper.ts", ["dist"])).toBe(true);
  });

  it("returns false for empty excludes list", () => {
    expect(is_excluded("any/path/file.ts", [])).toBe(false);
  });

  it("matches partial directory names (substring match)", () => {
    // "test" matches "testing" — this is a substring match
    expect(is_excluded("src/testing/file.ts", ["test"])).toBe(true);
  });
});

// ── recompute_directory_stats ───────────────────────────────────────────

describe("recompute_directory_stats", () => {
  it("aggregates counts by parent directory", () => {
    const read = [{ name: "src/a.ts", count: 5 }, { name: "src/b.ts", count: 3 }];
    const edit = [{ name: "src/a.ts", count: 2 }];
    const write = [{ name: "lib/c.ts", count: 1 }];

    const stats = recompute_directory_stats(read, edit, write, []);

    const src_stat = stats.find((s) => s.path === "src");
    expect(src_stat?.read_count).toBe(8);
    expect(src_stat?.edit_count).toBe(2);
    expect(src_stat?.write_count).toBe(0);
    expect(src_stat?.total).toBe(10);

    const lib_stat = stats.find((s) => s.path === "lib");
    expect(lib_stat?.write_count).toBe(1);
    expect(lib_stat?.total).toBe(1);
  });

  it("excludes files matching exclude patterns", () => {
    const read = [
      { name: "src/app.ts", count: 5 },
      { name: "node_modules/pkg/index.js", count: 10 },
    ];

    const stats = recompute_directory_stats(read, [], [], ["node_modules"]);
    expect(stats).toHaveLength(1);
    expect(stats[0].path).toBe("src");
  });

  it("sorts results by total descending", () => {
    const read = [
      { name: "a/file.ts", count: 1 },
      { name: "b/file.ts", count: 10 },
      { name: "c/file.ts", count: 5 },
    ];

    const stats = recompute_directory_stats(read, [], [], []);
    expect(stats.map((s) => s.path)).toEqual(["b", "c", "a"]);
  });

  it("returns empty array for empty inputs", () => {
    expect(recompute_directory_stats([], [], [], [])).toEqual([]);
  });

  it("uses '.' as directory for root-level files", () => {
    const read = [{ name: "README.md", count: 1 }];
    const stats = recompute_directory_stats(read, [], [], []);
    expect(stats[0].path).toBe(".");
  });

  it("handles same directory appearing in all three lists", () => {
    const read = [{ name: "src/file.ts", count: 10 }];
    const edit = [{ name: "src/file.ts", count: 5 }];
    const write = [{ name: "src/other.ts", count: 2 }];

    const stats = recompute_directory_stats(read, edit, write, []);
    const src = stats.find((s) => s.path === "src")!;
    expect(src.read_count).toBe(10);
    expect(src.edit_count).toBe(5);
    expect(src.write_count).toBe(2);
    expect(src.total).toBe(17);
  });
});

// ── get_active_file_list ────────────────────────────────────────────────

describe("get_active_file_list", () => {
  const read_files = [{ name: "a.ts", count: 1 }];
  const edit_files = [{ name: "b.ts", count: 2 }];
  const write_files = [{ name: "c.ts", count: 3 }];

  it("returns read files for 'read' tab", () => {
    expect(get_active_file_list("read", read_files, edit_files, write_files))
      .toBe(read_files);
  });

  it("returns edit files for 'edit' tab", () => {
    expect(get_active_file_list("edit", read_files, edit_files, write_files))
      .toBe(edit_files);
  });

  it("returns write files for 'write' tab", () => {
    expect(get_active_file_list("write", read_files, edit_files, write_files))
      .toBe(write_files);
  });
});

// ── get_hidden_count ────────────────────────────────────────────────────

describe("get_hidden_count", () => {
  it("returns 0 for null file_stats", () => {
    expect(get_hidden_count(null, ["node_modules"])).toBe(0);
  });

  it("counts unique files that match excludes", () => {
    const file_stats = {
      project_path: "/proj",
      total_sessions: 1,
      tool_distribution: [],
      read_files: [
        { name: "src/app.ts", count: 5 },
        { name: "node_modules/pkg/a.js", count: 3 },
      ],
      edit_files: [
        { name: "node_modules/pkg/a.js", count: 1 }, // duplicate, should count once
      ],
      write_files: [],
      bash_commands: [],
      directory_stats: [],
      activity_by_date: [],
      file_insights: [],
    } as ProjectFileStats;

    expect(get_hidden_count(file_stats, ["node_modules"])).toBe(1);
  });

  it("returns 0 when no files match excludes", () => {
    const file_stats = {
      project_path: "/proj",
      total_sessions: 1,
      tool_distribution: [],
      read_files: [{ name: "src/app.ts", count: 5 }],
      edit_files: [],
      write_files: [],
      bash_commands: [],
      directory_stats: [],
      activity_by_date: [],
      file_insights: [],
    } as ProjectFileStats;

    expect(get_hidden_count(file_stats, ["node_modules"])).toBe(0);
  });

  it("returns 0 with empty excludes", () => {
    const file_stats = {
      project_path: "/proj",
      total_sessions: 1,
      tool_distribution: [],
      read_files: [{ name: "src/app.ts", count: 5 }],
      edit_files: [],
      write_files: [],
      bash_commands: [],
      directory_stats: [],
      activity_by_date: [],
      file_insights: [],
    } as ProjectFileStats;

    expect(get_hidden_count(file_stats, [])).toBe(0);
  });

  it("deduplicates across read, edit, and write lists", () => {
    const file_stats = {
      project_path: "/proj",
      total_sessions: 1,
      tool_distribution: [],
      read_files: [{ name: "dist/out.js", count: 1 }],
      edit_files: [{ name: "dist/out.js", count: 1 }],
      write_files: [{ name: "dist/out.js", count: 1 }],
      bash_commands: [],
      directory_stats: [],
      activity_by_date: [],
      file_insights: [],
    } as ProjectFileStats;

    // Same file in all three — should count as 1
    expect(get_hidden_count(file_stats, ["dist"])).toBe(1);
  });
});
