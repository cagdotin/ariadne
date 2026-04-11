/**
 * Pure selection logic for the exploration view.
 * Extracted from ExplorationView to allow unit testing without React/DOM.
 */

import type {
	ExplorationArtifact,
	ExplorationEvent,
	ExplorationPayload,
	ExplorationRelation,
	ExplorationTurn,
} from "@contracts/exploration";

export type SelectionTarget =
	| { type: "turn"; turn: ExplorationTurn }
	| { type: "event"; event: ExplorationEvent }
	| { type: "artifact"; artifact: ExplorationArtifact };

/**
 * Compute the set of IDs that should be highlighted for a given selection.
 */
export function compute_highlight_ids(
	selection: SelectionTarget | null,
	payload: ExplorationPayload,
): Set<string> {
	if (!selection) return new Set();
	const ids = new Set<string>();

	if (selection.type === "turn") {
		for (const eid of selection.turn.event_ids) ids.add(eid);
		for (const aid of selection.turn.artifact_ids) ids.add(aid);
	} else if (selection.type === "event") {
		ids.add(selection.event.id);
		if (selection.event.artifact_id) ids.add(selection.event.artifact_id);
		for (const rel of payload.relations) {
			if (
				rel.source_id === selection.event.id ||
				rel.target_id === selection.event.id
			) {
				ids.add(rel.source_id);
				ids.add(rel.target_id);
			}
		}
	} else if (selection.type === "artifact") {
		ids.add(selection.artifact.id);
		for (const evt of payload.events) {
			if (evt.artifact_id === selection.artifact.id) ids.add(evt.id);
		}
		for (const rel of payload.relations) {
			if (
				rel.source_id === selection.artifact.id ||
				rel.target_id === selection.artifact.id
			) {
				ids.add(rel.source_id);
				ids.add(rel.target_id);
			}
		}
	}

	return ids;
}

/**
 * Filter relations relevant to a selection's highlight set.
 */
export function compute_related_relations(
	highlight_ids: Set<string>,
	relations: ExplorationRelation[],
): ExplorationRelation[] {
	if (highlight_ids.size === 0) return [];
	return relations.filter(
		(r) => highlight_ids.has(r.source_id) || highlight_ids.has(r.target_id),
	);
}

/**
 * Compute the causal chain for an artifact selection (incoming relations).
 */
export function compute_causal_chain(
	artifact_id: string,
	related_relations: ExplorationRelation[],
): ExplorationRelation[] {
	return related_relations.filter((r) => r.target_id === artifact_id);
}
