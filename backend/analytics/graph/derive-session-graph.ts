/**
 * Session graph derivation — transforms raw replay entries into a
 * SessionGraphPayload with typed nodes, edges, evidence, and provenance.
 *
 * This is the source-of-truth derivation for the graph IR.
 */

import * as path from "node:path";
import {
	is_discovery_tool,
	is_doc_path,
} from "../../../contracts/graph/tool-classification.js";
import type {
	AvailabilityState,
	Confidence,
	GraphEdge,
	GraphEdgeKind,
	GraphEvidence,
	GraphNode,
	GraphNodeKind,
	SessionGraphPayload,
} from "../../../contracts/graph/types.js";
import type {
	SessionEntry,
	SessionHeader,
} from "../../../contracts/sessions/replay.js";
import { make_file_node_id, normalize_graph_path } from "./graph-ids.js";

// ── Replay type helpers ─────────────────────────────────────────────────────

type MessageEntry = Extract<SessionEntry, { type: "message" }>;
type ModelChangeEntry = Extract<SessionEntry, { type: "model_change" }>;
type ThinkingLevelChangeEntry = Extract<
	SessionEntry,
	{ type: "thinking_level_change" }
>;
type CustomMessageEntry = Extract<SessionEntry, { type: "custom_message" }>;
type MessageData = MessageEntry["message"];
type ToolCallBlock = Extract<
	Extract<MessageData, { role: "assistant" }>["content"][number],
	{ type: "toolCall" }
>;

// ── Constants ────────────────────────────────────────────────────────────────

const NOTABLE_CUSTOM_MESSAGES = new Set([
	"cmux-detected",
	"expertise-loaded",
	"track-context-loaded",
]);

const SEARCH_QUERY_TERM_STOPWORDS = new Set([
	"rg",
	"grep",
	"find",
	"fd",
	"bash",
	"sed",
	"cat",
	"head",
	"tail",
	"src",
	"tests",
	"test",
	"lib",
	"components",
	"component",
	"docs",
	"doc",
	"file",
	"files",
	"path",
	"json",
	"tsx",
	"ts",
	"md",
	"read",
	"write",
	"edit",
	"graph",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, max_len: number): string {
	if (text.length <= max_len) return text;
	return `${text.substring(0, max_len)}\u2026`;
}

function extract_user_message_text(message: MessageData): string {
	if (message.role !== "user") return "";
	const content = message.content;
	if (typeof content === "string") return content.trim();
	const parts: string[] = [];
	for (const block of content) {
		if (block.type === "text") parts.push(block.text);
	}
	return parts.join(" ").trim();
}

function is_agents_md_path(file_path: string): boolean {
	const base = path.basename(file_path).toUpperCase();
	return base === "AGENTS.MD";
}

function make_evidence(
	kind: GraphEvidence["kind"],
	source_ref: string | null,
	detail: string | null = null,
): GraphEvidence {
	return { kind, source_ref, detail };
}

function make_node(
	id: string,
	kind: GraphNodeKind,
	label: string,
	availability: AvailabilityState,
	confidence: Confidence,
	evidence: GraphEvidence[],
	metadata?: Record<string, unknown>,
): GraphNode {
	return { id, kind, label, availability, confidence, evidence, metadata };
}

function make_edge(
	source_id: string,
	target_id: string,
	kind: GraphEdgeKind,
	availability: AvailabilityState,
	confidence: Confidence,
	evidence: GraphEvidence[],
	label: string | null = null,
): GraphEdge {
	return {
		source_id,
		target_id,
		kind,
		availability,
		confidence,
		evidence,
		label,
	};
}

interface ToolResultInfo {
	tool_call_id: string;
	entry_id: string | null;
	tool_name: string | null;
	text: string;
	is_error: boolean;
}

interface TurnToolInfo {
	node_id: string;
	node_kind: GraphNodeKind;
	tool_name: string;
	tool_index: number;
	turn_index: number;
	entry_id: string | null;
	tool_call_id: string | null;
	is_discovery: boolean;
	query: string | null;
	file_path: string | null;
	relative_path: string | null;
	artifact_node_id: string | null;
	action_edge_kind: GraphEdgeKind | null;
	result_entry_id: string | null;
	result_text: string;
	result_is_error: boolean;
}

interface TextArtifactMatch {
	confidence: Confidence;
	detail: string;
	match_kind: "exact_path" | "unique_basename";
	specificity: number;
}

interface SearchQueryAffinityMatch {
	confidence: "medium";
	detail: string;
	specificity: number;
}

type InfluenceBasis =
	| "same_artifact_followup"
	| "artifact_reference_exact_path"
	| "artifact_reference_unique_basename"
	| "search_result_exact_path"
	| "search_result_unique_basename"
	| "search_query_term";

interface InfluenceCandidate {
	source: TurnToolInfo;
	confidence: Confidence;
	detail: string;
	evidence_source_ref: string | null;
	basis: InfluenceBasis;
	specificity: number;
}

function extract_tool_result_text(message: MessageData): string {
	if (message.role !== "toolResult") return "";

	const content = message.content as unknown;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const item of content) {
		if (
			typeof item === "object" &&
			item !== null &&
			"type" in item &&
			(item as { type?: unknown }).type === "text" &&
			"text" in item &&
			typeof (item as { text?: unknown }).text === "string"
		) {
			parts.push((item as { text: string }).text);
		}
	}
	return parts.join("\n");
}

function collect_turn_tool_results(
	entries: MessageEntry[],
): Map<string, ToolResultInfo> {
	const results = new Map<string, ToolResultInfo>();

	for (const entry of entries) {
		if (entry.message.role !== "toolResult") continue;
		if (typeof entry.message.toolCallId !== "string") continue;

		results.set(entry.message.toolCallId, {
			tool_call_id: entry.message.toolCallId,
			entry_id: entry.id,
			tool_name: entry.message.toolName ?? null,
			text: extract_tool_result_text(entry.message),
			is_error: entry.message.isError ?? false,
		});
	}

	return results;
}

function escape_regex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function has_bounded_match(text: string, candidate: string): boolean {
	if (!candidate.trim()) return false;
	const pattern = new RegExp(
		`(^|[^A-Za-z0-9_./-])${escape_regex(candidate)}($|[^A-Za-z0-9_./-])`,
		"m",
	);
	return pattern.test(text);
}

function get_confidence_rank(confidence: Confidence): number {
	if (confidence === "high") return 2;
	if (confidence === "medium") return 1;
	return 0;
}

function describe_action_edge_kind(edge_kind: GraphEdgeKind | null): string {
	if (edge_kind === "edited") return "edit";
	if (edge_kind === "wrote") return "write";
	return "read";
}

function find_text_artifact_match(
	text: string,
	artifact_relative_path: string,
	artifact_file_path: string | null,
	project_path: string,
	basename_counts: Map<string, number>,
	detail_prefix: string,
): TextArtifactMatch | null {
	const normalized_text = text.replace(/\\/g, "/").trim();
	if (!normalized_text) return null;

	const normalized_relative_path = artifact_relative_path.replace(/\\/g, "/");
	const exact_candidates = new Set<string>([
		normalized_relative_path,
		`./${normalized_relative_path}`,
	]);

	if (artifact_file_path) {
		exact_candidates.add(artifact_file_path.replace(/\\/g, "/"));
	}
	if (project_path && normalized_relative_path) {
		exact_candidates.add(
			path.join(project_path, normalized_relative_path).replace(/\\/g, "/"),
		);
	}

	for (const candidate of exact_candidates) {
		if (!candidate) continue;
		if (!has_bounded_match(normalized_text, candidate)) continue;
		return {
			confidence: "high",
			match_kind: "exact_path",
			specificity: normalized_relative_path.length,
			detail: `${detail_prefix} explicitly mentioned ${normalized_relative_path}`,
		};
	}

	const basename = path.basename(normalized_relative_path);
	if (!basename) return null;
	if ((basename_counts.get(basename) ?? 0) !== 1) return null;
	if (!has_bounded_match(normalized_text, basename)) return null;

	return {
		confidence: "medium",
		match_kind: "unique_basename",
		specificity: basename.length,
		detail: `${detail_prefix} mentioned unique basename ${basename} matching ${normalized_relative_path}`,
	};
}

function expand_search_query_term(raw_term: string): string[] {
	const trimmed = raw_term.trim();
	if (!trimmed) return [];

	const terms = new Set<string>([trimmed]);
	if (trimmed.includes("-") || trimmed.includes("_")) {
		for (const part of trimmed.split(/[-_]+/)) {
			if (part) terms.add(part);
		}
	}

	const camel_split = trimmed
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
	for (const part of camel_split) {
		terms.add(part);
	}

	return [...terms];
}

function extract_search_query_terms(query: string): string[] {
	const normalized_query = query.replace(/\\/g, "/").trim();
	if (!normalized_query) return [];

	const quoted_sources = [
		...normalized_query.matchAll(/"([^"]+)"/g),
		...normalized_query.matchAll(/'([^']+)'/g),
	]
		.map((match) => match[1]?.trim() ?? "")
		.filter(Boolean);
	const sources =
		quoted_sources.length > 0 ? quoted_sources : [normalized_query];
	const terms = new Set<string>();

	for (const source of sources) {
		const raw_terms = source.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
		for (const raw_term of raw_terms) {
			for (const expanded_term of expand_search_query_term(raw_term)) {
				const normalized_term = expanded_term.toLowerCase();
				if (normalized_term.length < 4) continue;
				if (SEARCH_QUERY_TERM_STOPWORDS.has(normalized_term)) continue;
				terms.add(normalized_term);
			}
		}
	}

	return [...terms].sort((left, right) => {
		if (left.length !== right.length) return right.length - left.length;
		return left.localeCompare(right);
	});
}

function find_search_query_affinity(
	query: string,
	artifact_relative_path: string,
): SearchQueryAffinityMatch | null {
	const normalized_relative_path = artifact_relative_path
		.replace(/\\/g, "/")
		.toLowerCase();
	const matched_terms = extract_search_query_terms(query).filter((term) =>
		normalized_relative_path.includes(term),
	);
	if (matched_terms.length === 0) return null;

	const best_term = matched_terms[0];
	if (best_term.length < 8 && matched_terms.length < 2) return null;

	return {
		confidence: "medium",
		specificity: best_term.length,
		detail: `search query terms ${matched_terms.slice(0, 2).join(", ")} matched ${artifact_relative_path}`,
	};
}

function get_influence_basis_rank(basis: InfluenceBasis): number {
	if (basis === "same_artifact_followup") return 0;
	if (basis === "artifact_reference_exact_path") return 1;
	if (basis === "search_result_exact_path") return 2;
	if (basis === "artifact_reference_unique_basename") return 3;
	if (basis === "search_result_unique_basename") return 4;
	return 5;
}

function compare_influence_candidates(
	left: InfluenceCandidate,
	right: InfluenceCandidate,
): number {
	const confidence_cmp =
		get_confidence_rank(right.confidence) -
		get_confidence_rank(left.confidence);
	if (confidence_cmp !== 0) return confidence_cmp;

	const basis_cmp =
		get_influence_basis_rank(left.basis) -
		get_influence_basis_rank(right.basis);
	if (basis_cmp !== 0) return basis_cmp;

	const specificity_cmp = right.specificity - left.specificity;
	if (specificity_cmp !== 0) return specificity_cmp;

	return 0;
}

function register_influence_candidate(
	candidates_by_source: Map<string, InfluenceCandidate>,
	candidate: InfluenceCandidate,
): void {
	const existing = candidates_by_source.get(candidate.source.node_id);
	if (!existing || compare_influence_candidates(candidate, existing) < 0) {
		candidates_by_source.set(candidate.source.node_id, candidate);
	}
}

function infer_same_turn_search_lineage(
	turn: RawTurn,
	turn_tools: TurnToolInfo[],
	project_path: string,
	edges: GraphEdge[],
): void {
	const lineage_edge_keys = new Set<string>();
	const basename_counts = new Map<string, number>();
	const action_tools = turn_tools.filter(
		(
			tool,
		): tool is TurnToolInfo & {
			relative_path: string;
			artifact_node_id: string;
			action_edge_kind: GraphEdgeKind;
		} =>
			tool.relative_path !== null &&
			tool.artifact_node_id !== null &&
			tool.action_edge_kind !== null,
	);

	for (const action of action_tools) {
		const basename = path.basename(action.relative_path);
		basename_counts.set(basename, (basename_counts.get(basename) ?? 0) + 1);
	}

	for (const action of action_tools) {
		const influence_candidates = new Map<string, InfluenceCandidate>();
		let latest_search_candidate_index: number | null = null;

		for (const prior_tool of turn_tools) {
			if (prior_tool.tool_index >= action.tool_index) continue;
			if (!prior_tool.is_discovery) continue;
			if (prior_tool.result_is_error) continue;

			const search_match = find_text_artifact_match(
				prior_tool.result_text,
				action.relative_path,
				action.file_path,
				project_path,
				basename_counts,
				"search result",
			);
			if (search_match) {
				latest_search_candidate_index = Math.max(
					latest_search_candidate_index ?? Number.NEGATIVE_INFINITY,
					prior_tool.tool_index,
				);
				const discovered_key = `${prior_tool.node_id}|discovered|${action.artifact_node_id}`;
				if (!lineage_edge_keys.has(discovered_key)) {
					edges.push(
						make_edge(
							prior_tool.node_id,
							action.artifact_node_id,
							"discovered",
							"derived_inferred",
							search_match.confidence,
							[
								make_evidence(
									"observed_replay",
									prior_tool.result_entry_id ?? prior_tool.entry_id,
									search_match.detail,
								),
								make_evidence(
									"observed_tool_args",
									action.entry_id,
									`later ${describe_action_edge_kind(action.action_edge_kind)} touched ${action.relative_path} in turn ${turn.index + 1}`,
								),
							],
						),
					);
					lineage_edge_keys.add(discovered_key);
				}

				register_influence_candidate(influence_candidates, {
					source: prior_tool,
					confidence: search_match.confidence,
					detail: search_match.detail,
					evidence_source_ref:
						prior_tool.result_entry_id ?? prior_tool.entry_id,
					basis:
						search_match.match_kind === "exact_path"
							? "search_result_exact_path"
							: "search_result_unique_basename",
					specificity: search_match.specificity,
				});
				continue;
			}

			if (!prior_tool.query) continue;
			const query_affinity = find_search_query_affinity(
				prior_tool.query,
				action.relative_path,
			);
			if (!query_affinity) continue;

			latest_search_candidate_index = Math.max(
				latest_search_candidate_index ?? Number.NEGATIVE_INFINITY,
				prior_tool.tool_index,
			);
			register_influence_candidate(influence_candidates, {
				source: prior_tool,
				confidence: query_affinity.confidence,
				detail: query_affinity.detail,
				evidence_source_ref: prior_tool.entry_id,
				basis: "search_query_term",
				specificity: query_affinity.specificity,
			});
		}

		for (const prior_tool of turn_tools) {
			if (prior_tool.tool_index >= action.tool_index) continue;
			if (prior_tool.is_discovery) continue;
			if (prior_tool.action_edge_kind === null) continue;
			if (
				latest_search_candidate_index !== null &&
				prior_tool.tool_index < latest_search_candidate_index
			) {
				continue;
			}

			if (prior_tool.artifact_node_id === action.artifact_node_id) {
				register_influence_candidate(influence_candidates, {
					source: prior_tool,
					confidence: action.action_edge_kind === "read" ? "medium" : "high",
					detail: `earlier ${describe_action_edge_kind(prior_tool.action_edge_kind)} already targeted ${action.relative_path}`,
					evidence_source_ref: prior_tool.entry_id,
					basis: "same_artifact_followup",
					specificity: action.relative_path.length,
				});
			}

			if (prior_tool.result_is_error) continue;
			const reference_match = find_text_artifact_match(
				prior_tool.result_text,
				action.relative_path,
				action.file_path,
				project_path,
				basename_counts,
				`earlier ${describe_action_edge_kind(prior_tool.action_edge_kind)} result`,
			);
			if (!reference_match) continue;

			register_influence_candidate(influence_candidates, {
				source: prior_tool,
				confidence: reference_match.confidence,
				detail: reference_match.detail,
				evidence_source_ref: prior_tool.result_entry_id ?? prior_tool.entry_id,
				basis:
					reference_match.match_kind === "exact_path"
						? "artifact_reference_exact_path"
						: "artifact_reference_unique_basename",
				specificity: reference_match.specificity,
			});
		}

		const ranked_candidates = [...influence_candidates.values()].sort(
			compare_influence_candidates,
		);
		if (ranked_candidates.length === 0) continue;
		if (
			ranked_candidates.length > 1 &&
			compare_influence_candidates(
				ranked_candidates[0],
				ranked_candidates[1],
			) === 0
		) {
			continue;
		}

		const best = ranked_candidates[0];
		const influenced_key = `${best.source.node_id}|influenced_by|${action.node_id}`;
		if (lineage_edge_keys.has(influenced_key)) continue;

		edges.push(
			make_edge(
				best.source.node_id,
				action.node_id,
				"influenced_by",
				"derived_inferred",
				best.confidence,
				[
					make_evidence(
						best.evidence_source_ref ? "observed_replay" : "observed_tool_args",
						best.evidence_source_ref,
						best.detail,
					),
					make_evidence(
						"observed_tool_args",
						action.entry_id,
						`later ${describe_action_edge_kind(action.action_edge_kind)} targeted ${action.relative_path}`,
					),
					make_evidence(
						"inferred_temporal",
						turn.user_entry_id,
						`same-turn causal attribution (${best.basis})`,
					),
				],
			),
		);
		lineage_edge_keys.add(influenced_key);
	}
}

// ── Turn grouping ────────────────────────────────────────────────────────────

interface RawTurn {
	index: number;
	entries: MessageEntry[];
	user_text: string;
	user_timestamp: string;
	user_entry_id: string | null;
}

function is_message_entry(entry: SessionEntry): entry is MessageEntry {
	return entry.type === "message" && "message" in entry;
}

function group_into_turns(entries: SessionEntry[]): RawTurn[] {
	const turns: RawTurn[] = [];
	let current: RawTurn | null = null;

	for (const entry of entries) {
		if (!is_message_entry(entry)) continue;
		if (entry.message.role === "user") {
			current = {
				index: turns.length,
				entries: [entry],
				user_text: extract_user_message_text(entry.message),
				user_timestamp: entry.timestamp,
				user_entry_id: entry.id,
			};
			turns.push(current);
		} else if (current) {
			current.entries.push(entry);
		}
	}
	return turns;
}

// ── Main derivation ──────────────────────────────────────────────────────────

export function derive_session_graph(
	session_id: string,
	entries: SessionEntry[],
	header: SessionHeader | null,
): SessionGraphPayload {
	const project_path = header?.cwd ?? "";
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const node_ids = new Set<string>();

	function add_node(node: GraphNode): void {
		if (!node_ids.has(node.id)) {
			nodes.push(node);
			node_ids.add(node.id);
		}
	}

	// ── Session root node ────────────────────────────────────────────────
	const session_node_id = `session_${session_id}`;
	add_node(
		make_node(
			session_node_id,
			"session",
			`Session ${session_id}`,
			"available_observed",
			"high",
			[make_evidence("observed_replay", session_id, "session root")],
			{ session_id },
		),
	);

	// ── Session framing cluster ──────────────────────────────────────────
	const framing_id = `framing_${session_id}`;
	add_node(
		make_node(
			framing_id,
			"session_framing",
			"Session Framing",
			"available_observed",
			"high",
			[make_evidence("observed_replay", session_id, "synthetic framing group")],
		),
	);
	edges.push(
		make_edge(
			session_node_id,
			framing_id,
			"framed_by",
			"available_observed",
			"high",
			[make_evidence("observed_replay", session_id)],
		),
	);

	// ── Framing: cwd ─────────────────────────────────────────────────────
	if (header?.cwd) {
		const cwd_id = `framing_cwd`;
		add_node(
			make_node(
				cwd_id,
				"runtime_context",
				`cwd: ${header.cwd}`,
				"available_observed",
				"high",
				[
					make_evidence(
						"observed_replay",
						header.id ?? session_id,
						"session header cwd",
					),
				],
				{ cwd: header.cwd },
			),
		);
		edges.push(
			make_edge(framing_id, cwd_id, "framed_by", "available_observed", "high", [
				make_evidence("observed_replay", header.id ?? session_id),
			]),
		);
	}

	// ── Framing: model/thinking/custom from entries ──────────────────────
	for (const entry of entries) {
		if (entry.type === "model_change") {
			const model_change_entry = entry as ModelChangeEntry;
			const mc_id = `framing_model_${model_change_entry.id}`;
			add_node(
				make_node(
					mc_id,
					"runtime_context",
					`Model: ${model_change_entry.modelId} (${model_change_entry.provider})`,
					"available_observed",
					"high",
					[
						make_evidence(
							"observed_replay",
							model_change_entry.id,
							"model_change entry",
						),
					],
					{
						provider: model_change_entry.provider,
						model_id: model_change_entry.modelId,
					},
				),
			);
			edges.push(
				make_edge(
					framing_id,
					mc_id,
					"framed_by",
					"available_observed",
					"high",
					[make_evidence("observed_replay", model_change_entry.id)],
				),
			);
		}

		if (entry.type === "thinking_level_change") {
			const thinking_level_change_entry = entry as ThinkingLevelChangeEntry;
			const tl_id = `framing_thinking_${thinking_level_change_entry.id}`;
			add_node(
				make_node(
					tl_id,
					"runtime_context",
					`Thinking: ${thinking_level_change_entry.thinkingLevel}`,
					"available_observed",
					"high",
					[
						make_evidence(
							"observed_replay",
							thinking_level_change_entry.id,
							"thinking_level_change entry",
						),
					],
					{ thinking_level: thinking_level_change_entry.thinkingLevel },
				),
			);
			edges.push(
				make_edge(
					framing_id,
					tl_id,
					"framed_by",
					"available_observed",
					"high",
					[make_evidence("observed_replay", thinking_level_change_entry.id)],
				),
			);
		}

		if (entry.type === "custom_message") {
			const custom_message_entry = entry as CustomMessageEntry;
			const custom_type = custom_message_entry.customType;
			if (NOTABLE_CUSTOM_MESSAGES.has(custom_type)) {
				const cm_id = `framing_custom_${custom_message_entry.id}`;
				add_node(
					make_node(
						cm_id,
						"runtime_context",
						`Runtime: ${custom_type}`,
						"available_observed",
						"high",
						[
							make_evidence(
								"observed_custom_message",
								custom_message_entry.id,
								`custom_message: ${custom_type}`,
							),
						],
						{ custom_type },
					),
				);
				edges.push(
					make_edge(
						framing_id,
						cm_id,
						"framed_by",
						"available_observed",
						"high",
						[make_evidence("observed_custom_message", custom_message_entry.id)],
					),
				);
			}
		}
	}

	// ── Framing: system/developer prompt (modeled as unavailable) ────────
	const sys_prompt_id = "framing_system_prompt";
	add_node(
		make_node(
			sys_prompt_id,
			"system_prompt",
			"System prompt (not captured in session logs)",
			"unavailable",
			"high",
			[],
		),
	);
	edges.push(
		make_edge(
			framing_id,
			sys_prompt_id,
			"framed_by",
			"unavailable",
			"high",
			[],
			"system prompt not available in replay",
		),
	);

	const dev_prompt_id = "framing_developer_prompt";
	add_node(
		make_node(
			dev_prompt_id,
			"developer_prompt",
			"Developer prompt (not captured in session logs)",
			"unavailable",
			"high",
			[],
		),
	);
	edges.push(
		make_edge(
			framing_id,
			dev_prompt_id,
			"framed_by",
			"unavailable",
			"high",
			[],
			"developer prompt not available in replay",
		),
	);

	// ── Turn / tool / file / doc nodes and edges ─────────────────────────
	const raw_turns = group_into_turns(entries);
	const file_node_ids = new Map<string, string>(); // normalized path → node id
	const agents_explicitly_read = new Set<string>(); // paths of AGENTS.md files explicitly read

	for (const turn of raw_turns) {
		// User prompt node
		const user_node_id = `user_prompt_${turn.index}`;
		add_node(
			make_node(
				user_node_id,
				"user_prompt",
				`User: ${truncate(turn.user_text, 80)}`,
				"available_observed",
				"high",
				[make_evidence("observed_replay", turn.user_entry_id, "user message")],
				{ turn_index: turn.index, text: truncate(turn.user_text, 200) },
			),
		);
		edges.push(
			make_edge(
				session_node_id,
				user_node_id,
				"prompted",
				"available_observed",
				"high",
				[make_evidence("observed_replay", turn.user_entry_id)],
			),
		);

		// Assistant turn node
		const turn_node_id = `assistant_turn_${turn.index}`;
		add_node(
			make_node(
				turn_node_id,
				"assistant_turn",
				`Turn ${turn.index + 1}`,
				"available_observed",
				"high",
				[
					make_evidence(
						"observed_replay",
						turn.user_entry_id,
						"grouped from replay",
					),
				],
				{ turn_index: turn.index },
			),
		);
		edges.push(
			make_edge(
				user_node_id,
				turn_node_id,
				"prompted",
				"available_observed",
				"high",
				[make_evidence("inferred_temporal", turn.user_entry_id)],
			),
		);

		// Process tool calls and same-turn tool results
		const tool_results_by_call_id = collect_turn_tool_results(turn.entries);
		const turn_tools: TurnToolInfo[] = [];
		let tool_index = 0;
		for (const entry of turn.entries) {
			if (entry.message.role !== "assistant") continue;

			for (const block of entry.message.content) {
				if (block.type !== "toolCall") continue;

				const tc = block as ToolCallBlock;
				const tool_node_id = `tool_${turn.index}_${tool_index}`;
				const args = tc.arguments;
				const tool_call_id = typeof tc.id === "string" ? tc.id : null;
				const result_info = tool_call_id
					? (tool_results_by_call_id.get(tool_call_id) ?? null)
					: null;

				// Determine tool classification
				const tool_name = tc.name;
				const is_discovery = is_discovery_tool(
					tool_name,
					typeof args.command === "string" ? args.command : undefined,
				);

				// File path extraction
				const file_path =
					typeof args.file_path === "string"
						? args.file_path
						: typeof args.path === "string"
							? args.path
							: null;
				const relative_path = file_path
					? normalize_graph_path(file_path, project_path)
					: null;

				const is_read = tool_name === "read" || tool_name === "Read";
				const is_edit = tool_name === "edit" || tool_name === "Edit";
				const is_write = tool_name === "write" || tool_name === "Write";
				const action_edge_kind = is_read
					? "read"
					: is_edit
						? "edited"
						: is_write
							? "wrote"
							: null;

				// Build tool call node
				let tool_label: string;
				let tool_kind: GraphNodeKind = "tool_call";
				const discovery_query =
					typeof args.command === "string"
						? args.command
						: typeof args.pattern === "string"
							? args.pattern
							: tool_name;
				if (is_discovery) {
					tool_kind = "search_query";
					tool_label = `${tool_name}: ${truncate(discovery_query, 60)}`;
				} else if (file_path) {
					tool_label = `${tool_name}: ${path.basename(file_path)}`;
				} else {
					tool_label = `Tool: ${tool_name}`;
				}

				add_node(
					make_node(
						tool_node_id,
						tool_kind,
						tool_label,
						"available_observed",
						"high",
						[
							make_evidence(
								"observed_tool_args",
								entry.id,
								`tool: ${tool_name}`,
							),
						],
						{
							tool_name,
							tool_index,
							turn_index: turn.index,
							...(tool_call_id ? { tool_call_id } : {}),
							...(is_discovery ? { query: discovery_query } : {}),
							...(file_path ? { file_path } : {}),
							...(relative_path ? { relative_path } : {}),
							...(result_info?.entry_id
								? { tool_result_entry_id: result_info.entry_id }
								: {}),
						},
					),
				);

				// Turn → tool edge
				edges.push(
					make_edge(
						turn_node_id,
						tool_node_id,
						"invoked_tool",
						"available_observed",
						"high",
						[make_evidence("observed_replay", entry.id)],
					),
				);

				let artifact_node_id: string | null = null;

				// File/doc node and edges
				if (file_path && relative_path) {
					const file_id = make_file_node_id(file_path, project_path);

					if (!file_node_ids.has(relative_path)) {
						const is_doc = is_doc_path(file_path);
						const node_kind: GraphNodeKind = is_doc
							? "doc_file"
							: "source_file";
						add_node(
							make_node(
								file_id,
								node_kind,
								path.basename(file_path),
								"available_observed",
								"high",
								[
									make_evidence(
										"observed_tool_args",
										entry.id,
										`file: ${relative_path}`,
									),
								],
								{ path: relative_path },
							),
						);
						file_node_ids.set(relative_path, file_id);
					}

					artifact_node_id = file_node_ids.get(relative_path) ?? file_id;

					let edge_kind: GraphEdgeKind;
					if (is_edit) edge_kind = "edited";
					else if (is_write) edge_kind = "wrote";
					else edge_kind = "read";

					edges.push(
						make_edge(
							tool_node_id,
							artifact_node_id,
							edge_kind,
							"available_observed",
							"high",
							[make_evidence("observed_tool_args", entry.id)],
						),
					);

					// Track AGENTS.md explicit reads
					if (is_read && is_agents_md_path(file_path)) {
						agents_explicitly_read.add(relative_path);
					}
				}

				turn_tools.push({
					node_id: tool_node_id,
					node_kind: tool_kind,
					tool_name,
					tool_index,
					turn_index: turn.index,
					entry_id: entry.id,
					tool_call_id,
					is_discovery,
					query: is_discovery ? discovery_query : null,
					file_path,
					relative_path,
					artifact_node_id,
					action_edge_kind,
					result_entry_id: result_info?.entry_id ?? null,
					result_text: result_info?.text ?? "",
					result_is_error: result_info?.is_error ?? false,
				});

				tool_index++;
			}
		}

		infer_same_turn_search_lineage(turn, turn_tools, project_path, edges);
	}

	// ── AGENTS.md: observed explicit reads ───────────────────────────────
	for (const agents_path of agents_explicitly_read) {
		const file_id = file_node_ids.get(agents_path);
		if (file_id) {
			// Re-label as agents_doc if not already
			const existing = nodes.find((n) => n.id === file_id);
			if (existing) {
				existing.kind = "agents_doc";
				existing.label = `AGENTS.md (explicitly read)`;
				existing.evidence.push(
					make_evidence(
						"observed_replay",
						null,
						"explicitly read during session",
					),
				);
			}
			// Edge: framing → agents_doc (observed)
			edges.push(
				make_edge(
					framing_id,
					file_id,
					"constrained_by",
					"available_observed",
					"high",
					[
						make_evidence(
							"observed_replay",
							null,
							"AGENTS.md explicitly read in session",
						),
					],
					"explicitly read",
				),
			);
		}
	}

	return {
		session_id,
		project_path,
		nodes,
		edges,
		has_repo_context: false,
		derived_at: new Date().toISOString(),
	};
}
