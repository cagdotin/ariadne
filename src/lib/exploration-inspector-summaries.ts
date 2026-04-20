/**
 * Inspector summary derivation from SessionGraphPayload.
 *
 * Pure functions that compute context-specific summary data
 * for the inspector pane based on what kind of node is selected.
 *
 * Uses pre-built edge indexes for O(1) lookups instead of
 * scanning all edges per query.
 */

import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";
import type { InsightSubgraph } from "@/lib/exploration-insight-graph-view-model";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";

// ── Types ───────────────────────────────────────────────────────────────────

export type NodeSummary = TurnSummary | FileSummary | InstructionSummary;

export interface ArrivalPath {
	action: string; // "read" | "edited" | "wrote"
	tool_node_id: string;
	tool_label: string;
	turn_node_id: string | null;
	turn_index: number | null;
	user_prompt_node_id: string | null;
	user_message: string | null;
}

export interface TurnSummary {
	kind: "turn";
	searches: number;
	files_explored: number;
	docs_explored: number;
	edits: number;
	writes: number;
}

export interface FileSummary {
	kind: "file";
	reads: number;
	edits: number;
	writes: number;
	upstream_docs: number;
	upstream_instructions: number;
	first_seen_turn: number | null;
	is_explored: boolean;
	nearby_unexplored_count: number;
}

export interface InstructionSummary {
	kind: "instruction";
	availability: string;
	downstream_files: number;
	downstream_edits: number;
}

// ── Edge indexes ─────────────────────────────────────────────────────────────

interface EdgeIndex {
	by_source: Map<string, GraphEdge[]>;
	by_target: Map<string, GraphEdge[]>;
	node_map: Map<string, GraphNode>;
}

/** Max hops when tracing arrival paths to prevent runaway on malformed graphs. */
const MAX_ARRIVAL_DEPTH = 5;

function build_edge_index(graph: SessionGraphPayload): EdgeIndex {
	const by_source = new Map<string, GraphEdge[]>();
	const by_target = new Map<string, GraphEdge[]>();
	const node_map = new Map<string, GraphNode>();

	for (const edge of graph.edges) {
		let src = by_source.get(edge.source_id);
		if (!src) {
			src = [];
			by_source.set(edge.source_id, src);
		}
		src.push(edge);

		let tgt = by_target.get(edge.target_id);
		if (!tgt) {
			tgt = [];
			by_target.set(edge.target_id, tgt);
		}
		tgt.push(edge);
	}

	for (const node of graph.nodes) {
		node_map.set(node.id, node);
	}

	return { by_source, by_target, node_map };
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute a contextual summary for a selected graph node.
 */
export function compute_node_summary(
	node_id: string,
	graph: SessionGraphPayload,
): NodeSummary | null {
	const idx = build_edge_index(graph);
	const node = idx.node_map.get(node_id);
	if (!node) return null;

	if (node.kind === "assistant_turn") {
		return compute_turn_summary(node_id, idx);
	}

	if (
		node.kind === "source_file" ||
		node.kind === "doc_file" ||
		node.kind === "doc_section"
	) {
		return compute_file_summary(node_id, idx);
	}

	if (
		node.kind === "instruction_source" ||
		node.kind === "agents_doc" ||
		node.kind === "system_prompt" ||
		node.kind === "developer_prompt"
	) {
		return compute_instruction_summary(node_id, idx);
	}

	return null;
}

// ── Turn summary ────────────────────────────────────────────────────────────

function compute_turn_summary(turn_id: string, idx: EdgeIndex): TurnSummary {
	let searches = 0;
	let edits = 0;
	let writes = 0;
	const explored_files = new Set<string>();
	const explored_docs = new Set<string>();

	const tool_edges = (idx.by_source.get(turn_id) ?? []).filter(
		(e) => e.kind === "invoked_tool",
	);

	for (const te of tool_edges) {
		const tool = idx.node_map.get(te.target_id);
		if (!tool) continue;

		if (tool.kind === "search_query") {
			searches++;
			continue;
		}

		const file_edges = (idx.by_source.get(tool.id) ?? []).filter(
			(e) => e.kind === "read" || e.kind === "edited" || e.kind === "wrote",
		);

		for (const fe of file_edges) {
			const target = idx.node_map.get(fe.target_id);
			if (!target) continue;

			if (target.kind === "doc_file" || target.kind === "doc_section") {
				explored_docs.add(fe.target_id);
			} else {
				explored_files.add(fe.target_id);
			}

			if (fe.kind === "edited") edits++;
			if (fe.kind === "wrote") writes++;
		}
	}

	return {
		kind: "turn",
		searches,
		files_explored: explored_files.size,
		docs_explored: explored_docs.size,
		edits,
		writes,
	};
}

// ── File summary ────────────────────────────────────────────────────────────

function compute_file_summary(file_id: string, idx: EdgeIndex): FileSummary {
	let reads = 0;
	let edits = 0;
	let writes = 0;
	let upstream_docs = 0;
	let upstream_instructions = 0;

	const file_node = idx.node_map.get(file_id);
	const is_explored = file_node?.availability === "available_observed";

	const incoming = idx.by_target.get(file_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind === "read") reads++;
		if (edge.kind === "edited") edits++;
		if (edge.kind === "wrote") writes++;

		const source = idx.node_map.get(edge.source_id);
		if (source) {
			if (source.kind === "doc_file" || source.kind === "doc_section") {
				upstream_docs++;
			}
			if (
				source.kind === "instruction_source" ||
				source.kind === "agents_doc"
			) {
				upstream_instructions++;
			}
		}
	}

	// Find first seen turn
	let first_seen_turn: number | null = null;
	for (const edge of incoming) {
		if (edge.kind !== "read" && edge.kind !== "edited" && edge.kind !== "wrote")
			continue;

		const tool = idx.node_map.get(edge.source_id);
		if (!tool) continue;

		// Walk up to find the turn
		const turn_edges = (idx.by_target.get(tool.id) ?? []).filter(
			(e) => e.kind === "invoked_tool",
		);
		for (const turn_edge of turn_edges) {
			const turn = idx.node_map.get(turn_edge.source_id);
			if (turn?.kind === "assistant_turn") {
				const ti = (turn.metadata?.turn_index as number) ?? null;
				if (ti !== null && (first_seen_turn === null || ti < first_seen_turn)) {
					first_seen_turn = ti;
				}
			}
		}
	}

	// Count nearby unexplored neighbors
	let nearby_unexplored_count = 0;
	const outgoing = idx.by_source.get(file_id) ?? [];
	for (const edge of outgoing) {
		if (edge.kind === "adjacent_unexplored") {
			nearby_unexplored_count++;
		}
	}

	return {
		kind: "file",
		reads,
		edits,
		writes,
		upstream_docs,
		upstream_instructions,
		first_seen_turn,
		is_explored,
		nearby_unexplored_count,
	};
}

// ── Instruction summary ─────────────────────────────────────────────────────

function compute_instruction_summary(
	instruction_id: string,
	idx: EdgeIndex,
): InstructionSummary {
	const node = idx.node_map.get(instruction_id);
	let downstream_files = 0;
	let downstream_edits = 0;

	const outgoing = idx.by_source.get(instruction_id) ?? [];

	for (const edge of outgoing) {
		const target = idx.node_map.get(edge.target_id);
		if (!target) continue;

		if (target.kind === "source_file") {
			downstream_files++;
			const was_edited = (idx.by_target.get(target.id) ?? []).some(
				(e) => e.kind === "edited" || e.kind === "wrote",
			);
			if (was_edited) downstream_edits++;
		}
	}

	return {
		kind: "instruction",
		availability: node?.availability ?? "unknown",
		downstream_files,
		downstream_edits,
	};
}

// ── Arrival paths ───────────────────────────────────────────────────────────

/**
 * Compute the full arrival paths for a node: traces back through
 * tool_call → assistant_turn → user_prompt to show how each
 * read/edit/write of this node was initiated.
 *
 * Returns one entry per tool interaction, sorted by turn index.
 * Uses edge indexes for O(1) lookups and a depth guard to prevent
 * runaway traversal on malformed graphs.
 */
export function compute_arrival_paths(
	node_id: string,
	graph: SessionGraphPayload,
): ArrivalPath[] {
	const idx = build_edge_index(graph);
	const paths: ArrivalPath[] = [];

	const incoming = idx.by_target.get(node_id) ?? [];

	for (const edge of incoming) {
		if (edge.kind !== "read" && edge.kind !== "edited" && edge.kind !== "wrote")
			continue;

		const tool = idx.node_map.get(edge.source_id);
		if (!tool) continue;

		// Walk up with depth guard: find the turn that invoked this tool
		let turn_node_id: string | null = null;
		let turn_index: number | null = null;
		let user_prompt_node_id: string | null = null;
		let user_message: string | null = null;

		let current_id = tool.id;
		let depth = 0;

		while (depth < MAX_ARRIVAL_DEPTH) {
			const parent_edges = (idx.by_target.get(current_id) ?? []).filter(
				(e) => e.kind === "invoked_tool",
			);
			if (parent_edges.length === 0) break;

			const turn = idx.node_map.get(parent_edges[0].source_id);
			if (turn?.kind === "assistant_turn") {
				turn_node_id = turn.id;
				turn_index = (turn.metadata?.turn_index as number) ?? null;

				// Find the user_prompt for this turn
				if (turn_index !== null) {
					const user_prompt = graph.nodes.find(
						(n) =>
							n.kind === "user_prompt" &&
							(n.metadata?.turn_index as number) === turn_index,
					);
					if (user_prompt) {
						user_prompt_node_id = user_prompt.id;
						user_message =
							(user_prompt.metadata?.text as string) ??
							user_prompt.label.replace(/^User:\s*/, "");
					}
				}
				break;
			}

			current_id = parent_edges[0].source_id;
			depth++;
		}

		paths.push({
			action: edge.kind,
			tool_node_id: tool.id,
			tool_label: tool.label,
			turn_node_id,
			turn_index,
			user_prompt_node_id,
			user_message,
		});
	}

	// Sort by turn index
	paths.sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0));

	return paths;
}

// ── Narrative summaries ─────────────────────────────────────────────────────

function pluralize(n: number, singular: string, plural?: string): string {
	return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Compute a short narrative sentence summarizing a selected node.
 * Returns null for unsupported node kinds.
 *
 * Examples:
 * - "This prompt led to 1 search, 2 files explored, and 1 edit."
 * - "Edited after 1 read. 1 upstream doc."
 * - "Ambient instruction source influencing 2 downstream files, 1 edited."
 */
export function compute_narrative_summary(
	node_id: string,
	graph: SessionGraphPayload,
): string | null {
	const idx = build_edge_index(graph);
	const node = idx.node_map.get(node_id);
	if (!node) return null;

	if (node.kind === "assistant_turn") {
		const summary = compute_turn_summary(node_id, idx);
		const parts: string[] = [];
		if (summary.searches > 0)
			parts.push(pluralize(summary.searches, "search", "searches"));
		if (summary.files_explored > 0)
			parts.push(`${pluralize(summary.files_explored, "file")} explored`);
		if (summary.docs_explored > 0)
			parts.push(`${pluralize(summary.docs_explored, "doc")} read`);
		if (summary.edits > 0) parts.push(pluralize(summary.edits, "edit"));
		if (summary.writes > 0) parts.push(pluralize(summary.writes, "write"));

		if (parts.length === 0) return "This prompt led to no observable actions.";
		return `This prompt led to ${join_parts(parts)}.`;
	}

	if (
		node.kind === "source_file" ||
		node.kind === "doc_file" ||
		node.kind === "doc_section"
	) {
		const summary = compute_file_summary(node_id, idx);
		const parts: string[] = [];

		if (summary.edits > 0 && summary.writes > 0) {
			parts.push(`Edited and written`);
		} else if (summary.edits > 0) {
			parts.push(`Edited`);
		} else if (summary.writes > 0) {
			parts.push(`Written`);
		} else if (summary.reads > 0) {
			parts.push(`Read ${pluralize(summary.reads, "time")}`);
		} else {
			parts.push("Not directly accessed");
		}

		if (summary.upstream_docs > 0) {
			parts.push(`${pluralize(summary.upstream_docs, "upstream doc")}`);
		}
		if (summary.upstream_instructions > 0) {
			parts.push(
				`${pluralize(summary.upstream_instructions, "upstream instruction")}`,
			);
		}
		if (summary.nearby_unexplored_count > 0) {
			parts.push(
				`${pluralize(summary.nearby_unexplored_count, "unexplored neighbor")}`,
			);
		}

		return `${parts.join(". ")}.`;
	}

	if (
		node.kind === "instruction_source" ||
		node.kind === "agents_doc" ||
		node.kind === "system_prompt" ||
		node.kind === "developer_prompt"
	) {
		const summary = compute_instruction_summary(node_id, idx);
		const availability_label =
			summary.availability === "available_observed"
				? "Observed"
				: summary.availability === "available_ambient"
					? "Ambient"
					: summary.availability === "derived_inferred"
						? "Inferred"
						: "Unknown";

		const parts: string[] = [`${availability_label} instruction source`];

		if (summary.downstream_files > 0) {
			parts.push(
				`influencing ${pluralize(summary.downstream_files, "downstream file")}`,
			);
			if (summary.downstream_edits > 0) {
				parts.push(
					`${pluralize(summary.downstream_edits, "")} edited`
						.replace("0 ", "")
						.replace("1 ", "1 "),
				);
			}
		} else {
			parts.push("no downstream file influence detected");
		}

		return `${parts.join(", ")}.`;
	}

	return null;
}

function join_parts(parts: string[]): string {
	if (parts.length <= 1) return parts[0] ?? "";
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

// ── Temporal narrative ──────────────────────────────────────────────────────

/**
 * Compute a temporal context sentence based on the active temporal lens.
 *
 * Returns null for full_session or when the lens doesn't add useful context.
 */
export function compute_temporal_narrative(
	node_id: string,
	graph: SessionGraphPayload,
	lens: TemporalLens,
): string | null {
	if (lens.kind === "full_session") return null;

	const idx = build_edge_index(graph);
	const node = idx.node_map.get(node_id);
	if (!node) return null;

	if (lens.kind === "built_so_far") {
		if (node.kind === "assistant_turn" || node.kind === "user_prompt") {
			const turn_index = (node.metadata?.turn_index as number) ?? null;
			if (turn_index !== null) {
				return `Showing cumulative explored state through Turn ${turn_index + 1}.`;
			}
		}
		return `Showing state built so far by end of Turn ${lens.selected_turn_index + 1}.`;
	}

	if (lens.kind === "arrival_path") {
		const summary = compute_file_summary_internal(node_id, idx);
		if (!summary) return null;

		const parts: string[] = [];
		if (summary.first_seen_turn !== null) {
			parts.push(`First seen in Turn ${summary.first_seen_turn + 1}`);
		}

		const arrival_count = compute_arrival_paths(node_id, graph).length;
		if (arrival_count > 0) {
			parts.push(`reached via ${pluralize(arrival_count, "interaction")}`);
		}

		if (parts.length === 0) return null;
		return `${parts.join(", ")}.`;
	}

	return null;
}

function compute_file_summary_internal(
	file_id: string,
	idx: EdgeIndex,
): FileSummary | null {
	const node = idx.node_map.get(file_id);
	if (!node) return null;

	if (
		node.kind !== "source_file" &&
		node.kind !== "doc_file" &&
		node.kind !== "doc_section"
	)
		return null;

	return compute_file_summary(file_id, idx);
}

// ── Insight summary (graph-mode) ────────────────────────────────────────────

export interface InsightSummary {
	/** Readable route string, e.g. "turn_0 → tool_read → file_a" */
	primary_path_label: string;
	/** Labels of supporting contributor nodes */
	supporting_labels: string[];
	/** Labels of structural reference nodes */
	structural_ref_labels: string[];
	/** Labels of downstream effect nodes */
	downstream_labels: string[];
}

/**
 * Derive a structured summary from an insight subgraph.
 *
 * Used by the inspector when Graph mode is active to provide
 * structured explanation text alongside the visual graph.
 */
export function compute_insight_summary(
	insight: InsightSubgraph,
): InsightSummary | null {
	if (!insight.focal_node_id || insight.nodes.length === 0) return null;

	// Build primary path label by tracing edges
	const primary_nodes = insight.nodes.filter((n) => n.role === "primary_path");
	const primary_edges = insight.edges.filter((e) => e.role === "primary_path");

	// Build adjacency for primary path to create an ordered chain
	const primary_path_label = build_path_chain(
		primary_nodes.map((n) => ({ id: n.id, label: n.node.label })),
		primary_edges,
		insight.focal_node_id,
	);

	const supporting_labels = insight.nodes
		.filter((n) => n.role === "supporting")
		.map((n) => n.node.label);

	const structural_ref_labels = insight.nodes
		.filter((n) => n.role === "structural_ref")
		.map((n) => n.node.label);

	const downstream_labels = insight.nodes
		.filter((n) => n.role === "downstream")
		.map((n) => n.node.label);

	return {
		primary_path_label,
		supporting_labels,
		structural_ref_labels,
		downstream_labels,
	};
}

/**
 * Build a readable chain string from path nodes and edges.
 * Attempts topological ordering; falls back to label join.
 */
function build_path_chain(
	nodes: Array<{ id: string; label: string }>,
	edges: Array<{ source_id: string; target_id: string }>,
	_focal_id: string,
): string {
	if (nodes.length === 0) return "";
	if (nodes.length === 1) return nodes[0].label;

	// Build adjacency: source → targets
	const outgoing = new Map<string, string[]>();
	const incoming_count = new Map<string, number>();

	for (const n of nodes) {
		outgoing.set(n.id, []);
		incoming_count.set(n.id, 0);
	}

	const node_ids = new Set(nodes.map((n) => n.id));
	for (const e of edges) {
		if (node_ids.has(e.source_id) && node_ids.has(e.target_id)) {
			outgoing.get(e.source_id)?.push(e.target_id);
			incoming_count.set(
				e.target_id,
				(incoming_count.get(e.target_id) ?? 0) + 1,
			);
		}
	}

	// Find roots (no incoming edges within primary path)
	const roots = nodes.filter((n) => (incoming_count.get(n.id) ?? 0) === 0);

	if (roots.length === 0) {
		// Cycle or no clear root — just join labels
		return nodes.map((n) => n.label).join(" → ");
	}

	// Walk from first root to build chain
	const chain: string[] = [];
	const visited = new Set<string>();
	let current = roots[0].id;

	while (current && !visited.has(current)) {
		visited.add(current);
		const node = nodes.find((n) => n.id === current);
		if (node) chain.push(node.label);

		const targets = outgoing.get(current) ?? [];
		current = targets[0]; // follow first child
	}

	return chain.join(" → ");
}
