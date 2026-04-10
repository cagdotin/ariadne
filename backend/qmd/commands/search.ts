// ---- QMD search command: hybrid search via bridge with progress streaming ----
//
// Faithful port of qmd_search from the legacy QMD command layer.

import { register_handler } from "../../runtime/request-router.js";
import { bridge_supervisor } from "../bridge/bridge-supervisor.js";
import { resolve_index_db_path } from "../index-paths.js";

register_handler("qmd_search", async (payload) => {
	const index = payload.index as string;
	const query = payload.query as string;
	const collections = payload.collections as string[] | undefined;
	const limit = payload.limit as number | undefined;

	const db_path = resolve_index_db_path(index);
	await bridge_supervisor.ensure_index(db_path);

	const result = await bridge_supervisor.call_with_progress(
		"search",
		{ query, collections, limit },
		"qmd:search-progress",
	);

	return result;
});
