import { describe, it, expect } from "vitest";
import { shorten_path, get_language_from_path } from "@/components/session-viewer/utils/path";

// ── shorten_path ────────────────────────────────────────────────────────

describe("shorten_path", () => {
  it("replaces /Users/<name> prefix with ~", () => {
    expect(shorten_path("/Users/john/projects/app/src/file.ts"))
      .toBe("~/projects/app/src/file.ts");
  });

  it("replaces /home/<name> prefix with ~", () => {
    expect(shorten_path("/home/john/projects/app/src/file.ts"))
      .toBe("~/projects/app/src/file.ts");
  });

  it("returns path unchanged when no home prefix", () => {
    expect(shorten_path("/opt/app/file.ts")).toBe("/opt/app/file.ts");
  });

  it("returns empty string for non-string input", () => {
    expect(shorten_path(null)).toBe("");
    expect(shorten_path(undefined)).toBe("");
    expect(shorten_path(42)).toBe("");
    expect(shorten_path({})).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(shorten_path("")).toBe("");
  });

  it("handles /Users/ with trailing slash (empty username segment counts)", () => {
    // split("/") = ["", "Users", ""] — length is 3, so it shortens
    // slices after "/Users/" (7 chars) leaving empty string → "~"
    expect(shorten_path("/Users/")).toBe("~");
  });

  it("handles /Users/<name> with no further path", () => {
    // parts = ["", "Users", "john"] — length is 3, so it shortens
    expect(shorten_path("/Users/john")).toBe("~");
  });

  it("handles path with spaces", () => {
    expect(shorten_path("/Users/john/My Documents/file.ts"))
      .toBe("~/My Documents/file.ts");
  });

  it("handles relative paths unchanged", () => {
    expect(shorten_path("src/file.ts")).toBe("src/file.ts");
  });
});

// ── get_language_from_path ──────────────────────────────────────────────

describe("get_language_from_path", () => {
  it("maps common extensions to languages", () => {
    expect(get_language_from_path("file.ts")).toBe("typescript");
    expect(get_language_from_path("file.tsx")).toBe("typescript");
    expect(get_language_from_path("file.js")).toBe("javascript");
    expect(get_language_from_path("file.jsx")).toBe("javascript");
    expect(get_language_from_path("file.py")).toBe("python");
    expect(get_language_from_path("file.rs")).toBe("rust");
    expect(get_language_from_path("file.go")).toBe("go");
    expect(get_language_from_path("file.rb")).toBe("ruby");
    expect(get_language_from_path("file.java")).toBe("java");
    expect(get_language_from_path("file.sh")).toBe("bash");
    expect(get_language_from_path("file.bash")).toBe("bash");
    expect(get_language_from_path("file.zsh")).toBe("bash");
  });

  it("maps style and markup extensions", () => {
    expect(get_language_from_path("file.css")).toBe("css");
    expect(get_language_from_path("file.scss")).toBe("scss");
    expect(get_language_from_path("file.html")).toBe("html");
    expect(get_language_from_path("file.xml")).toBe("xml");
    expect(get_language_from_path("file.md")).toBe("markdown");
  });

  it("maps config extensions", () => {
    expect(get_language_from_path("file.json")).toBe("json");
    expect(get_language_from_path("file.yaml")).toBe("yaml");
    expect(get_language_from_path("file.yml")).toBe("yaml");
    expect(get_language_from_path("file.toml")).toBe("toml");
  });

  it("maps C-family extensions", () => {
    expect(get_language_from_path("file.c")).toBe("c");
    expect(get_language_from_path("file.h")).toBe("c");
    expect(get_language_from_path("file.cpp")).toBe("cpp");
    expect(get_language_from_path("file.hpp")).toBe("cpp");
    expect(get_language_from_path("file.cs")).toBe("csharp");
  });

  it("is case-insensitive on extension", () => {
    expect(get_language_from_path("FILE.TS")).toBe("typescript");
    expect(get_language_from_path("file.PY")).toBe("python");
  });

  it("returns undefined for unknown extensions", () => {
    expect(get_language_from_path("file.xyz")).toBeUndefined();
    expect(get_language_from_path("file.unknown")).toBeUndefined();
  });

  it("handles files with multiple dots", () => {
    expect(get_language_from_path("my.component.test.tsx")).toBe("typescript");
    expect(get_language_from_path("vite.config.ts")).toBe("typescript");
  });

  it("returns undefined for files without extensions", () => {
    expect(get_language_from_path("Makefile")).toBeUndefined();
  });

  it("handles deep paths", () => {
    expect(get_language_from_path("/src/components/ui/button.tsx")).toBe("typescript");
  });
});
