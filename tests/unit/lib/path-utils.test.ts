import { describe, it, expect } from "vitest";
import { strip_project_prefix } from "@/lib/path-utils";

describe("strip_project_prefix", () => {
  // ── Direct prefix stripping ─────────────────────────────────────────

  it("strips an exact project path prefix", () => {
    expect(strip_project_prefix("/Users/me/project/src/app.ts", "/Users/me/project"))
      .toBe("src/app.ts");
  });

  it("strips project path with trailing slash", () => {
    expect(strip_project_prefix("/Users/me/project/src/app.ts", "/Users/me/project/"))
      .toBe("src/app.ts");
  });

  it("strips leading slash from result when no project path matches", () => {
    expect(strip_project_prefix("/src/app.ts"))
      .toBe("src/app.ts");
  });

  // ── Fallback: project-name marker stripping ─────────────────────────

  it("uses project directory name as fallback marker", () => {
    // raw path contains the project name deeper in a redundant absolute path
    expect(strip_project_prefix(
      "/some/other/prefix/my-project/src/index.ts",
      "/Users/me/my-project",
    )).toBe("src/index.ts");
  });

  it("uses lastIndexOf for the marker so it picks the deepest occurrence", () => {
    // The project name appears twice in the path
    expect(strip_project_prefix(
      "/a/ariadne/b/ariadne/src/main.ts",
      "/Users/me/ariadne",
    )).toBe("src/main.ts");
  });

  // ── No project path provided ────────────────────────────────────────

  it("returns raw path unchanged when no project path and no leading slash", () => {
    expect(strip_project_prefix("src/app.ts")).toBe("src/app.ts");
  });

  it("strips leading slash when no project path provided", () => {
    expect(strip_project_prefix("/src/app.ts")).toBe("src/app.ts");
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it("strips leading slash when raw path equals project path (no file part)", () => {
    // The prefix doesn't match (no trailing content after base),
    // but the leading slash is stripped, then the project-name marker
    // "project/" is not found, so we get the slash-stripped version
    expect(strip_project_prefix("/Users/me/project", "/Users/me/project"))
      .toBe("Users/me/project");
  });

  it("handles project path that is just a slash", () => {
    expect(strip_project_prefix("/src/app.ts", "/"))
      .toBe("src/app.ts");
  });

  it("handles raw path with no slashes", () => {
    expect(strip_project_prefix("file.ts", "/some/project"))
      .toBe("file.ts");
  });

  it("does not strip when project path is unrelated", () => {
    expect(strip_project_prefix("/other/path/file.ts", "/Users/me/project"))
      .toBe("other/path/file.ts");
  });
});
