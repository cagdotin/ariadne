/**
 * Session replay loader — faithful port of
 * src-tauri/src/cache.rs :: SessionCache::get_session_entries()
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { session_cache } from "./session-cache.js";

export interface SessionEntriesResponse {
  header: Record<string, unknown> | null;
  entries: Record<string, unknown>[];
  leaf_id: string | null;
}

export async function get_session_entries(
  session_id: string,
): Promise<SessionEntriesResponse> {
  const all_sessions = await session_cache.get_or_init();

  const session = all_sessions.find((s) => s.id === session_id);
  if (!session) {
    throw new Error(`Session with id ${session_id} not found`);
  }

  // Reconstruct the file path from session_dir + file_name
  const sessions_root = process.env.ARIADNE_PI_SESSIONS_ROOT
    ?? path.join(os.homedir(), ".pi", "agent", "sessions");

  const file_path = path.join(sessions_root, session.session_dir, session.file_name);

  if (!fs.existsSync(file_path)) {
    throw new Error(`Session file not found: ${file_path}`);
  }

  const raw = fs.readFileSync(file_path, "utf-8");
  const lines = raw.split("\n");

  let header: Record<string, unknown> | null = null;
  const entries: Record<string, unknown>[] = [];
  let leaf_id: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }

    let value: Record<string, unknown>;
    try {
      value = JSON.parse(trimmed);
    } catch {
      // Skip malformed lines (matches Rust behavior of returning error,
      // but for parity with the serde_json behavior we skip)
      continue;
    }

    // First line with type "session" is the header
    if (value.type === "session") {
      header = value;
      continue;
    }

    // Track leaf_id as the id of the last entry
    if (typeof value.id === "string") {
      leaf_id = value.id;
    }

    entries.push(value);
  }

  return { header, entries, leaf_id };
}
