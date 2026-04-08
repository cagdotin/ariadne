// ---- QMD mutation commands: collection/context mutations via bridge ----------
//
// Faithful port of the mutation commands from src-tauri/src/commands/qmd.rs.
// Each handler resolves the index db path, ensures the bridge has that index
// open, and delegates the operation to the bridge process.

import { register_handler } from "../../runtime/request-router.js";
import { resolve_index_db_path } from "../index-paths.js";
import { bridge_supervisor } from "../bridge/bridge-supervisor.js";

interface QmdCommandResult {
  success: boolean;
  output: string;
}

function wrap_result(result: unknown): QmdCommandResult {
  return {
    success: true,
    output: JSON.stringify(result),
  };
}

// ---- Collection mutations ---------------------------------------------------

register_handler("qmd_add_collection", async (payload) => {
  const index = payload.index as string;
  const name = payload.name as string;
  const coll_path = payload.path as string;
  const pattern = payload.pattern as string | undefined;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("add_collection", {
    name,
    path: coll_path,
    pattern,
  });
  return wrap_result(result);
});

register_handler("qmd_remove_collection", async (payload) => {
  const index = payload.index as string;
  const name = payload.name as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("remove_collection", { name });
  return wrap_result(result);
});

register_handler("qmd_rename_collection", async (payload) => {
  const index = payload.index as string;
  const old_name = payload.oldName as string;
  const new_name = payload.newName as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("rename_collection", {
    old_name,
    new_name,
  });
  return wrap_result(result);
});

// ---- Context mutations ------------------------------------------------------

register_handler("qmd_add_context", async (payload) => {
  const index = payload.index as string;
  const collection = payload.collection as string;
  const ctx_path = payload.path as string;
  const text = payload.text as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("add_context", {
    collection,
    path: ctx_path,
    text,
  });
  return wrap_result(result);
});

register_handler("qmd_remove_context", async (payload) => {
  const index = payload.index as string;
  const collection = payload.collection as string;
  const ctx_path = payload.path as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("remove_context", {
    collection,
    path: ctx_path,
  });
  return wrap_result(result);
});

register_handler("qmd_set_global_context", async (payload) => {
  const index = payload.index as string;
  const text = payload.text as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("set_global_context", { text });
  return wrap_result(result);
});

// ---- Progress-streaming mutations -------------------------------------------

register_handler("qmd_reindex", async (payload) => {
  const index = payload.index as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call_with_progress(
    "update",
    {},
    "qmd:update-progress",
  );
  return wrap_result(result);
});

register_handler("qmd_embed", async (payload) => {
  const index = payload.index as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call_with_progress(
    "embed",
    {},
    "qmd:embed-progress",
  );
  return wrap_result(result);
});

register_handler("qmd_cleanup", async (payload) => {
  const index = payload.index as string;

  const db_path = resolve_index_db_path(index);
  await bridge_supervisor.ensure_index(db_path);
  const result = await bridge_supervisor.call("cleanup", {});
  return wrap_result(result);
});
