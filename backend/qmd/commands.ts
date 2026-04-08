// ---- QMD command registration: wires handlers into the request router -------

import { register_handler } from "../runtime/request-router.js";

import {
  qmd_list_indexes,
  qmd_get_status,
  qmd_list_collections,
  qmd_get_collection_detail,
  qmd_check_availability,
  qmd_get_indexed_paths,
} from "./sqlite-read-service.js";

import {
  qmd_create_index,
  qmd_delete_index,
  qmd_rename_index,
} from "./commands/indexes.js";

// Side-effect imports: register mutation, search, and file command handlers
import "./commands/mutations.js";
import "./commands/search.js";
import "./commands/files.js";

// ---- Read-only handlers -----------------------------------------------------

register_handler("qmd_list_indexes", async () => {
  return qmd_list_indexes();
});

register_handler("qmd_get_status", async (payload) => {
  const index = payload.index as string;
  return qmd_get_status(index);
});

register_handler("qmd_list_collections", async (payload) => {
  const index = payload.index as string;
  return qmd_list_collections(index);
});

register_handler("qmd_get_collection_detail", async (payload) => {
  const index = payload.index as string;
  const name = payload.name as string;
  return qmd_get_collection_detail(index, name);
});

register_handler("qmd_check_availability", async () => {
  return qmd_check_availability();
});

register_handler("qmd_get_indexed_paths", async (payload) => {
  const index = payload.index as string;
  const collection = payload.collection as string;
  return qmd_get_indexed_paths(index, collection);
});

// ---- Index management handlers ----------------------------------------------

register_handler("qmd_create_index", async (payload) => {
  const name = payload.name as string;
  return qmd_create_index(name);
});

register_handler("qmd_delete_index", async (payload) => {
  const name = payload.name as string;
  return qmd_delete_index(name);
});

register_handler("qmd_rename_index", async (payload) => {
  const old_name = payload.oldName as string;
  const new_name = payload.newName as string;
  return qmd_rename_index(old_name, new_name);
});
