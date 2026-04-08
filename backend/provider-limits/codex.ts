// ---- Codex provider adapter (faithful port of the legacy provider-limits Codex adapter) ----

import { spawn, execSync } from "node:child_process";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ProviderLimitSnapshot,
  ProviderLimitWindow,
  ProviderCredits,
} from "./models.js";

// ---------------------------------------------------------------------------
// Codex app-server RPC response shapes (camelCase from the protocol)
// ---------------------------------------------------------------------------

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

interface CreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string | null;
}

interface RateLimitSnapshot {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  credits?: CreditsSnapshot | null;
  planType?: string | null;
}

interface RateLimitsResult {
  rateLimits: RateLimitSnapshot;
}

interface AccountInfo {
  type: string;
  email?: string | null;
  planType?: string | null;
}

interface AccountResult {
  account: AccountInfo;
}

// ---------------------------------------------------------------------------
// Session log fallback shapes (snake_case from JSONL files)
// ---------------------------------------------------------------------------

interface SessionLogWindow {
  used_percent: number;
  window_minutes?: number | null;
  resets_at?: number | null;
}

interface SessionLogCredits {
  has_credits?: boolean | null;
  unlimited?: boolean | null;
  balance?: string | null;
}

interface SessionLogRateLimits {
  primary?: SessionLogWindow | null;
  secondary?: SessionLogWindow | null;
  credits?: SessionLogCredits | null;
  plan_type?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_AFTER_SECONDS = 900;
const PROBE_TIMEOUT_SECONDS = 15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetch_codex_limits(): Promise<ProviderLimitSnapshot> {
  try {
    return await probe_app_server();
  } catch (rpc_err) {
    console.error(`[provider_limits::codex] app-server probe failed: ${rpc_err}`);
    try {
      return await fallback_session_logs();
    } catch (log_err) {
      console.error(`[provider_limits::codex] session log fallback failed: ${log_err}`);
      return make_error_snapshot(`app-server: ${rpc_err}; logs: ${log_err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// App-server probe
// ---------------------------------------------------------------------------

async function probe_app_server(): Promise<ProviderLimitSnapshot> {
  const codex_bin = find_codex_binary();
  if (codex_bin === null) {
    throw new Error("codex binary not found -- is Codex CLI installed?");
  }

  const child = spawn(codex_bin, ["app-server"], {
    stdio: ["pipe", "pipe", "ignore"],
  });

  return new Promise<ProviderLimitSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("codex app-server probe timed out"));
    }, PROBE_TIMEOUT_SECONDS * 1000);

    run_rpc_exchange(child)
      .then((snapshot) => {
        clearTimeout(timeout);
        child.kill();
        resolve(snapshot);
      })
      .catch((err) => {
        clearTimeout(timeout);
        child.kill();
        reject(err);
      });
  });
}

async function run_rpc_exchange(
  child: ReturnType<typeof spawn>,
): Promise<ProviderLimitSnapshot> {
  const stdin = child.stdin!;
  const rl = createInterface({ input: child.stdout! });

  const pending_responses = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  rl.on("line", (raw_line: string) => {
    const trimmed = raw_line.trim();
    if (trimmed === "") return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return; // skip malformed lines
    }

    const id = typeof parsed.id === "number" ? parsed.id : null;
    if (id === null) return; // notification, skip

    const entry = pending_responses.get(id);
    if (!entry) return;
    pending_responses.delete(id);

    if (parsed.error) {
      entry.reject(new Error(`codex RPC error: ${JSON.stringify(parsed.error)}`));
      return;
    }
    if (parsed.result !== undefined) {
      entry.resolve(parsed.result);
      return;
    }
    entry.reject(new Error("codex RPC response missing 'result' field"));
  });

  function send_and_wait(msg: Record<string, unknown>, id: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      pending_responses.set(id, { resolve, reject });
      stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  // 1. Initialize
  await send_and_wait(
    {
      method: "initialize",
      id: 1,
      params: {
        clientInfo: { name: "ariadne", title: null, version: "0.1.0" },
      },
    },
    1,
  );

  // 2. account/rateLimits/read
  const limits_resp = await send_and_wait(
    { method: "account/rateLimits/read", id: 2 },
    2,
  );

  // 3. account/read
  const account_resp = await send_and_wait(
    { method: "account/read", id: 3, params: { refreshToken: false } },
    3,
  );

  rl.close();

  // Parse rate limits
  const limits_result = limits_resp as RateLimitsResult;
  if (!limits_result?.rateLimits) {
    throw new Error("Failed to parse rateLimits response: missing rateLimits field");
  }

  // Parse account (optional -- don't fail if it doesn't parse)
  let account_result: AccountResult | null = null;
  try {
    const ar = account_resp as AccountResult;
    if (ar?.account) {
      account_result = ar;
    }
  } catch {
    // ignore
  }

  const now = new Date();
  const snap = limits_result.rateLimits;

  const windows: ProviderLimitWindow[] = [];
  if (snap.primary) {
    windows.push(normalize_window("primary", "Primary (5h)", snap.primary));
  }
  if (snap.secondary) {
    windows.push(normalize_window("secondary", "Secondary (7d)", snap.secondary));
  }

  const credits: ProviderCredits | null = snap.credits
    ? {
        has_credits: snap.credits.hasCredits,
        unlimited: snap.credits.unlimited,
        balance: snap.credits.balance ?? null,
      }
    : null;

  const account_label = account_result?.account?.email ?? null;
  const plan_type =
    snap.planType ?? account_result?.account?.planType ?? null;

  return {
    provider_id: "codex",
    provider_label: "Codex",
    account_label,
    plan_type,
    source: "codex-app-server",
    source_confidence: "high",
    status: "fresh",
    fetched_at: now.toISOString(),
    stale_after_seconds: STALE_AFTER_SECONDS,
    windows,
    credits,
    error_message: null,
  };
}

function normalize_window(
  id: string,
  label: string,
  w: RateLimitWindow,
): ProviderLimitWindow {
  let resets_at_iso: string | null = null;
  if (w.resetsAt != null) {
    try {
      resets_at_iso = epoch_to_rfc3339(w.resetsAt);
    } catch {
      resets_at_iso = null;
    }
  }

  return {
    id,
    label,
    used_percent: w.usedPercent,
    remaining_percent: 100.0 - w.usedPercent,
    window_minutes: w.windowDurationMins ?? null,
    resets_at: resets_at_iso,
  };
}

// ---------------------------------------------------------------------------
// Session log fallback
// ---------------------------------------------------------------------------

export async function fallback_session_logs(): Promise<ProviderLimitSnapshot> {
  const override_home = process.env.ARIADNE_CODEX_HOME;
  const codex_home = override_home ?? join(homedir(), ".codex");
  const sessions_dir = join(codex_home, "sessions");

  if (!existsSync(sessions_dir)) {
    throw new Error("~/.codex/sessions does not exist");
  }

  // Collect all .jsonl files recursively
  const jsonl_files: string[] = [];
  collect_jsonl_files(sessions_dir, jsonl_files);

  if (jsonl_files.length === 0) {
    throw new Error("No session log files found");
  }

  // Sort by modified time descending (newest first)
  jsonl_files.sort((a, b) => {
    const ma = safe_mtime(a);
    const mb = safe_mtime(b);
    return mb - ma;
  });

  // Scan up to 20 most recent files
  for (const file_path of jsonl_files.slice(0, 20)) {
    const snapshot = await try_extract_rate_limits(file_path);
    if (snapshot !== null) {
      return snapshot;
    }
  }

  throw new Error("No rate_limits found in recent session logs");
}

function safe_mtime(file_path: string): number {
  try {
    return statSync(file_path).mtimeMs;
  } catch {
    return 0;
  }
}

function collect_jsonl_files(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    const full_path = join(dir, name);
    try {
      const stat = statSync(full_path);
      if (stat.isDirectory()) {
        collect_jsonl_files(full_path, out);
      } else if (name.endsWith(".jsonl")) {
        out.push(full_path);
      }
    } catch {
      // skip inaccessible entries
    }
  }
}

async function try_extract_rate_limits(
  file_path: string,
): Promise<ProviderLimitSnapshot | null> {
  return new Promise((resolve, reject) => {
    let last_rate_limits: SessionLogRateLimits | null = null;
    let last_timestamp: string | null = null;

    const stream = createReadStream(file_path, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (trimmed === "" || !trimmed.includes("rate_limits")) {
        return;
      }

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        return;
      }

      const payload = entry.payload as Record<string, unknown> | undefined;
      if (!payload) return;

      const rl_val = payload.rate_limits;
      if (!rl_val || typeof rl_val !== "object") return;

      // Treat as SessionLogRateLimits
      const rl_parsed = rl_val as SessionLogRateLimits;
      last_rate_limits = rl_parsed;
      last_timestamp =
        typeof entry.timestamp === "string" ? entry.timestamp : null;
    });

    rl.on("close", () => {
      if (last_rate_limits === null) {
        resolve(null);
        return;
      }

      const rl = last_rate_limits;
      const now = new Date();

      // Determine age and status
      let status: "fresh" | "stale" = "stale";
      let fetched_at: string = now.toISOString();

      if (last_timestamp !== null) {
        const dt = new Date(last_timestamp);
        if (!isNaN(dt.getTime())) {
          const age_secs = Math.abs(
            Math.floor((now.getTime() - dt.getTime()) / 1000),
          );
          status = age_secs <= STALE_AFTER_SECONDS ? "fresh" : "stale";
          fetched_at = last_timestamp;
        }
      }

      const windows: ProviderLimitWindow[] = [];
      if (rl.primary) {
        windows.push(
          normalize_log_window("primary", "Primary (5h)", rl.primary),
        );
      }
      if (rl.secondary) {
        windows.push(
          normalize_log_window("secondary", "Secondary (7d)", rl.secondary),
        );
      }

      const credits: ProviderCredits | null = rl.credits
        ? {
            has_credits: rl.credits.has_credits ?? false,
            unlimited: rl.credits.unlimited ?? false,
            balance: rl.credits.balance ?? null,
          }
        : null;

      resolve({
        provider_id: "codex",
        provider_label: "Codex",
        account_label: null,
        plan_type: rl.plan_type ?? null,
        source: "codex-session-log",
        source_confidence: "medium",
        status,
        fetched_at,
        stale_after_seconds: STALE_AFTER_SECONDS,
        windows,
        credits,
        error_message: null,
      });
    });

    rl.on("error", (err: Error) => {
      reject(new Error(`Failed to read ${file_path}: ${err.message}`));
    });

    stream.on("error", (err: Error) => {
      reject(new Error(`Failed to open ${file_path}: ${err.message}`));
    });
  });
}

function normalize_log_window(
  id: string,
  label: string,
  w: SessionLogWindow,
): ProviderLimitWindow {
  let resets_at_iso: string | null = null;
  if (w.resets_at != null) {
    try {
      resets_at_iso = epoch_to_rfc3339(w.resets_at);
    } catch {
      resets_at_iso = null;
    }
  }

  return {
    id,
    label,
    used_percent: w.used_percent,
    remaining_percent: 100.0 - w.used_percent,
    window_minutes: w.window_minutes ?? null,
    resets_at: resets_at_iso,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a unix epoch (seconds) to an RFC 3339 string matching Rust's
 * chrono::to_rfc3339() output: "2025-03-30T18:00:00+00:00".
 * JavaScript's Date.toISOString() produces "...Z" with milliseconds which
 * differs from the Rust format.
 */
function epoch_to_rfc3339(epoch_secs: number): string {
  const d = new Date(epoch_secs * 1000);
  const iso = d.toISOString(); // e.g. "2025-03-30T18:00:00.000Z"
  // Strip trailing milliseconds + Z, append +00:00
  return iso.replace(/\.(\d{3})Z$/, "+00:00");
}

export function find_codex_binary(): string | null {
  const home = homedir();
  const candidates = [
    join(home, ".bun", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fall back to PATH lookup via `which`
  try {
    const result = execSync("which codex", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (result !== "") {
      return result;
    }
  } catch {
    // which failed
  }

  return null;
}

export function make_error_snapshot(error_message: string): ProviderLimitSnapshot {
  return {
    provider_id: "codex",
    provider_label: "Codex",
    account_label: null,
    plan_type: null,
    source: "none",
    source_confidence: "low",
    status: "error",
    fetched_at: new Date().toISOString(),
    stale_after_seconds: STALE_AFTER_SECONDS,
    windows: [],
    credits: null,
    error_message,
  };
}
