// ---- QMD file management commands: scan filesystem and toggle files ----------
//
// Faithful port of qmd_scan_filesystem and qmd_toggle_files from
// src-tauri/src/commands/qmd.rs.

import Database from "better-sqlite3";
import fs from "node:fs";

import { register_handler } from "../../runtime/request-router.js";
import { resolve_index_db_path } from "../index-paths.js";
import { bridge_supervisor } from "../bridge/bridge-supervisor.js";

// ---- Helpers ----------------------------------------------------------------

function open_db(index: string): Database.Database {
  const db_path = resolve_index_db_path(index);
  if (!fs.existsSync(db_path)) {
    throw new Error(`QMD index '${index}' not found at ${db_path}`);
  }
  return new Database(db_path, { readonly: true });
}

// ---- qmd_scan_filesystem ----------------------------------------------------
//
// Reads collection metadata (path, pattern) from SQLite, then delegates the
// actual filesystem scan to the bridge process. Extracts the paths array from
// the bridge result. Matches the Rust two-step approach exactly.

register_handler("qmd_scan_filesystem", async (payload) => {
  const index = payload.index as string;
  const collection = payload.collection as string;

  // Step 1: read collection path and pattern from SQLite (matching Rust)
  const db = open_db(index);
  let coll_path: string;
  let coll_pattern: string;
  try {
    const row = db
      .prepare("SELECT path, pattern FROM store_collections WHERE name = ?")
      .get(collection) as { path: string; pattern: string } | undefined;

    if (!row) {
      throw new Error(`Collection not found: ${collection}`);
    }

    coll_path = row.path;
    coll_pattern = row.pattern;
  } finally {
    db.close();
  }

  // Step 2: delegate scan to bridge
  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);

  const result = (await bridge_supervisor.call("scan_filesystem", {
    collection,
    path: coll_path,
    pattern: coll_pattern,
  })) as Record<string, unknown>;

  // Extract paths array from result (matching Rust extraction)
  const paths_raw = result.paths;
  if (Array.isArray(paths_raw)) {
    return paths_raw.filter(
      (v: unknown): v is string => typeof v === "string",
    );
  }
  return [];
});

// ---- qmd_toggle_files -------------------------------------------------------

register_handler("qmd_toggle_files", async (payload) => {
  const index = payload.index as string;
  const collection = payload.collection as string;
  const repo_root = payload.repoRoot as string;
  const adds = payload.adds as string[];
  const removes = payload.removes as string[];

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);

  const result = await bridge_supervisor.call("toggle_files", {
    collection,
    repo_root,
    adds,
    removes,
  });

  return result;
});
