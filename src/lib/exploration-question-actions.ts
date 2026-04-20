/**
 * Curated question-oriented actions for the Exploration route.
 *
 * Pure function that returns context-aware action descriptors
 * based on the selected node kind and its graph relationships.
 * Each action describes a meaningful combination of focus mode,
 * filter, and selection state.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";
import type { FocusMode, VisibilityOptions } from "./exploration-graph-view-model";

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestionAction {
	/** Stable identifier for the action */
	id: string;
	/** User-facing label */
	label: string;
	/** Suggested focus mode to apply */
	focus_mode: FocusMode;
	/** Suggested visibility overrides */
	visibility?: Partial<VisibilityOptions>;
	/** Node to select (defaults to current) */
	select_node_id?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface EdgeIndex {
	by_source: Map<string, GraphEdge[]>;
	by_target: Map<string, GraphEdge[]>;
	node_map: Map<string, GraphNode>;
}

function build_edge_index(graph: SessionGraphPayload): EdgeIndex {
	const by_source = new Map<string, GraphEdge[]>();
	const by_target = new Map<string, GraphEdge[]>();
	const node_map = new Map<string, GraphNode>();

	for (const edge of graph.edges) {
		let src = by_source.get(edge.source_id);
		if (!src) { src = []; by_source.set(edge.source_id, src); }
		src.push(edge);

		let tgt = by_target.get(edge.target_id);
		if (!tgt) { tgt = []; by_target.set(edge.target_id, tgt); }
		tgt.push(edge);
	}

	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	return { by_source, by_target, node_map };
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute context-aware question actions for a selected node.
 */
export function compute_question_actions(
	node_id: string,
	graph: SessionGraphPayload,
): QuestionAction[] {
	const idx = build_edge_index(graph);
	const node = idx.node_map.get(node_id);
	if (!node) return [];

	if (node.kind === "assistant_turn") {
		return compute_turn_actions(node_id, idx);
	}

	if (node.kind === "source_file" || node.kind === "directory") {
		return compute_file_actions(node_id, idx);
	}

	if (
		node.kind === "doc_file" ||
		node.kind === "doc_section"
	) {
		return compute_doc_actions(node_id, idx);
	}

	if (
		node.kind === "instruction_source" ||
		node.kind === "agents_doc" ||
		node.kind === "system_prompt" ||
		node.kind === "developer_prompt"
	) {
		return compute_instruction_actions(node_id, idx);
	}

	return [];
}

// ── Turn actions ────────────────────────────────────────────────────────────

function compute_turn_actions(turn_id: string, idx: EdgeIndex): QuestionAction[] {
	const actions: QuestionAction[] = [];

	// Always offer "show everything explored after this prompt"
	actions.push({
		id: "show_explored_after",
		label: "Show everything explored after this prompt",
		focus_mode: "path",
	});

	// Check if this turn has edits
	const tool_edges = (idx.by_source.get(turn_id) ?? []).filter(
		(e) => e.kind === "invoked_tool",
	);
	let has_edits = false;
	let has_docs = false;

	for (const te of tool_edges) {
		const file_edges = idx.by_source.get(te.target_id) ?? [];
		for (const fe of file_edges) {
			if (fe.kind === "edited" || fe.kind === "wrote") has_edits = true;
			if (fe.kind === "read") {
				const target = idx.node_map.get(fe.target_id);
				if (target?.kind === "doc_file" || target?.kind === "doc_section") {
					has_docs = true;
				}
			}
		}
	}

	if (has_edits) {
		actions.push({
			id: "show_edited_files_only",
			label: "Show only files eventually edited",
			focus_mode: "path",
			visibility: { only_edited_path: true },
		});
	}

	if (has_docs) {
		actions.push({
			id: "show_turn_docs",
			label: "Show docs explored in this turn",
			focus_mode: "influence",
		});
	}

	return actions;
}

// ── File actions ────────────────────────────────────────────────────────────

function compute_file_actions(file_id: string, idx: EdgeIndex): QuestionAction[] {
	const actions: QuestionAction[] = [];

	// Always offer arrival path
	actions.push({
		id: "show_arrival_path",
		label: "Show how the agent arrived here",
		focus_mode: "path",
	});

	// Check for upstream docs/instructions
	const incoming = idx.by_target.get(file_id) ?? [];
	let has_upstream_docs = false;
	let has_adjacent = false;

	for (const edge of incoming) {
		const source = idx.node_map.get(edge.source_id);
		if (source) {
			if (
				source.kind === "doc_file" ||
				source.kind === "doc_section" ||
				source.kind === "instruction_source" ||
				source.kind === "agents_doc"
			) {
				has_upstream_docs = true;
			}
		}
	}

	// Check for adjacent unexplored
	const outgoing = idx.by_source.get(file_id) ?? [];
	for (const edge of outgoing) {
		if (edge.kind === "adjacent_unexplored") {
			has_adjacent = true;
			break;
		}
	}

	if (has_upstream_docs) {
		actions.push({
			id: "show_upstream_docs",
			label: "Show upstream docs/instructions",
			focus_mode: "influence",
		});
	}

	if (has_adjacent) {
		actions.push({
			id: "show_adjacent_unexplored",
			label: "Show adjacent unexplored files",
			focus_mode: "neighborhood",
			visibility: { show_unexplored: true },
		});
	}

	// Check for downstream edits (file was read, then edits happened)
	let has_downstream_edits = false;
	for (const edge of outgoing) {
		if (edge.kind === "edited" || edge.kind === "wrote") {
			has_downstream_edits = true;
			break;
		}
	}
	if (has_downstream_edits) {
		actions.push({
			id: "show_downstream_edits",
			label: "Show downstream edits/writes",
			focus_mode: "path",
		});
	}

	return actions;
}

// ── Doc actions ─────────────────────────────────────────────────────────────

function compute_doc_actions(doc_id: string, idx: EdgeIndex): QuestionAction[] {
	const actions: QuestionAction[] = [];

	actions.push({
		id: "show_what_influenced",
		label: "Show what this influenced",
		focus_mode: "influence",
	});

	// Check for downstream reads/edits
	const outgoing = idx.by_source.get(doc_id) ?? [];
	let has_downstream_edits = false;

	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (target?.kind === "source_file") {
			const target_incoming = idx.by_target.get(target.id) ?? [];
			for (const te of target_incoming) {
				if (te.kind === "edited" || te.kind === "wrote") {
					has_downstream_edits = true;
					break;
				}
			}
		}
		if (has_downstream_edits) break;
	}

	if (has_downstream_edits) {
		actions.push({
			id: "show_downstream_edits",
			label: "Show downstream edits",
			focus_mode: "influence",
			visibility: { only_edited_path: true },
		});
	}

	return actions;
}

// ── Instruction actions ─────────────────────────────────────────────────────

function compute_instruction_actions(instruction_id: string, idx: EdgeIndex): QuestionAction[] {
	const actions: QuestionAction[] = [];

	actions.push({
		id: "show_what_influenced",
		label: "Show what this influenced",
		focus_mode: "influence",
	});

	// Check for downstream edits
	const outgoing = idx.by_source.get(instruction_id) ?? [];
	let has_downstream_edits = false;

	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (target?.kind === "source_file") {
			const target_incoming = idx.by_target.get(target.id) ?? [];
			for (const te of target_incoming) {
				if (te.kind === "edited" || te.kind === "wrote") {
					has_downstream_edits = true;
					break;
				}
			}
		}
		if (has_downstream_edits) break;
	}

	if (has_downstream_edits) {
		actions.push({
			id: "show_downstream_edits",
			label: "Show downstream edits",
			focus_mode: "influence",
			visibility: { only_edited_path: true },
		});
	}

	return actions;
}
