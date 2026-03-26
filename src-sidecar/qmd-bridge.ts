#!/usr/bin/env node
/**
 * Ariadne QMD Bridge — Sidecar process wrapping the QMD SDK.
 *
 * Communicates via newline-delimited JSON over stdin/stdout.
 * Spawned by the Tauri Rust backend; stays alive for the app's lifetime.
 *
 * Usage:
 *   bun run qmd-bridge.ts [--db-path <path>]
 */

import { readFile, stat as fs_stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fast_glob from "fast-glob";

// ── Patch macOS Bun SQLite before importing QMD ──────────────────────────────
//
// Apple's system SQLite is compiled with SQLITE_OMIT_LOAD_EXTENSION, which
// prevents loading native extensions like sqlite-vec. On macOS + Bun, we swap
// in Homebrew's full-featured SQLite build via Database.setCustomSQLite()
// BEFORE any QMD code runs (QMD's db.js executes at import time).
//
// See: https://bun.sh/docs/runtime/sqlite#setcustomsqlite

const is_bun = typeof globalThis.Bun !== "undefined";

if (is_bun && process.platform === "darwin") {
  const bun_sqlite = "bun:" + "sqlite";
  const { Database: BunDatabase } = await import(/* @vite-ignore */ bun_sqlite);
  const homebrew_paths = [
    "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", // Apple Silicon
    "/usr/local/opt/sqlite/lib/libsqlite3.dylib",    // Intel
  ];
  for (const p of homebrew_paths) {
    try {
      BunDatabase.setCustomSQLite(p);
      process.stderr.write(`[qmd-bridge] Using Homebrew SQLite: ${p}\n`);
      break;
    } catch {
      // Not found at this path, try next
    }
  }
}

// Now safe to import QMD — its db.js will use the patched SQLite
const { createStore, Maintenance } = await import("@tobilu/qmd");
type QMDStore = Awaited<ReturnType<typeof createStore>>;

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcEvent {
  id: number;
  event: string;
  data: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Re-implementation of QMD's internal handelize function.
 * Normalizes filesystem paths to the format QMD stores in its database.
 * Must match the behavior of handelize() in @tobilu/qmd store.ts.
 */
function handelize_path(file_path: string): string {
  return file_path
    .toLowerCase()
    .split("/")
    .map((segment, idx, arr) => {
      const is_last = idx === arr.length - 1;
      if (is_last) {
        const ext_match = segment.match(/(\.[a-z0-9]+)$/i);
        const ext = ext_match ? ext_match[1] : "";
        const name_without_ext = ext ? segment.slice(0, -ext.length) : segment;
        const cleaned = name_without_ext
          .replace(/[^\p{L}\p{N}$]+/gu, "-")
          .replace(/^-+|-+$/g, "");
        return cleaned + ext;
      }
      return segment
        .replace(/[^\p{L}\p{N}$]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

/** Content hash matching QMD's internal hashContent — SHA-256 hex */
function hash_content(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Extract title matching QMD's internal extractor — first h1 or h2, or filename */
function extract_title(content: string, filename: string): string {
  const match = content.match(/^##?\s+(.+)$/m);
  if (match) return match[1]!.trim();
  const base = filename.split("/").pop() ?? filename;
  return base.replace(/\.[^.]+$/, "");
}

/** Write a single JSON line to stdout */
function send(msg: JsonRpcResponse | JsonRpcEvent): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

/** Send a result response */
function send_result(id: number, result: unknown): void {
  send({ id, result });
}

/** Send an error response */
function send_error(id: number, code: number, message: string): void {
  send({ id, error: { code, message } });
}

/** Send a progress event */
function send_progress(id: number, data: unknown): void {
  send({ id, event: "progress", data });
}

// ── Default DB path resolution ───────────────────────────────────────────────

function get_default_db_path(): string {
  const cache_root = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(cache_root, "qmd", "index.sqlite");
}

function parse_db_path_from_argv(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--db-path");
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]!;
  }
  return get_default_db_path();
}

// ── Filesystem scanning ──────────────────────────────────────────────────────

const EXCLUDE_DIRS = ["node_modules", ".git", ".cache", "vendor", "dist", "build"];

async function do_scan_filesystem(
  scan_path: string,
  pattern: string,
  ignore?: string[],
): Promise<string[]> {
  const all_ignore = [
    ...EXCLUDE_DIRS.map((d) => `**/${d}/**`),
    ...(ignore ?? []),
  ];

  const all_files = await fast_glob(pattern, {
    cwd: scan_path,
    onlyFiles: true,
    followSymbolicLinks: false,
    dot: false,
    ignore: all_ignore,
  });

  // Filter hidden files/folders (segments starting with ".")
  const filtered = all_files.filter((file) => {
    const parts = file.split("/");
    return !parts.some((part) => part.startsWith("."));
  });

  filtered.sort();
  return filtered;
}

// ── Module-level store (mutable for switch_index) ────────────────────────────

let store: QMDStore;
let current_db_path: string;

// ── Method handlers ──────────────────────────────────────────────────────────

type MethodHandler = (
  id: number,
  params: Record<string, unknown>,
) => Promise<void>;

const methods: Record<string, MethodHandler> = {
  // 0. ping
  async ping(id, _params) {
    send_result(id, { ok: true });
  },

  // 0b. switch_index — close current store, open new one
  async switch_index(id, params) {
    const db_path = params.db_path as string;

    // Close current store
    try {
      await store.close();
    } catch {
      // Ignore close errors — store may already be closed
    }

    // Open new store
    try {
      store = await createStore({ dbPath: db_path });
      current_db_path = db_path;
      process.stderr.write(`[qmd-bridge] Switched to index at ${db_path}\n`);
      send_result(id, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send_error(id, -1, `Failed to switch index: ${message}`);
    }
  },

  // 0c. create_index — create an empty store at the given path, then close it
  async create_index(id, params) {
    const db_path = params.db_path as string;

    try {
      const new_store = await createStore({ dbPath: db_path });
      await new_store.close();
      process.stderr.write(`[qmd-bridge] Created index at ${db_path}\n`);
      send_result(id, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send_error(id, -1, `Failed to create index: ${message}`);
    }
  },

  // 1. add_collection
  async add_collection(id, params) {
    const name = params.name as string;
    const col_path = params.path as string;
    const pattern = params.pattern as string | undefined;
    const ignore = params.ignore as string[] | undefined;
    await store.addCollection(name, { path: col_path, pattern, ignore });
    send_result(id, { ok: true });
  },

  // 2. remove_collection
  async remove_collection(id, params) {
    const name = params.name as string;
    await store.removeCollection(name);
    send_result(id, { ok: true });
  },

  // 3. rename_collection
  async rename_collection(id, params) {
    const old_name = params.old_name as string;
    const new_name = params.new_name as string;
    await store.renameCollection(old_name, new_name);
    send_result(id, { ok: true });
  },

  // 4. add_context
  async add_context(id, params) {
    const collection = params.collection as string;
    const ctx_path = params.path as string;
    const text = params.text as string;
    await store.addContext(collection, ctx_path, text);
    send_result(id, { ok: true });
  },

  // 5. remove_context
  async remove_context(id, params) {
    const collection = params.collection as string;
    const ctx_path = params.path as string;
    await store.removeContext(collection, ctx_path);
    send_result(id, { ok: true });
  },

  // 6. set_global_context
  async set_global_context(id, params) {
    const text = params.text as string | undefined;
    await store.setGlobalContext(text);
    send_result(id, { ok: true });
  },

  // 7. update — streams progress events
  async update(id, params) {
    const collections = params.collections as string[] | undefined;
    const result = await store.update({
      collections,
      onProgress: (info) => {
        send_progress(id, {
          collection: info.collection,
          file: info.file,
          current: info.current,
          total: info.total,
        });
      },
    });
    send_result(id, result);
  },

  // 8. embed — streams progress events
  async embed(id, params) {
    const force = params.force as boolean | undefined;
    const result = await store.embed({
      force,
      onProgress: (info) => {
        send_progress(id, {
          chunksEmbedded: info.chunksEmbedded,
          totalChunks: info.totalChunks,
          bytesProcessed: info.bytesProcessed,
          totalBytes: info.totalBytes,
        });
      },
    });
    send_result(id, result);
  },

  // 9. cleanup
  async cleanup(id, _params) {
    const maintenance = new Maintenance(store.internal);
    const llm_cache = maintenance.clearLLMCache();
    const orphaned_content = maintenance.cleanupOrphanedContent();
    const orphaned_vectors = maintenance.cleanupOrphanedVectors();
    const inactive_docs = maintenance.deleteInactiveDocs();
    maintenance.vacuum();
    send_result(id, {
      llm_cache,
      orphaned_content,
      orphaned_vectors,
      inactive_docs,
    });
  },

  // 10. scan_filesystem
  async scan_filesystem(id, params) {
    const scan_path = params.path as string;
    const pattern = params.pattern as string;
    const ignore = params.ignore as string[] | undefined;
    const paths = await do_scan_filesystem(scan_path, pattern, ignore);
    send_result(id, { paths });
  },

  // 11. get_indexed_paths
  async get_indexed_paths(id, params) {
    const collection = params.collection as string;
    const paths = store.internal.getActiveDocumentPaths(collection);
    send_result(id, { paths });
  },

  // 12. toggle_files
  async toggle_files(id, params) {
    const collection = params.collection as string;
    const repo_root = params.repo_root as string;
    const adds = params.adds as string[];
    const removes = params.removes as string[];
    const now = new Date().toISOString();

    let deactivated = 0;
    let indexed = 0;

    // Process removes — deactivate documents
    for (const fs_path of removes) {
      const qmd_path = handelize_path(fs_path);
      try {
        store.internal.deactivateDocument(collection, qmd_path);
        deactivated++;
      } catch {
        // Document may not exist, skip silently
      }
    }

    // Process adds — read file, hash, insert content + document
    for (const fs_path of adds) {
      const absolute_path = path.join(repo_root, fs_path);
      const qmd_path = handelize_path(fs_path);

      let content: string;
      try {
        content = await readFile(absolute_path, "utf-8");
      } catch {
        continue; // Skip unreadable files
      }

      if (!content.trim()) {
        continue; // Skip empty files
      }

      const hash = hash_content(content);
      const title = extract_title(content, fs_path);

      // Check if document already exists
      const existing = store.internal.findActiveDocument(collection, qmd_path);
      if (existing) {
        if (existing.hash !== hash) {
          // Content changed — update
          store.internal.insertContent(hash, content, now);
          let modified_at = now;
          try {
            const st = await fs_stat(absolute_path);
            modified_at = st.mtime.toISOString();
          } catch {
            // use now
          }
          store.internal.updateDocument(existing.id, title, hash, modified_at);
        }
        // Already exists with same content — count as indexed
        indexed++;
        continue;
      }

      // New document — insert
      store.internal.insertContent(hash, content, now);
      let created_at = now;
      let modified_at = now;
      try {
        const st = await fs_stat(absolute_path);
        created_at = st.birthtime.toISOString();
        modified_at = st.mtime.toISOString();
      } catch {
        // use now
      }
      store.internal.insertDocument(collection, qmd_path, title, hash, created_at, modified_at);
      indexed++;
    }

    // After adds, run embed to generate embeddings for new content
    if (indexed > 0) {
      await store.embed({
        onProgress: (info) => {
          send_progress(id, {
            phase: "embed",
            chunksEmbedded: info.chunksEmbedded,
            totalChunks: info.totalChunks,
            bytesProcessed: info.bytesProcessed,
            totalBytes: info.totalBytes,
          });
        },
      });
    }

    send_result(id, { indexed, deactivated });
  },

  // 13. search — hybrid search with query expansion + explain traces
  async search(id, params) {
    const query = params.query as string;
    const collections = params.collections as string[] | undefined;
    const limit = params.limit as number | undefined;

    // Stage 1: Expand the query into typed sub-searches
    const expand_start = Date.now();
    send_progress(id, { stage: "expanding" });
    const expanded = await store.expandQuery(query);
    const expand_ms = Date.now() - expand_start;
    send_progress(id, {
      stage: "expanded",
      queries: expanded,
      elapsed_ms: expand_ms,
    });

    // Stage 2: Search with pre-expanded queries (skips internal expansion)
    const search_start = Date.now();
    send_progress(id, { stage: "searching" });
    const results = await store.search({
      queries: expanded,
      collections,
      limit: limit ?? 10,
      explain: true,
    });
    const search_ms = Date.now() - search_start;

    send_result(id, {
      results,
      expanded_queries: expanded,
      timing: {
        expand_ms,
        search_ms,
        total_ms: expand_ms + search_ms,
      },
    });
  },
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db_path = parse_db_path_from_argv();
  current_db_path = db_path;

  // Create QMD store in DB-only mode (no config file)
  try {
    store = await createStore({ dbPath: db_path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[qmd-bridge] Failed to open store at ${db_path}: ${message}\n`);
    process.exit(1);
  }

  process.stderr.write(`[qmd-bridge] Store opened at ${db_path}\n`);

  // Signal handlers for graceful shutdown
  const shutdown = async () => {
    process.stderr.write("[qmd-bridge] Shutting down...\n");
    try {
      await store.close();
    } catch {
      // Ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Readline loop — read newline-delimited JSON from stdin
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      // Malformed JSON — no id to respond to, log and skip
      process.stderr.write(`[qmd-bridge] Malformed JSON: ${trimmed}\n`);
      return;
    }

    const { id, method, params } = request;

    if (!id || !method) {
      send_error(id ?? 0, -1, "Missing 'id' or 'method' in request");
      return;
    }

    const handler = methods[method];
    if (!handler) {
      send_error(id, -1, `Unknown method: ${method}`);
      return;
    }

    try {
      await handler(id, params ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send_error(id, -1, message);
    }
  });

  rl.on("close", async () => {
    process.stderr.write("[qmd-bridge] stdin closed, shutting down...\n");
    try {
      await store.close();
    } catch {
      // Ignore
    }
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[qmd-bridge] Fatal error: ${err}\n`);
  process.exit(1);
});
