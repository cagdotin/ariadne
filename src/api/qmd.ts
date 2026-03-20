import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  QmdAvailabilitySchema,
  QmdStatusSchema,
  QmdCollectionSchema,
  QmdCollectionDetailSchema,
  QmdCommandResultSchema,
} from "../schemas/qmd";
import type {
  QmdAvailability,
  QmdStatus,
  QmdCollection,
  QmdCollectionDetail,
  QmdCommandResult,
} from "../schemas/qmd";

export async function qmd_check_availability(): Promise<QmdAvailability> {
  const raw = await invoke("qmd_check_availability");
  return QmdAvailabilitySchema.parse(raw);
}

export async function qmd_get_status(): Promise<QmdStatus> {
  const raw = await invoke("qmd_get_status");
  return QmdStatusSchema.parse(raw);
}

export async function qmd_list_collections(): Promise<QmdCollection[]> {
  const raw = await invoke("qmd_list_collections");
  return z.array(QmdCollectionSchema).parse(raw);
}

export async function qmd_get_collection_detail(name: string): Promise<QmdCollectionDetail> {
  const raw = await invoke("qmd_get_collection_detail", { name });
  return QmdCollectionDetailSchema.parse(raw);
}

export async function qmd_add_collection(
  name: string,
  path: string,
  pattern?: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_add_collection", { name, path, pattern: pattern ?? null });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_remove_collection(name: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_remove_collection", { name });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_rename_collection(
  old_name: string,
  new_name: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_rename_collection", { oldName: old_name, newName: new_name });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_add_context(
  collection: string,
  path: string,
  text: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_add_context", { collection, path, text });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_remove_context(
  collection: string,
  path: string,
): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_remove_context", { collection, path });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_set_global_context(text: string): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_set_global_context", { text });
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_reindex(): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_reindex");
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_embed(): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_embed");
  return QmdCommandResultSchema.parse(raw);
}

export async function qmd_cleanup(): Promise<QmdCommandResult> {
  const raw = await invoke("qmd_cleanup");
  return QmdCommandResultSchema.parse(raw);
}
