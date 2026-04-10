/**
 * QMD parity tests — run under Node via vitest.
 *
 * These tests are separated from the main Bun-based parity suite because
 * better-sqlite3 (a Node native addon) does not load in Bun's test runner.
 * Running under Node/vitest lets the 6 QMD golden comparisons stay active.
 *
 * Normalization rules are identical to the Bun suite (shared from ./normalize).
 */

import { describe, test, expect } from "vitest";
import { read_golden, fixtures_path } from "./helpers";
import { normalize_qmd, normalize_qmd_indexes } from "./normalize";

// ─── Fixture paths ───────────────────────────────────────────────────────────

const qmd_cache_root = fixtures_path("qmd", "cache-root");

// ─── QMD ─────────────────────────────────────────────────────────────────────

describe("qmd", () => {
  test("qmd_list_indexes", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_list_indexes } = await import("../../backend/qmd");
    const { qmd_index_schema } = await import("@contracts/qmd");
    const { z } = await import("zod");

    const actual_raw = await qmd_list_indexes();
    z.array(qmd_index_schema).parse(actual_raw);

    const actual = normalize_qmd_indexes(actual_raw, qmd_cache_root);
    const golden = normalize_qmd_indexes(read_golden("qmd/list-indexes.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  test("qmd_get_status — default", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_status } = await import("../../backend/qmd");
    const { qmd_status_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_status("default");
    qmd_status_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/default-status.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  test("qmd_list_collections — default", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_list_collections } = await import("../../backend/qmd");
    const { qmd_collection_schema } = await import("@contracts/qmd");
    const { z } = await import("zod");

    const actual_raw = await qmd_list_collections("default");
    z.array(qmd_collection_schema).parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/default-collections.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  test("qmd_get_collection_detail — default/docs", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_collection_detail } = await import("../../backend/qmd");
    const { qmd_collection_detail_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_collection_detail("default", "docs");
    qmd_collection_detail_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/default-collection-detail.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  test("qmd_get_status — work", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_status } = await import("../../backend/qmd");
    const { qmd_status_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_status("work");
    qmd_status_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/work-status.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  test("qmd_check_availability", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_check_availability } = await import("../../backend/qmd");
    const { qmd_availability_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_check_availability();
    qmd_availability_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/availability.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });
});
