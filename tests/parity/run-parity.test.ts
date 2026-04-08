/**
 * Parity comparison harness for the Tauri → Electron migration.
 *
 * Each test compares the Node backend output against golden files
 * produced by the Rust backend. All tests are skipped until the
 * corresponding backend module is ported.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { read_golden, fixtures_path } from "./helpers";
import {
  normalize_analytics,
  normalize_replay,
  normalize_qmd,
  normalize_qmd_indexes,
  normalize_qmd_logs,
  normalize_provider_limits,
} from "./normalize";

// ─── Backend readiness flags ─────────────────────────────────────────────────
// When a backend module is ported, change the corresponding flag to true.

// better-sqlite3 is a Node native addon that doesn't load under Bun's test runner.
// QMD SQLite tests must run under Node, or be skipped in Bun.
const is_bun = typeof globalThis.Bun !== "undefined";

const BACKEND_READY = {
  analytics: true,
  replay: true,
  qmd: !is_bun, // better-sqlite3 requires Node runtime
  qmd_logs: true,
  provider_limits: true,
} as const;

type Subsystem = keyof typeof BACKEND_READY;

function parity_test(
  subsystem: Subsystem,
  name: string,
  fn: () => Promise<void>,
) {
  if (BACKEND_READY[subsystem]) {
    test(name, fn);
  } else {
    test.skip(name, fn);
  }
}

// ─── Fixture paths ───────────────────────────────────────────────────────────

const qmd_cache_root = fixtures_path("qmd", "cache-root");

// ─── Analytics: Minimal ──────────────────────────────────────────────────────

describe("analytics — minimal fixture", () => {
  const sessions_root = fixtures_path("sessions", "minimal");

  beforeAll(async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { session_cache } = await import("../../backend/analytics");
    await session_cache.resync();
  });

  parity_test("analytics", "get_analytics_overview (no filter)", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_analytics_overview } = await import("../../backend/analytics");
    const { analytics_overview_schema } = await import("@contracts/analytics");

    const actual_raw = await get_analytics_overview(null, 0);
    analytics_overview_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/minimal-overview.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_all_sessions", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_all_sessions } = await import("../../backend/analytics");
    const { session_summary_schema } = await import("@contracts/sessions");
    const { z } = await import("zod");

    const actual_raw = await get_all_sessions(null, 0);
    z.array(session_summary_schema).parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/minimal-sessions.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_session_detail", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_session_detail } = await import("../../backend/analytics");
    const { session_summary_schema } = await import("@contracts/sessions");

    const actual_raw = await get_session_detail("aaaaaaaa-0001-0001-0001-000000000001");
    session_summary_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/minimal-session-detail.json"));
    expect(actual).toEqual(golden);
  });
});

// ─── Analytics: Multi-Project ────────────────────────────────────────────────

describe("analytics — multi-project fixture", () => {
  const sessions_root = fixtures_path("sessions", "multi-project");

  beforeAll(async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { session_cache } = await import("../../backend/analytics");
    await session_cache.resync();
  });

  parity_test("analytics", "get_analytics_overview — all projects, all time", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_analytics_overview } = await import("../../backend/analytics");
    const { analytics_overview_schema } = await import("@contracts/analytics");

    const actual_raw = await get_analytics_overview(null, 0);
    analytics_overview_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-overview-all.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_analytics_overview — filtered by project", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_analytics_overview } = await import("../../backend/analytics");
    const { analytics_overview_schema } = await import("@contracts/analytics");

    const actual_raw = await get_analytics_overview("/home/test/project-alpha", 0);
    analytics_overview_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-overview-filtered.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_analytics_overview — ranged", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_analytics_overview } = await import("../../backend/analytics");
    const { analytics_overview_schema } = await import("@contracts/analytics");

    const actual_raw = await get_analytics_overview(null, 36500);
    analytics_overview_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-overview-ranged.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_all_sessions — multi-project", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_all_sessions } = await import("../../backend/analytics");
    const { session_summary_schema } = await import("@contracts/sessions");
    const { z } = await import("zod");

    const actual_raw = await get_all_sessions(null, 0);
    z.array(session_summary_schema).parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-sessions.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_project_file_stats", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_project_file_stats } = await import("../../backend/analytics");
    const { project_file_stats_schema } = await import("@contracts/analytics");

    const actual_raw = await get_project_file_stats("/home/test/project-alpha", 0);
    project_file_stats_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-file-stats.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_time_breakdown", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_time_breakdown } = await import("../../backend/analytics");
    const { time_breakdown_schema } = await import("@contracts/analytics");

    const actual_raw = await get_time_breakdown(30, null);
    time_breakdown_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-time-breakdown.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_tool_details", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_tool_details } = await import("../../backend/analytics");
    const { tool_detail_response_schema } = await import("@contracts/analytics");

    const actual_raw = await get_tool_details("read", null, 0);
    tool_detail_response_schema.parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-tool-details.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("analytics", "get_file_sizes", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_file_sizes } = await import("../../backend/analytics");
    const { file_size_result_schema } = await import("@contracts/analytics");
    const { z } = await import("zod");

    const actual_raw = await get_file_sizes([
      "/home/test/project-alpha/src/utils.ts",
      "/home/test/project-alpha/src/auth.ts",
    ]);
    z.array(file_size_result_schema).parse(actual_raw);

    const actual = normalize_analytics(actual_raw);
    const golden = normalize_analytics(read_golden("analytics/multi-project-file-sizes.json"));
    expect(actual).toEqual(golden);
  });
});

// ─── Replay: Minimal ─────────────────────────────────────────────────────────

describe("replay — minimal fixture", () => {
  const sessions_root = fixtures_path("sessions", "minimal");

  beforeAll(async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { session_cache } = await import("../../backend/analytics");
    await session_cache.resync();
  });

  parity_test("replay", "get_session_entries — minimal", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_session_entries } = await import("../../backend/replay");
    const { session_entries_response_schema } = await import("@contracts/sessions");

    const actual_raw = await get_session_entries("aaaaaaaa-0001-0001-0001-000000000001");
    session_entries_response_schema.parse(actual_raw);

    const actual = normalize_replay(actual_raw);
    const golden = normalize_replay(read_golden("replay/minimal-entries.json"));
    expect(actual).toEqual(golden);
  });
});

// ─── Replay: Branching ───────────────────────────────────────────────────────

describe("replay — branching fixture", () => {
  const sessions_root = fixtures_path("sessions", "branching-replay");

  beforeAll(async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { session_cache } = await import("../../backend/analytics");
    await session_cache.resync();
  });

  parity_test("replay", "get_session_entries — branching", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_session_entries } = await import("../../backend/replay");
    const { session_entries_response_schema } = await import("@contracts/sessions");

    const actual_raw = await get_session_entries("aaaaaaaa-0003-0001-0001-000000000001");
    session_entries_response_schema.parse(actual_raw);

    const actual = normalize_replay(actual_raw);
    const golden = normalize_replay(read_golden("replay/branching-entries.json"));
    expect(actual).toEqual(golden);
  });
});

// ─── QMD ─────────────────────────────────────────────────────────────────────

describe("qmd", () => {
  parity_test("qmd", "qmd_list_indexes", async () => {
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

  parity_test("qmd", "qmd_get_status — default", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_status } = await import("../../backend/qmd");
    const { qmd_status_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_status("default");
    qmd_status_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/default-status.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  parity_test("qmd", "qmd_list_collections — default", async () => {
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

  parity_test("qmd", "qmd_get_collection_detail — default/docs", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_collection_detail } = await import("../../backend/qmd");
    const { qmd_collection_detail_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_collection_detail("default", "docs");
    qmd_collection_detail_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/default-collection-detail.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  parity_test("qmd", "qmd_get_status — work", async () => {
    process.env["ARIADNE_QMD_CACHE_ROOT"] = qmd_cache_root;
    const { qmd_get_status } = await import("../../backend/qmd");
    const { qmd_status_schema } = await import("@contracts/qmd");

    const actual_raw = await qmd_get_status("work");
    qmd_status_schema.parse(actual_raw);

    const actual = normalize_qmd(actual_raw, qmd_cache_root);
    const golden = normalize_qmd(read_golden("qmd/work-status.json"), qmd_cache_root);
    expect(actual).toEqual(golden);
  });

  parity_test("qmd", "qmd_check_availability", async () => {
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

// ─── QMD Logs ────────────────────────────────────────────────────────────────

describe("qmd-logs", () => {
  const sessions_root = fixtures_path("sessions", "qmd-cli");

  parity_test("qmd_logs", "get_qmd_logs — all", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_qmd_logs } = await import("../../backend/qmd-logs");
    const { qmd_log_entry_schema } = await import("@contracts/qmd-logs");
    const { z } = await import("zod");

    const actual_raw = await get_qmd_logs(null);
    z.array(qmd_log_entry_schema).parse(actual_raw);

    const actual = normalize_qmd_logs(actual_raw);
    const golden = normalize_qmd_logs(read_golden("qmd-logs/all-logs.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("qmd_logs", "get_qmd_log_stats — all", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_qmd_log_stats } = await import("../../backend/qmd-logs");
    const { qmd_log_stats_schema } = await import("@contracts/qmd-logs");

    const actual_raw = await get_qmd_log_stats(null);
    qmd_log_stats_schema.parse(actual_raw);

    const actual = normalize_qmd_logs(actual_raw);
    const golden = normalize_qmd_logs(read_golden("qmd-logs/all-log-stats.json"));
    expect(actual).toEqual(golden);
  });

  parity_test("qmd_logs", "get_qmd_logs — filtered by project", async () => {
    process.env["ARIADNE_PI_SESSIONS_ROOT"] = sessions_root;
    const { get_qmd_logs } = await import("../../backend/qmd-logs");
    const { qmd_log_entry_schema } = await import("@contracts/qmd-logs");
    const { z } = await import("zod");

    const actual_raw = await get_qmd_logs("/home/test/project-alpha");
    z.array(qmd_log_entry_schema).parse(actual_raw);

    const actual = normalize_qmd_logs(actual_raw);
    const golden = normalize_qmd_logs(read_golden("qmd-logs/filtered-logs.json"));
    expect(actual).toEqual(golden);
  });
});

// ─── Provider Limits ─────────────────────────────────────────────────────────

describe("provider-limits", () => {
  parity_test("provider_limits", "fallback_session_logs", async () => {
    process.env["ARIADNE_CODEX_HOME"] = fixtures_path("provider-limits", "codex-session-log");
    const { fallback_session_logs } = await import("../../backend/provider-limits");
    const { provider_limit_snapshot_schema } = await import("@contracts/provider-limits");

    const actual_raw = await fallback_session_logs();
    provider_limit_snapshot_schema.parse(actual_raw);

    const actual = normalize_provider_limits(actual_raw);
    const golden = normalize_provider_limits(read_golden("provider-limits/session-log-fallback.json"));
    expect(actual).toEqual(golden);
  });
});
