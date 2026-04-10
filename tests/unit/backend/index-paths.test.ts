import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolve_cache_root,
  resolve_index_db_path,
  validate_index_name,
} from "../../../backend/qmd/index-paths";

describe("validate_index_name", () => {
  it("accepts valid names", () => {
    expect(validate_index_name("my-index").valid).toBe(true);
    expect(validate_index_name("a").valid).toBe(true);
    expect(validate_index_name("docs").valid).toBe(true);
    expect(validate_index_name("project-123").valid).toBe(true);
    expect(validate_index_name("a-b-c").valid).toBe(true);
  });

  it("rejects names starting with non-letter", () => {
    expect(validate_index_name("1abc").valid).toBe(false);
    expect(validate_index_name("-abc").valid).toBe(false);
    expect(validate_index_name("123").valid).toBe(false);
  });

  it("rejects names with uppercase letters", () => {
    expect(validate_index_name("MyIndex").valid).toBe(false);
    expect(validate_index_name("INDEX").valid).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(validate_index_name("my_index").valid).toBe(false);
    expect(validate_index_name("my.index").valid).toBe(false);
    expect(validate_index_name("my index").valid).toBe(false);
    expect(validate_index_name("my/index").valid).toBe(false);
  });

  it("rejects names longer than 32 characters", () => {
    const long_name = "a" + "b".repeat(32);
    expect(long_name.length).toBe(33);
    expect(validate_index_name(long_name).valid).toBe(false);
    expect(validate_index_name(long_name).error).toContain("32 characters");
  });

  it("accepts names exactly 32 characters", () => {
    const exact = "a" + "b".repeat(31);
    expect(exact.length).toBe(32);
    expect(validate_index_name(exact).valid).toBe(true);
  });

  it("rejects reserved names", () => {
    expect(validate_index_name("index").valid).toBe(false);
    expect(validate_index_name("index").error).toContain("reserved");
    expect(validate_index_name("models").valid).toBe(false);
    expect(validate_index_name("models").error).toContain("reserved");
  });

  it("rejects empty string", () => {
    expect(validate_index_name("").valid).toBe(false);
  });

  it("provides error messages for invalid names", () => {
    const result = validate_index_name("1bad");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it("does not include error for valid names", () => {
    const result = validate_index_name("valid-name");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe("resolve_cache_root", () => {
  const original_env = { ...process.env };

  afterEach(() => {
    process.env = { ...original_env };
  });

  it("uses ARIADNE_QMD_CACHE_ROOT when set", () => {
    process.env.ARIADNE_QMD_CACHE_ROOT = "/custom/cache";
    expect(resolve_cache_root()).toBe("/custom/cache");
  });

  it("uses XDG_CACHE_HOME when set", () => {
    delete process.env.ARIADNE_QMD_CACHE_ROOT;
    process.env.XDG_CACHE_HOME = "/xdg/cache";
    expect(resolve_cache_root()).toBe("/xdg/cache/qmd");
  });

  it("falls back to ~/.cache/qmd", () => {
    delete process.env.ARIADNE_QMD_CACHE_ROOT;
    delete process.env.XDG_CACHE_HOME;
    const result = resolve_cache_root();
    expect(result).toContain(".cache/qmd");
  });
});

describe("resolve_index_db_path", () => {
  const original_env = { ...process.env };

  afterEach(() => {
    process.env = { ...original_env };
  });

  it("maps 'default' index to 'index.sqlite'", () => {
    process.env.ARIADNE_QMD_CACHE_ROOT = "/cache";
    expect(resolve_index_db_path("default")).toBe("/cache/index.sqlite");
  });

  it("uses index name as file stem for non-default", () => {
    process.env.ARIADNE_QMD_CACHE_ROOT = "/cache";
    expect(resolve_index_db_path("my-index")).toBe("/cache/my-index.sqlite");
  });

  it("includes full cache root path", () => {
    process.env.ARIADNE_QMD_CACHE_ROOT = "/deep/nested/cache";
    expect(resolve_index_db_path("docs")).toBe("/deep/nested/cache/docs.sqlite");
  });
});
