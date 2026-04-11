/**
 * Exploration command registration: wires the get_session_exploration
 * handler into the request router.
 */

import type { ExplorationPayload } from "../../../contracts/exploration/types.js";
import type {
	SessionEntry,
	SessionHeader,
} from "../../../contracts/sessions/replay.js";
import { register_handler } from "../../runtime/request-router.js";
import { get_session_entries } from "../replay-loader.js";
import { derive_exploration } from "./derive-exploration.js";
import { get_cached, set_cached } from "./exploration-cache.js";
import { get_or_build_repo_context } from "./repo-context-cache.js";

// ---- get_session_exploration ------------------------------------------------

register_handler("get_session_exploration", async (payload) => {
	const session_id = payload.sessionId as string;
	if (typeof session_id !== "string") {
		throw new Error("sessionId is required");
	}

	// Use cached dynamic layer if available, otherwise derive from replay
	let dynamic = get_cached(session_id);
	if (!dynamic) {
		const { entries, header } = await get_session_entries(session_id);
		// replay-loader returns untyped records; cast at this boundary
		dynamic = derive_exploration(
			session_id,
			entries as unknown as SessionEntry[],
			header as unknown as SessionHeader | null,
		);
		set_cached(session_id, dynamic);
	}

	// Clone the dynamic layer so repo-context merge doesn't mutate the cache
	const exploration = clone_payload(dynamic);

	// Build repo context (static layer) if project path is available.
	// This always goes through repo-context-cache which respects its own TTL,
	// so stale repo-context will be rebuilt even when the dynamic layer is cached.
	if (exploration.project_path) {
		try {
			const explored_paths = exploration.artifacts
				.filter((a) => a.explored && a.kind !== "discovery_query")
				.map((a) => a.path);

			const repo_ctx = await get_or_build_repo_context(
				exploration.project_path,
				explored_paths,
			);

			if (repo_ctx.success) {
				merge_repo_context(exploration, repo_ctx.artifacts, repo_ctx.relations);
				exploration.has_repo_context = true;
			}
		} catch (err) {
			console.warn(
				`[exploration] Repo context build failed for ${exploration.project_path}:`,
				err,
			);
			// Exploration still works without repo context
		}
	}

	return exploration;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function clone_payload(source: ExplorationPayload): ExplorationPayload {
	return {
		...source,
		turns: [...source.turns],
		events: [...source.events],
		artifacts: [...source.artifacts],
		relations: [...source.relations],
	};
}

function merge_repo_context(
	payload: ExplorationPayload,
	repo_artifacts: ExplorationPayload["artifacts"],
	repo_relations: ExplorationPayload["relations"],
): void {
	const existing_ids = new Set(payload.artifacts.map((a) => a.id));

	// Add new artifacts from repo context (don't overwrite session-derived ones)
	for (const art of repo_artifacts) {
		if (!existing_ids.has(art.id)) {
			payload.artifacts.push(art);
		}
	}

	// Add all repo context relations
	payload.relations.push(...repo_relations);
}
