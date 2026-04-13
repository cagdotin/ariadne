/**
 * Graph command registration: wires the get_session_graph
 * handler into the request router.
 */

import type {
	SessionEntry,
	SessionHeader,
} from "../../../contracts/sessions/replay.js";
import { register_handler } from "../../runtime/request-router.js";
import { get_session_entries } from "../replay-loader.js";
import { augment_repo_context } from "./augment-repo-context.js";
import { derive_session_graph } from "./derive-session-graph.js";
import { get_cached_graph, set_cached_graph } from "./graph-cache.js";

register_handler("get_session_graph", async (payload) => {
	const session_id = payload.sessionId as string;
	if (typeof session_id !== "string") {
		throw new Error("sessionId is required");
	}

	// Check cache for dynamic graph layer
	let graph = get_cached_graph(session_id);
	if (!graph) {
		const { entries, header } = await get_session_entries(session_id);
		graph = derive_session_graph(
			session_id,
			entries as unknown as SessionEntry[],
			header as unknown as SessionHeader | null,
		);
		set_cached_graph(session_id, graph);
	}

	// Clone before augmentation so cache isn't mutated
	const result = {
		...graph,
		nodes: [...graph.nodes],
		edges: [...graph.edges],
	};

	// Augment with ambient repo context
	if (result.project_path) {
		try {
			augment_repo_context(result);
		} catch (err) {
			console.warn(
				`[graph] Repo context augmentation failed for ${result.project_path}:`,
				err,
			);
		}
	}

	return result;
});
