import { describe, it, expect } from "vitest";
import {
  from_backend_insights,
  enrich_with_sizes,
  merge_file_insights,
  get_lens_value,
  dominant_op,
  intensity_bucket,
  intensity_fill,
  format_pct,
} from "@/lib/file-analytics";

// ── from_backend_insights ───────────────────────────────────────────────

describe("from_backend_insights", () => {
  it("maps backend records to frontend FileInsight shape", () => {
    const result = from_backend_insights([
      {
        path: "/src/app.ts",
        read_count: 10,
        edit_count: 3,
        write_count: 1,
        total_count: 14,
        distinct_session_count: 2,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "/src/app.ts",
      read_count: 10,
      edit_count: 3,
      write_count: 1,
      total_count: 14,
      distinct_session_count: 2,
    });
  });

  it("handles empty array", () => {
    expect(from_backend_insights([])).toEqual([]);
  });
});

// ── enrich_with_sizes ───────────────────────────────────────────────────

describe("enrich_with_sizes", () => {
  const base_insights = [
    { path: "/a.ts", read_count: 1, edit_count: 0, write_count: 0, total_count: 1 },
    { path: "/b.ts", read_count: 0, edit_count: 1, write_count: 0, total_count: 1 },
  ];

  it("merges file sizes into insights", () => {
    const sizes = [
      { path: "/a.ts", size_bytes: 1024 },
      { path: "/b.ts", size_bytes: null },
    ];
    const result = enrich_with_sizes(base_insights, sizes);

    expect(result[0].file_size_bytes).toBe(1024);
    expect(result[1].file_size_bytes).toBeNull();
  });

  it("leaves file_size_bytes undefined when path not in sizes", () => {
    const result = enrich_with_sizes(base_insights, []);
    expect(result[0].file_size_bytes).toBeUndefined();
  });

  it("does not mutate original array", () => {
    enrich_with_sizes(base_insights, [{ path: "/a.ts", size_bytes: 999 }]);
    expect(base_insights[0]).not.toHaveProperty("file_size_bytes");
  });
});

// ── merge_file_insights ─────────────────────────────────────────────────

describe("merge_file_insights", () => {
  it("merges separate read/edit/write arrays into unified records", () => {
    const reads = [{ name: "/a.ts", count: 5 }];
    const edits = [{ name: "/a.ts", count: 2 }, { name: "/b.ts", count: 1 }];
    const writes = [{ name: "/b.ts", count: 3 }];

    const result = merge_file_insights(reads, edits, writes);

    const a = result.find((r) => r.path === "/a.ts")!;
    expect(a.read_count).toBe(5);
    expect(a.edit_count).toBe(2);
    expect(a.write_count).toBe(0);
    expect(a.total_count).toBe(7);

    const b = result.find((r) => r.path === "/b.ts")!;
    expect(b.read_count).toBe(0);
    expect(b.edit_count).toBe(1);
    expect(b.write_count).toBe(3);
    expect(b.total_count).toBe(4);
  });

  it("returns empty array for empty inputs", () => {
    expect(merge_file_insights([], [], [])).toEqual([]);
  });
});

// ── get_lens_value ──────────────────────────────────────────────────────

describe("get_lens_value", () => {
  const insight = {
    path: "/x.ts",
    read_count: 10,
    edit_count: 5,
    write_count: 2,
    total_count: 17,
  };

  it("returns total for 'all' lens", () => {
    expect(get_lens_value(insight, "all")).toBe(17);
  });

  it("returns individual counts for specific lenses", () => {
    expect(get_lens_value(insight, "read")).toBe(10);
    expect(get_lens_value(insight, "edit")).toBe(5);
    expect(get_lens_value(insight, "write")).toBe(2);
  });
});

// ── dominant_op ─────────────────────────────────────────────────────────

describe("dominant_op", () => {
  it("returns read when reads are highest", () => {
    expect(dominant_op(10, 3, 2)).toBe("read");
  });

  it("returns edit when edits are highest", () => {
    expect(dominant_op(1, 10, 2)).toBe("edit");
  });

  it("returns write when writes are highest", () => {
    expect(dominant_op(1, 2, 10)).toBe("write");
  });

  it("prefers read on tie between all", () => {
    expect(dominant_op(5, 5, 5)).toBe("read");
  });

  it("prefers read on tie with read and edit", () => {
    expect(dominant_op(5, 5, 0)).toBe("read");
  });

  it("prefers edit on tie with edit and write", () => {
    expect(dominant_op(0, 5, 5)).toBe("edit");
  });
});

// ── intensity_bucket ────────────────────────────────────────────────────

describe("intensity_bucket", () => {
  it("returns 0 for zero value or max", () => {
    expect(intensity_bucket(0, 100)).toBe(0);
    expect(intensity_bucket(5, 0)).toBe(0);
    expect(intensity_bucket(0, 0)).toBe(0);
  });

  it("returns 1.0 for max value", () => {
    expect(intensity_bucket(100, 100)).toBe(1.0);
  });

  it("returns value in (0, 1] for non-zero values", () => {
    const result = intensity_bucket(50, 100);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("returns one of the 5 bucket values", () => {
    const valid_buckets = [0.2, 0.4, 0.65, 0.85, 1.0];
    for (let v = 1; v <= 100; v++) {
      expect(valid_buckets).toContain(intensity_bucket(v, 100));
    }
  });
});

// ── intensity_fill ──────────────────────────────────────────────────────

describe("intensity_fill", () => {
  it("returns muted for zero intensity", () => {
    expect(intensity_fill(210, 0)).toBe("hsl(var(--muted))");
  });

  it("returns HSL string for non-zero intensity", () => {
    const result = intensity_fill(210, 0.5);
    expect(result).toMatch(/^hsl\(210,/);
  });
});

// ── format_pct ──────────────────────────────────────────────────────────

describe("format_pct", () => {
  it("returns 0% for zero total", () => {
    expect(format_pct(5, 0)).toBe("0%");
  });

  it("shows <1% for small percentages", () => {
    expect(format_pct(1, 200)).toBe("<1%");
  });

  it("rounds to nearest integer", () => {
    expect(format_pct(1, 3)).toBe("33%");
    expect(format_pct(1, 2)).toBe("50%");
    expect(format_pct(3, 3)).toBe("100%");
  });
});
