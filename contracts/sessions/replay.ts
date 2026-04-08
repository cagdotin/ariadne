import { z } from "zod";

// ─── Session replay entry contract ──────────────────────────────────────────
//
// TODO: Replace this permissive schema with strict Zod definitions derived
// from the session entry type hierarchy. Currently using z.unknown() for
// entry bodies because:
//   - The Rust backend returns raw serde_json::Value (no server-side schema)
//   - Strict typing risks breaking on edge-case session formats
//   - Contract freeze prioritizes fidelity to current behavior
//
// The full type hierarchy is documented in:
//   src/components/session-viewer/types.ts
//
// Tracked as: TODO-225c4b11
// See also: docs/specs/2026-03-28-migration-contract-freeze-and-parity-harness.md

// ─── Session header ─────────────────────────────────────────────────────────

export const session_header_schema = z.object({
  type: z.literal("session"),
  version: z.number().optional(),
  id: z.string(),
  timestamp: z.string(),
  cwd: z.string(),
  parent_session: z.string().optional(),
}).passthrough();
export type SessionHeader = z.infer<typeof session_header_schema>;

// ─── Session entry (permissive) ─────────────────────────────────────────────
// Every entry has at least { type, id, parentId, timestamp }.
// Additional fields vary by entry type and are preserved as-is.

export const session_entry_schema = z.object({
  type: z.string(),
  id: z.string(),
  parentId: z.string().nullable(),
  timestamp: z.string(),
}).passthrough();
export type SessionEntry = z.infer<typeof session_entry_schema>;

// ─── Replay response ────────────────────────────────────────────────────────

export const session_entries_response_schema = z.object({
  header: session_header_schema.nullable(),
  entries: z.array(session_entry_schema),
  leaf_id: z.string().nullable(),
});
export type SessionEntriesResponse = z.infer<typeof session_entries_response_schema>;
