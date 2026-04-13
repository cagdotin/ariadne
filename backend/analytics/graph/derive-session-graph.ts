/**
 * Session graph derivation — transforms raw replay entries into a
 * SessionGraphPayload with typed nodes, edges, evidence, and provenance.
 *
 * This is the source-of-truth derivation for the graph IR.
 */

import * as path from "node:path";

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
import {
	is_discovery_tool,
	is_doc_path,
} from "../../../contracts/graph/tool-classification.js";
import { make_file_node_id, normalize_graph_path } from "./graph-ids.js";

// ── Replay type helpers ─────────────────────────────────────────────────────

type MessageEntry = Extract<SessionEntry, { type: "message" }>;
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
	return { source_id, target_id, kind, availability, confidence, evidence, label };
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
	add_node(make_node(
		session_node_id,
		"session",
		`Session ${session_id}`,
		"available_observed",
		"high",
		[make_evidence("observed_replay", session_id, "session root")],
		{ session_id },
	));

	// ── Session framing cluster ──────────────────────────────────────────
	const framing_id = `framing_${session_id}`;
	add_node(make_node(
		framing_id,
		"session_framing",
		"Session Framing",
		"available_observed",
		"high",
		[make_evidence("observed_replay", session_id, "synthetic framing group")],
	));
	edges.push(make_edge(
		session_node_id, framing_id, "framed_by",
		"available_observed", "high",
		[make_evidence("observed_replay", session_id)],
	));

	// ── Framing: cwd ─────────────────────────────────────────────────────
	if (header?.cwd) {
		const cwd_id = `framing_cwd`;
		add_node(make_node(
			cwd_id, "runtime_context", `cwd: ${header.cwd}`,
			"available_observed", "high",
			[make_evidence("observed_replay", header.id ?? session_id, "session header cwd")],
			{ cwd: header.cwd },
		));
		edges.push(make_edge(
			framing_id, cwd_id, "framed_by",
			"available_observed", "high",
			[make_evidence("observed_replay", header.id ?? session_id)],
		));
	}

	// ── Framing: model/thinking/custom from entries ──────────────────────
	for (const entry of entries) {
		if (entry.type === "model_change") {
			const mc_id = `framing_model_${entry.id}`;
			add_node(make_node(
				mc_id, "runtime_context",
				`Model: ${(entry as any).modelId ?? "unknown"} (${(entry as any).provider ?? "unknown"})`,
				"available_observed", "high",
				[make_evidence("observed_replay", entry.id, "model_change entry")],
				{ provider: (entry as any).provider, model_id: (entry as any).modelId },
			));
			edges.push(make_edge(
				framing_id, mc_id, "framed_by",
				"available_observed", "high",
				[make_evidence("observed_replay", entry.id)],
			));
		}

		if (entry.type === "thinking_level_change") {
			const tl_id = `framing_thinking_${entry.id}`;
			add_node(make_node(
				tl_id, "runtime_context",
				`Thinking: ${(entry as any).thinkingLevel ?? "unknown"}`,
				"available_observed", "high",
				[make_evidence("observed_replay", entry.id, "thinking_level_change entry")],
				{ thinking_level: (entry as any).thinkingLevel },
			));
			edges.push(make_edge(
				framing_id, tl_id, "framed_by",
				"available_observed", "high",
				[make_evidence("observed_replay", entry.id)],
			));
		}

		if (entry.type === "custom_message") {
			const custom_type = (entry as any).customType as string;
			if (NOTABLE_CUSTOM_MESSAGES.has(custom_type)) {
				const cm_id = `framing_custom_${entry.id}`;
				add_node(make_node(
					cm_id, "runtime_context",
					`Runtime: ${custom_type}`,
					"available_observed", "high",
					[make_evidence("observed_custom_message", entry.id, `custom_message: ${custom_type}`)],
					{ custom_type },
				));
				edges.push(make_edge(
					framing_id, cm_id, "framed_by",
					"available_observed", "high",
					[make_evidence("observed_custom_message", entry.id)],
				));
			}
		}
	}

	// ── Framing: system/developer prompt (modeled as unavailable) ────────
	const sys_prompt_id = "framing_system_prompt";
	add_node(make_node(
		sys_prompt_id, "system_prompt",
		"System prompt (not captured in session logs)",
		"unavailable", "high",
		[],
	));
	edges.push(make_edge(
		framing_id, sys_prompt_id, "framed_by",
		"unavailable", "high", [],
		"system prompt not available in replay",
	));

	const dev_prompt_id = "framing_developer_prompt";
	add_node(make_node(
		dev_prompt_id, "developer_prompt",
		"Developer prompt (not captured in session logs)",
		"unavailable", "high",
		[],
	));
	edges.push(make_edge(
		framing_id, dev_prompt_id, "framed_by",
		"unavailable", "high", [],
		"developer prompt not available in replay",
	));

	// ── Turn / tool / file / doc nodes and edges ─────────────────────────
	const raw_turns = group_into_turns(entries);
	const file_node_ids = new Map<string, string>(); // normalized path → node id
	const agents_explicitly_read = new Set<string>(); // paths of AGENTS.md files explicitly read

	for (const turn of raw_turns) {
		// User prompt node
		const user_node_id = `user_prompt_${turn.index}`;
		add_node(make_node(
			user_node_id, "user_prompt",
			`User: ${truncate(turn.user_text, 80)}`,
			"available_observed", "high",
			[make_evidence("observed_replay", turn.user_entry_id, "user message")],
			{ turn_index: turn.index, text: truncate(turn.user_text, 200) },
		));
		edges.push(make_edge(
			session_node_id, user_node_id, "prompted",
			"available_observed", "high",
			[make_evidence("observed_replay", turn.user_entry_id)],
		));

		// Assistant turn node
		const turn_node_id = `assistant_turn_${turn.index}`;
		add_node(make_node(
			turn_node_id, "assistant_turn",
			`Turn ${turn.index + 1}`,
			"available_observed", "high",
			[make_evidence("observed_replay", turn.user_entry_id, "grouped from replay")],
			{ turn_index: turn.index },
		));
		edges.push(make_edge(
			user_node_id, turn_node_id, "prompted",
			"available_observed", "high",
			[make_evidence("inferred_temporal", turn.user_entry_id)],
		));

		// Process tool calls
		let tool_index = 0;
		for (const entry of turn.entries) {
			if (entry.message.role !== "assistant") continue;

			for (const block of entry.message.content) {
				if (block.type !== "toolCall") continue;

				const tc = block as ToolCallBlock;
				const tool_node_id = `tool_${turn.index}_${tool_index}`;
				const args = tc.arguments;

				// Determine tool classification
				const tool_name = tc.name;
				const is_discovery = is_discovery_tool(
					tool_name,
					typeof args.command === "string" ? args.command : undefined,
				);

				// File path extraction
				const file_path = typeof args.file_path === "string"
					? args.file_path
					: typeof args.path === "string"
						? args.path
						: null;

				// Build tool call node
				let tool_label: string;
				let tool_kind: GraphNodeKind = "tool_call";
				if (is_discovery) {
					tool_kind = "search_query";
					const query = typeof args.command === "string"
						? args.command
						: typeof args.pattern === "string"
							? args.pattern
							: tool_name;
					tool_label = `${tool_name}: ${truncate(query, 60)}`;
				} else if (file_path) {
					tool_label = `${tool_name}: ${path.basename(file_path)}`;
				} else {
					tool_label = `Tool: ${tool_name}`;
				}

				add_node(make_node(
					tool_node_id, tool_kind, tool_label,
					"available_observed", "high",
					[make_evidence("observed_tool_args", entry.id, `tool: ${tool_name}`)],
					{
						tool_name,
						tool_index,
						turn_index: turn.index,
						...(file_path ? { file_path } : {}),
					},
				));

				// Turn → tool edge
				edges.push(make_edge(
					turn_node_id, tool_node_id, "invoked_tool",
					"available_observed", "high",
					[make_evidence("observed_replay", entry.id)],
				));

				// File/doc node and edges
				if (file_path) {
					const relative = normalize_graph_path(file_path, project_path);
					const file_id = make_file_node_id(file_path, project_path);

					if (!file_node_ids.has(relative)) {
						const is_doc = is_doc_path(file_path);
						const node_kind: GraphNodeKind = is_doc ? "doc_file" : "source_file";
						add_node(make_node(
							file_id, node_kind, path.basename(file_path),
							"available_observed", "high",
							[make_evidence("observed_tool_args", entry.id, `file: ${relative}`)],
							{ path: relative },
						));
						file_node_ids.set(relative, file_id);
					}

					const existing_file_id = file_node_ids.get(relative)!;

					// Determine edge kind
					const is_read = tool_name === "read" || tool_name === "Read";
					const is_edit = tool_name === "edit" || tool_name === "Edit";
					const is_write = tool_name === "write" || tool_name === "Write";

					let edge_kind: GraphEdgeKind;
					if (is_edit) edge_kind = "edited";
					else if (is_write) edge_kind = "wrote";
					else edge_kind = "read";

					edges.push(make_edge(
						tool_node_id, existing_file_id, edge_kind,
						"available_observed", "high",
						[make_evidence("observed_tool_args", entry.id)],
					));

					// Track AGENTS.md explicit reads
					if (is_read && is_agents_md_path(file_path)) {
						agents_explicitly_read.add(relative);
					}
				}

				// Discovery: the search_query node is the tool node itself
				// (tool_kind is already set to "search_query" above)

				tool_index++;
			}
		}
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
					make_evidence("observed_replay", null, "explicitly read during session"),
				);
			}
			// Edge: framing → agents_doc (observed)
			edges.push(make_edge(
				framing_id, file_id, "constrained_by",
				"available_observed", "high",
				[make_evidence("observed_replay", null, "AGENTS.md explicitly read in session")],
				"explicitly read",
			));
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
