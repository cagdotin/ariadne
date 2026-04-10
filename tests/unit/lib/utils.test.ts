import { describe, it, expect } from "vitest";
import { cn, error_message } from "@/lib/utils";

// ── cn (class name merging) ─────────────────────────────────────────────

describe("cn", () => {
  it("merges multiple class strings", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes via clsx syntax", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves tailwind conflicts (last wins)", () => {
    const result = cn("px-2", "px-4");
    expect(result).toBe("px-4");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty call", () => {
    expect(cn()).toBe("");
  });

  it("merges array inputs", () => {
    expect(cn(["px-2", "py-1"])).toBe("px-2 py-1");
  });

  it("resolves complex tailwind conflicts", () => {
    // bg-red should be replaced by bg-blue
    const result = cn("bg-red-500 text-white", "bg-blue-500");
    expect(result).toContain("bg-blue-500");
    expect(result).not.toContain("bg-red-500");
    expect(result).toContain("text-white");
  });
});

// ── error_message ───────────────────────────────────────────────────────

describe("error_message", () => {
  it("extracts message from Error instance", () => {
    expect(error_message(new Error("something broke"))).toBe("something broke");
  });

  it("returns string errors directly", () => {
    expect(error_message("connection refused")).toBe("connection refused");
  });

  it("returns default fallback for non-string, non-Error values", () => {
    expect(error_message(42)).toBe("Unknown error");
    expect(error_message(null)).toBe("Unknown error");
    expect(error_message(undefined)).toBe("Unknown error");
    expect(error_message({})).toBe("Unknown error");
    expect(error_message([])).toBe("Unknown error");
    expect(error_message(true)).toBe("Unknown error");
  });

  it("returns custom fallback when provided", () => {
    expect(error_message(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("returns fallback for empty string", () => {
    expect(error_message("", "fallback")).toBe("fallback");
  });

  it("handles Error subclasses", () => {
    expect(error_message(new TypeError("type mismatch"))).toBe("type mismatch");
    expect(error_message(new RangeError("out of bounds"))).toBe("out of bounds");
  });

  it("handles Error with empty message", () => {
    // Empty-message Error still returns the (empty) .message
    expect(error_message(new Error(""))).toBe("");
  });
});
