/**
 * Graph-to-Exploration adapter — canonical single copy.
 *
 * Projects a SessionGraphPayload into an ExplorationPayload.
 * Both backend and renderer import from this location.
 *
 * This is a transitional adapter. The graph IR is the source of truth
 * and Exploration components consume it directly. The adapter exists
 * for any remaining callers that need the ExplorationPayload shape.
 */

import type {
	ArtifactKind,
	EvidenceClass,
	ExplorationArtifact,
	ExplorationEvent,
	ExplorationEventKind,
	ExplorationPayload,
	ExplorationRelation,
	ExplorationTurn,
	RelationKind,
} from "../exploration/types";
import type { SessionGraphPayload } from "./types";
import { classify_tool_action } from "./tool-classification";

// ── Node kind → artifact kind mapping ────────────────────────────────────────

const node_to_artifact_kind: Record<string, ArtifactKind> = {
	source_file: "source_file",
	doc_file: "doc_file",
	doc_section: "doc_section",
	agents_doc: "doc_file",
	instruction_source: "doc_file",
};

// ── Edge kind → relation kind mapping ────────────────────────────────────────

const edge_to_relation_kind: Partial<Record<string, RelationKind>> = {
	read: "command_led_to_read",
	edited: "read_preceded_edit",
	wrote: "read_preceded_edit",
	imports: "file_imports_file",
	linked_to: "doc_links_doc",
	belongs_to: "section_belongs_to_doc",
	adjacent_unexplored: "adjacent_unexplored",
};

// ── Edge kind → evidence class mapping ───────────────────────────────────────

function edge_availability_to_evidence(availability: string): EvidenceClass {
	switch (availability) {
		case "available_observed":
			return "explicit_session";
		case "available_ambient":
			return "explicit_doc";
		case "derived_inferred":
			return "sequencing_inference";
		default:
			return "adjacency_only";
	}
}

function get_tool_index(
	graph: SessionGraphPayload,
	tool_node_id: string,
): number {
	const tool_node = graph.nodes.find((node) => node.id === tool_node_id);
	const tool_index = tool_node?.metadata?.tool_index;
	return typeof tool_index === "number" ? tool_index : Number.MAX_SAFE_INTEGER;
}

// ── Main adapter ─────────────────────────────────────────────────────────────

export function project_graph_to_exploration(
	graph: SessionGraphPayload,
): ExplorationPayload {
	const artifacts: ExplorationArtifact[] = [];
	const events: ExplorationEvent[] = [];
	const relations: ExplorationRelation[] = [];
	const turns: ExplorationTurn[] = [];

	// Build artifact map from file/doc nodes
	const artifact_ids = new Set<string>();
	for (const node of graph.nodes) {
		const art_kind = node_to_artifact_kind[node.kind];
		if (art_kind) {
			artifacts.push({
				id: node.id,
				kind: art_kind,
				path: (node.metadata?.path as string) ?? node.label,
				label: node.label,
				parent_id: null,
				explored: node.availability === "available_observed",
				first_seen_turn: null,
			});
			artifact_ids.add(node.id);
		}
	}

	// Build turns and events from user_prompt / assistant_turn / tool_call nodes
	const user_prompts = graph.nodes
		.filter((n) => n.kind === "user_prompt")
		.sort((a, b) => {
			const ai = (a.metadata?.turn_index as number) ?? 0;
			const bi = (b.metadata?.turn_index as number) ?? 0;
			return ai - bi;
		});

	for (const user_node of user_prompts) {
		const turn_index =
			(user_node.metadata?.turn_index as number) ?? turns.length;
		const turn_event_ids: string[] = [];
		const turn_artifact_ids = new Set<string>();

		// User message event
		const user_evt_id = `evt_${turn_index}_0`;
		events.push({
			id: user_evt_id,
			kind: "user_message",
			turn_index,
			timestamp: graph.derived_at,
			label: user_node.label,
			artifact_id: null,
			entry_id: user_node.evidence[0]?.source_ref ?? null,
			detail: (user_node.metadata?.text as string) ?? null,
			is_error: false,
		});
		turn_event_ids.push(user_evt_id);

		// Find the assistant_turn node for this turn
		const turn_node = graph.nodes.find(
			(n) =>
				n.kind === "assistant_turn" &&
				(n.metadata?.turn_index as number) === turn_index,
		);

		if (turn_node) {
			// Find all tool_call/search_query nodes invoked by this turn in
			// explicit invocation order.
			const tool_edges = graph.edges
				.filter((e) => e.source_id === turn_node.id && e.kind === "invoked_tool")
				.sort(
					(left, right) =>
						get_tool_index(graph, left.target_id) -
						get_tool_index(graph, right.target_id),
				);

			let evt_index = 1;
			for (const tool_edge of tool_edges) {
				const tool_node = graph.nodes.find(
					(n) => n.id === tool_edge.target_id,
				);
				if (!tool_node) continue;

				const tool_name =
					(tool_node.metadata?.tool_name as string) ?? "";
				const file_path_meta =
					(tool_node.metadata?.file_path as string) ?? undefined;
				const category =
					tool_node.kind === "search_query"
						? ("search" as const)
						: classify_tool_action(tool_name, file_path_meta);

				const category_to_event: Record<string, ExplorationEventKind> = {
					search: "discovery_command",
					read: "file_read",
					doc_read: "doc_read",
					edit: "file_edit",
					write: "file_write",
					opaque: "opaque_tool",
				};
				const event_kind: ExplorationEventKind =
					category_to_event[category] ?? "opaque_tool";

				// Find the file artifact this tool connected to
				const file_edge = graph.edges.find(
					(e) =>
						e.source_id === tool_node.id &&
						(e.kind === "read" ||
							e.kind === "edited" ||
							e.kind === "wrote"),
				);
				const artifact_id = file_edge ? file_edge.target_id : null;

				const evt_id = `evt_${turn_index}_${evt_index}`;
				events.push({
					id: evt_id,
					kind: event_kind,
					turn_index,
					timestamp: graph.derived_at,
					label: tool_node.label,
					artifact_id,
					entry_id: tool_node.evidence[0]?.source_ref ?? null,
					detail: tool_node.label,
					is_error: false,
				});
				turn_event_ids.push(evt_id);
				if (artifact_id) turn_artifact_ids.add(artifact_id);

				evt_index++;
			}
		}

		turns.push({
			index: turn_index,
			user_message_snippet: user_node.label.replace(/^User:\s*/, ""),
			event_ids: turn_event_ids,
			artifact_ids: [...turn_artifact_ids],
			timestamp: graph.derived_at,
			entry_id: user_node.evidence[0]?.source_ref ?? null,
		});

		// Assign first_seen_turn for artifacts
		for (const art_id of turn_artifact_ids) {
			const art = artifacts.find((a) => a.id === art_id);
			if (art && art.first_seen_turn === null) {
				art.first_seen_turn = turn_index;
			}
		}
	}

	// Build relations from graph edges that connect artifacts
	for (const edge of graph.edges) {
		if (
			!artifact_ids.has(edge.source_id) &&
			!artifact_ids.has(edge.target_id)
		) {
			continue;
		}
		const rel_kind = edge_to_relation_kind[edge.kind];
		if (!rel_kind) continue;

		relations.push({
			source_id: edge.source_id,
			target_id: edge.target_id,
			kind: rel_kind,
			evidence: edge_availability_to_evidence(edge.availability),
			label: edge.label,
		});
	}

	return {
		session_id: graph.session_id,
		project_path: graph.project_path,
		turns,
		events,
		artifacts,
		relations,
		has_repo_context: graph.has_repo_context,
		derived_at: graph.derived_at,
	};
}
