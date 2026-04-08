import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  qmd_availability_schema,
  type QmdAvailability,
} from "@contracts/qmd/availability";
import {
  qmd_index_schema,
  type QmdIndex,
} from "@contracts/qmd/indexes";
import {
  qmd_collection_schema,
  qmd_collection_detail_schema,
  type QmdCollection,
  type QmdCollectionDetail,
} from "@contracts/qmd/collections";
import {
  qmd_status_schema,
  type QmdStatus,
} from "@contracts/qmd/collections";
import {
  qmd_command_result_schema,
  qmd_toggle_files_result_schema,
  type QmdCommandResult,
  type QmdToggleFilesResult,
} from "@contracts/qmd/mutations";
import {
  qmd_search_result_schema,
  type QmdSearchResult,
} from "@contracts/qmd/search";

// ─── Index Management ───────────────────────────────────────────────────────

export async function qmd_list_indexes(): Promise<QmdIndex[]> {
  const raw = await invoke("qmd_list_indexes");
  return z.array(qmd_index_schema).parse(raw);
}

export async function qmd_create_index(name: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_create_index", { name });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_delete_index(name: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_delete_index", { name });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_rename_index(
  old_name: string,
  new_name: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_rename_index", { oldName: old_name, newName: new_name });
  return qmd_command_result_schema.parse(raw);
}

// ─── Global (not per-index) ─────────────────────────────────────────────────

export async function qmd_check_availability(): Promise<QmdAvailability> {
  const raw = await invoke("qmd_check_availability");
  return qmd_availability_schema.parse(raw);
}

// ─── Per-Index Commands ─────────────────────────────────────────────────────

export async function qmd_get_status(index: string): Promise<QmdStatus> {
  const raw = await invoke("qmd_get_status", { index });
  return qmd_status_schema.parse(raw);
}

export async function qmd_list_collections(index: string): Promise<QmdCollection[]> {
  const raw = await invoke("qmd_list_collections", { index });
  return z.array(qmd_collection_schema).parse(raw);
}

export async function qmd_get_collection_detail(
  index: string,
  name: string,
): Promise<QmdCollectionDetail> {
  const raw = await invoke("qmd_get_collection_detail", { index, name });
  return qmd_collection_detail_schema.parse(raw);
}

export async function qmd_add_collection(
  index: string,
  name: string,
  path: string,
  pattern?: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_add_collection", { index, name, path, pattern: pattern ?? null });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_remove_collection(
  index: string,
  name: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_remove_collection", { index, name });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_rename_collection(
  index: string,
  old_name: string,
  new_name: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_rename_collection", { index, oldName: old_name, newName: new_name });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_add_context(
  index: string,
  collection: string,
  path: string,
  text: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_add_context", { index, collection, path, text });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_remove_context(
  index: string,
  collection: string,
  path: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_remove_context", { index, collection, path });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_set_global_context(
  index: string,
  text: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_set_global_context", { index, text });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_reindex(index: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_reindex", { index });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_embed(index: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_embed", { index });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_cleanup(index: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_cleanup", { index });
  return qmd_command_result_schema.parse(raw);
}

export async function qmd_scan_filesystem(
  index: string,
  collection: string,
): Promise<string[]> {
  const raw = await invoke("qmd_scan_filesystem", { index, collection });
  return z.array(z.string()).parse(raw);
}

export async function qmd_get_indexed_paths(
  index: string,
  collection: string,
): Promise<string[]> {
  const raw = await invoke("qmd_get_indexed_paths", { index, collection });
  return z.array(z.string()).parse(raw);
}

export async function qmd_toggle_files(
  index: string,
  collection: string,
  repo_root: string,
  adds: string[],
  removes: string[],
): Promise<QmdToggleFilesResult> {
  const raw = await invoke("qmd_toggle_files", { index, collection, repoRoot: repo_root, adds, removes });
  return qmd_toggle_files_result_schema.parse(raw);
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function qmd_search(
  index: string,
  query: string,
  collections?: string[],
  limit?: number,
): Promise<QmdSearchResult> {
  const raw = await invoke("qmd_search", {
    index,
    query,
    collections: collections ?? null,
    limit: limit ?? null,
  });
  return qmd_search_result_schema.parse(raw);
}
