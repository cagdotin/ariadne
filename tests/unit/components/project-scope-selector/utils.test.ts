import { describe, it, expect } from "vitest";
import {
  normalize_path_segments,
  get_workspace_label,
  get_project_subtitle,
  matches_project_query,
  sort_projects_by_recent,
  sort_projects_by_activity,
  build_workspace_groups,
  is_filter_mode,
} from "@/components/project-scope-selector/utils";
import type { ProjectSummary } from "@contracts/shared";

function make_project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    name: "test-project",
    path: "/Users/me/dev/org/test-project",
    session_count: 5,
    total_cost: 1.5,
    total_tokens: 10000,
    last_active: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

// ── normalize_path_segments ─────────────────────────────────────────────

describe("normalize_path_segments", () => {
  it("splits path into segments, filtering empty ones", () => {
    expect(normalize_path_segments("/Users/me/project"))
      .toEqual(["Users", "me", "project"]);
  });

  it("strips trailing slash before splitting", () => {
    expect(normalize_path_segments("/Users/me/project/"))
      .toEqual(["Users", "me", "project"]);
  });

  it("handles root path", () => {
    expect(normalize_path_segments("/")).toEqual([]);
  });

  it("handles relative paths", () => {
    expect(normalize_path_segments("src/lib")).toEqual(["src", "lib"]);
  });
});

// ── get_workspace_label ─────────────────────────────────────────────────

describe("get_workspace_label", () => {
  it("returns parent/grandparent for deep paths", () => {
    // segments: Users, me, dev, org, project — 5 segments
    // segments[-3] / segments[-2] = "dev / org"
    expect(get_workspace_label("/Users/me/dev/org/project")).toBe("dev / org");
  });

  it("returns parent for medium-depth paths", () => {
    // segments: Users, me, project — 3 segments
    expect(get_workspace_label("/Users/me/project")).toBe("Users / me");
  });

  it("returns parent for two-segment paths", () => {
    expect(get_workspace_label("/Users/project")).toBe("Users");
  });

  it("returns 'other' for single-segment paths", () => {
    expect(get_workspace_label("/project")).toBe("other");
  });

  it("returns 'other' for root", () => {
    expect(get_workspace_label("/")).toBe("other");
  });
});

// ── get_project_subtitle ────────────────────────────────────────────────

describe("get_project_subtitle", () => {
  it("returns abbreviated parent path", () => {
    const result = get_project_subtitle("/Users/me/dev/org/project");
    expect(result).toBe("…/me/dev/org");
  });

  it("returns full path for single segment", () => {
    expect(get_project_subtitle("/project")).toBe("/project");
  });

  it("handles short paths", () => {
    // segments: Users, project — parent_segments is ["Users"]
    expect(get_project_subtitle("/Users/project")).toBe("…/Users");
  });
});

// ── matches_project_query ───────────────────────────────────────────────

describe("matches_project_query", () => {
  const project = make_project({
    name: "ariadne",
    path: "/Users/me/dev/0xcgn/ariadne",
  });

  it("matches on empty query (shows all)", () => {
    expect(matches_project_query(project, "")).toBe(true);
  });

  it("matches on project name", () => {
    expect(matches_project_query(project, "ariadne")).toBe(true);
  });

  it("matches on project path", () => {
    expect(matches_project_query(project, "0xcgn")).toBe(true);
  });

  it("matches on workspace label", () => {
    expect(matches_project_query(project, "dev")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(matches_project_query(project, "ARIADNE")).toBe(true);
  });

  it("returns false for non-matching query", () => {
    expect(matches_project_query(project, "zzz-no-match")).toBe(false);
  });
});

// ── sort_projects_by_recent ─────────────────────────────────────────────

describe("sort_projects_by_recent", () => {
  it("sorts by last_active descending (newest first)", () => {
    const projects = [
      make_project({ name: "old", last_active: "2025-01-01T00:00:00Z" }),
      make_project({ name: "new", last_active: "2025-06-01T00:00:00Z" }),
      make_project({ name: "mid", last_active: "2025-03-01T00:00:00Z" }),
    ];

    const sorted = sort_projects_by_recent(projects);
    expect(sorted.map((p) => p.name)).toEqual(["new", "mid", "old"]);
  });

  it("breaks ties by session_count descending", () => {
    const projects = [
      make_project({ name: "few", session_count: 2, last_active: "2025-06-01T00:00:00Z" }),
      make_project({ name: "many", session_count: 10, last_active: "2025-06-01T00:00:00Z" }),
    ];

    const sorted = sort_projects_by_recent(projects);
    expect(sorted[0].name).toBe("many");
  });

  it("breaks further ties by name alphabetically", () => {
    const projects = [
      make_project({ name: "beta", session_count: 5, last_active: "2025-06-01T00:00:00Z" }),
      make_project({ name: "alpha", session_count: 5, last_active: "2025-06-01T00:00:00Z" }),
    ];

    const sorted = sort_projects_by_recent(projects);
    expect(sorted[0].name).toBe("alpha");
  });

  it("does not mutate the original array", () => {
    const projects = [
      make_project({ name: "b", last_active: "2025-01-01T00:00:00Z" }),
      make_project({ name: "a", last_active: "2025-06-01T00:00:00Z" }),
    ];
    const original = [...projects];
    sort_projects_by_recent(projects);
    expect(projects.map((p) => p.name)).toEqual(original.map((p) => p.name));
  });
});

// ── sort_projects_by_activity ───────────────────────────────────────────

describe("sort_projects_by_activity", () => {
  it("sorts by session_count descending", () => {
    const projects = [
      make_project({ name: "few", session_count: 2 }),
      make_project({ name: "many", session_count: 20 }),
      make_project({ name: "some", session_count: 10 }),
    ];

    const sorted = sort_projects_by_activity(projects);
    expect(sorted.map((p) => p.name)).toEqual(["many", "some", "few"]);
  });

  it("breaks ties by last_active descending", () => {
    const projects = [
      make_project({ name: "old", session_count: 5, last_active: "2025-01-01T00:00:00Z" }),
      make_project({ name: "new", session_count: 5, last_active: "2025-06-01T00:00:00Z" }),
    ];

    const sorted = sort_projects_by_activity(projects);
    expect(sorted[0].name).toBe("new");
  });
});

// ── build_workspace_groups ──────────────────────────────────────────────

describe("build_workspace_groups", () => {
  it("groups projects by workspace label", () => {
    const projects = [
      make_project({ name: "proj-a", path: "/Users/me/dev/org/proj-a", session_count: 5 }),
      make_project({ name: "proj-b", path: "/Users/me/dev/org/proj-b", session_count: 10 }),
      make_project({ name: "other", path: "/Users/me/work/co/other", session_count: 3 }),
    ];

    const groups = build_workspace_groups(projects);

    // "dev / org" and "work / co" groups
    expect(groups).toHaveLength(2);
  });

  it("sorts groups by total session count descending", () => {
    const projects = [
      make_project({ name: "a", path: "/Users/me/dev/org/a", session_count: 1 }),
      make_project({ name: "b", path: "/Users/me/work/co/b", session_count: 100 }),
    ];

    const groups = build_workspace_groups(projects);
    expect(groups[0].label).toBe("work / co");
  });

  it("sorts projects within groups by activity", () => {
    const projects = [
      make_project({ name: "few", path: "/Users/me/dev/org/few", session_count: 2 }),
      make_project({ name: "many", path: "/Users/me/dev/org/many", session_count: 20 }),
    ];

    const groups = build_workspace_groups(projects);
    expect(groups[0].projects[0].name).toBe("many");
  });

  it("returns empty for empty input", () => {
    expect(build_workspace_groups([])).toEqual([]);
  });

  it("generates unique group IDs", () => {
    const projects = [
      make_project({ path: "/Users/me/dev/org/a" }),
      make_project({ path: "/Users/me/work/co/b" }),
    ];
    const groups = build_workspace_groups(projects);
    const ids = groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── is_filter_mode ──────────────────────────────────────────────────────

describe("is_filter_mode", () => {
  it("returns true for valid filter modes", () => {
    expect(is_filter_mode("all")).toBe(true);
    expect(is_filter_mode("recent")).toBe(true);
    expect(is_filter_mode("active")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(is_filter_mode("")).toBe(false);
    expect(is_filter_mode("invalid")).toBe(false);
    expect(is_filter_mode("ALL")).toBe(false);
  });
});
