import { describe, it, expect } from "vitest";
import {
  format_cost,
  format_tokens,
  format_duration,
  format_file_size,
  format_number,
} from "@/lib/format";

// ── format_cost ─────────────────────────────────────────────────────────

describe("format_cost", () => {
  it("shows 4 decimal places for values under $0.01", () => {
    expect(format_cost(0.0012)).toBe("$0.0012");
    expect(format_cost(0.0001)).toBe("$0.0001");
  });

  it("shows 2 decimal places for values under $1", () => {
    expect(format_cost(0.50)).toBe("$0.50");
    expect(format_cost(0.99)).toBe("$0.99");
  });

  it("shows 2 decimal places for values $1 and above", () => {
    expect(format_cost(1)).toBe("$1.00");
    expect(format_cost(123.456)).toBe("$123.46");
  });

  it("handles zero", () => {
    expect(format_cost(0)).toBe("$0.0000");
  });
});

// ── format_tokens ───────────────────────────────────────────────────────

describe("format_tokens", () => {
  it("returns raw number below 1K", () => {
    expect(format_tokens(0)).toBe("0");
    expect(format_tokens(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(format_tokens(1_000)).toBe("1.0K");
    expect(format_tokens(1_500)).toBe("1.5K");
    expect(format_tokens(999_999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", () => {
    expect(format_tokens(1_000_000)).toBe("1.0M");
    expect(format_tokens(2_500_000)).toBe("2.5M");
  });

  it("formats billions with B suffix", () => {
    expect(format_tokens(1_000_000_000)).toBe("1.0B");
    expect(format_tokens(3_700_000_000)).toBe("3.7B");
  });
});

// ── format_duration ─────────────────────────────────────────────────────

describe("format_duration", () => {
  it("returns dash for null or zero", () => {
    expect(format_duration(null)).toBe("—");
    expect(format_duration(0)).toBe("—");
    expect(format_duration(-5)).toBe("—");
  });

  it("formats seconds", () => {
    expect(format_duration(30)).toBe("30s");
    expect(format_duration(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(format_duration(60)).toBe("1m");
    expect(format_duration(150)).toBe("2m");
  });

  it("formats hours and minutes", () => {
    expect(format_duration(3600)).toBe("1h 0m");
    expect(format_duration(3660)).toBe("1h 1m");
    expect(format_duration(7200)).toBe("2h 0m");
  });
});

// ── format_file_size ────────────────────────────────────────────────────

describe("format_file_size", () => {
  it("formats bytes", () => {
    expect(format_file_size(0)).toBe("0 B");
    expect(format_file_size(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(format_file_size(1_024)).toBe("1 KB");
    expect(format_file_size(10_240)).toBe("10 KB");
  });

  it("formats megabytes", () => {
    expect(format_file_size(1_048_576)).toBe("1.0 MB");
    expect(format_file_size(5_242_880)).toBe("5.0 MB");
  });
});

// ── format_number ───────────────────────────────────────────────────────

describe("format_number", () => {
  it("formats with locale separators", () => {
    expect(format_number(1_234)).toBe("1,234");
    expect(format_number(1_000_000)).toBe("1,000,000");
  });

  it("handles small numbers without separators", () => {
    expect(format_number(0)).toBe("0");
    expect(format_number(999)).toBe("999");
  });
});
