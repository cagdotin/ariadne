/**
 * Exploration derivation — transforms raw replay entries into an
 * ExplorationPayload with turns, events, artifacts, and causal relations.
 */

import * as path from "node:path";

import type {
	ArtifactKind,
	ExplorationArtifact,
	ExplorationEvent,
	ExplorationEventKind,
	ExplorationPayload,
	ExplorationRelation,
	ExplorationTurn,
} from "../../../contracts/exploration/types.js";
import type {
	SessionEntry,
	SessionHeader,
} from "../../../contracts/sessions/replay.js";
import {
	make_artifact_id,
	make_discovery_artifact_id,
} from "./artifact-ids.js";

// ── Replay type helpers ─────────────────────────────────────────────────────

/** A message entry (type === "message") with its typed message payload. */
type MessageEntry = Extract<SessionEntry, { type: "message" }>;

/** The message payload union (user | assistant | toolResult | ...). */
type MessageData = MessageEntry["message"];

/** A content block from an assistant message. */
type ContentBlock = Extract<
	MessageData,
	{ role: "assistant" }
>["content"][number];

/** A tool call content block. */
type ToolCallBlock = Extract<ContentBlock, { type: "toolCall" }>;

// ── Constants ────────────────────────────────────────────────────────────────

const DISCOVERY_PROGRAMS = new Set([
	"rg",
	"grep",
	"find",
	"ls",
	"cat",
	"head",
	"tail",
	"fd",
	"tree",
	"wc",
]);

const DISCOVERY_TOOLS = new Set(["Glob", "Grep", "Search", "ListDir"]);

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);

const SNIPPET_MAX_LENGTH = 120;

// ── Helpers ──────────────────────────────────────────────────────────────────

function make_event_id(turn_index: number, event_index: number): string {
	return `evt_${turn_index}_${event_index}`;
}

function is_doc_path(file_path: string): boolean {
	const ext = path.extname(file_path).toLowerCase();
	return DOC_EXTENSIONS.has(ext);
}

function extract_user_message_text(message: MessageData): string {
	if (message.role !== "user") return "";
	const content = message.content;
	if (typeof content === "string") {
		return content.trim();
	}
	const parts: string[] = [];
	for (const block of content) {
		if (block.type === "text") {
			parts.push(block.text);
		}
	}
	return parts.join(" ").trim();
}

function truncate(text: string, max_len: number): string {
	if (text.length <= max_len) return text;
	return `${text.substring(0, max_len)}\u2026`;
}

function extract_bash_program(command: string): string {
	return command.trim().split(/\s+/)[0] ?? "";
}

function is_discovery_bash(command: string): boolean {
	const program = extract_bash_program(command);
	return DISCOVERY_PROGRAMS.has(program);
}

function get_entry_timestamp(entry: SessionEntry): string {
	return entry.timestamp;
}

function get_entry_id(entry: SessionEntry): string | null {
	return entry.id;
}

function get_file_label(file_path: string): string {
	return path.basename(file_path);
}

function get_artifact_kind(file_path: string): ArtifactKind {
	return is_doc_path(file_path) ? "doc_file" : "source_file";
}

// ── Tool call extraction ─────────────────────────────────────────────────────

interface ToolCallInfo {
	name: string;
	arguments: Record<string, unknown>;
}

function extract_tool_calls(message: MessageData): ToolCallInfo[] {
	if (message.role !== "assistant") return [];

	const calls: ToolCallInfo[] = [];
	for (const block of message.content) {
		if (block.type === "toolCall") {
			calls.push({
				name: block.name,
				arguments: block.arguments,
			});
		}
	}
	return calls;
}

// ── Turn grouping ────────────────────────────────────────────────────────────

interface RawTurn {
	index: number;
	entries: MessageEntry[];
	user_message_text: string;
	user_message_timestamp: string;
	user_message_entry_id: string | null;
}

function group_into_turns(entries: SessionEntry[]): RawTurn[] {
	const turns: RawTurn[] = [];
	let current_turn: RawTurn | null = null;

	for (const entry of entries) {
		if (entry.type !== "message") continue;

		const role = entry.message.role;

		if (role === "user") {
			// Start a new turn
			const text = extract_user_message_text(entry.message);
			current_turn = {
				index: turns.length,
				entries: [entry],
				user_message_text: text,
				user_message_timestamp: get_entry_timestamp(entry),
				user_message_entry_id: get_entry_id(entry),
			};
			turns.push(current_turn);
		} else if (current_turn) {
			current_turn.entries.push(entry);
		}
		// If no current_turn yet (entries before the first user message), skip them
	}

	return turns;
}

// ── Event classification ─────────────────────────────────────────────────────

interface ClassifiedEvent {
	event: ExplorationEvent;
	file_path: string | null;
	is_discovery: boolean;
	is_doc: boolean;
	is_read: boolean;
	is_edit: boolean;
	is_write: boolean;
	discovery_query: string | null;
}

function classify_tool_call(
	tool: ToolCallInfo,
	turn_index: number,
	event_index: number,
	timestamp: string,
	entry_id: string | null,
	project_path: string,
): ClassifiedEvent {
	const evt_id = make_event_id(turn_index, event_index);
	const name = tool.name;
	const args = tool.arguments;

	let kind: ExplorationEventKind;
	let label: string;
	let detail: string | null = null;
	let artifact_id: string | null = null;
	let file_path: string | null = null;
	let is_discovery = false;
	let is_doc = false;
	let is_read = false;
	let is_edit = false;
	let is_write = false;
	let discovery_query: string | null = null;

	if (name === "bash" || name === "Bash") {
		const command = typeof args.command === "string" ? args.command : "";
		detail = truncate(command, 200);

		if (is_discovery_bash(command)) {
			kind = "discovery_command";
			label = `Discovery: ${truncate(command, 60)}`;
			is_discovery = true;
			discovery_query = command;
		} else {
			kind = "opaque_tool";
			label = `Bash: ${truncate(command, 60)}`;
		}
	} else if (name === "read" || name === "Read") {
		const p =
			typeof args.file_path === "string"
				? args.file_path
				: typeof args.path === "string"
					? args.path
					: null;
		file_path = p;
		detail = p;

		if (p && is_doc_path(p)) {
			kind = "doc_read";
			label = `Read doc: ${get_file_label(p)}`;
			is_doc = true;
		} else {
			kind = "file_read";
			label = p ? `Read: ${get_file_label(p)}` : "Read (unknown path)";
		}
		is_read = true;
		if (p) artifact_id = make_artifact_id(p, project_path);
	} else if (name === "edit" || name === "Edit") {
		const p =
			typeof args.file_path === "string"
				? args.file_path
				: typeof args.path === "string"
					? args.path
					: null;
		file_path = p;
		detail = p;
		kind = "file_edit";
		label = p ? `Edit: ${get_file_label(p)}` : "Edit (unknown path)";
		is_edit = true;
		if (p) artifact_id = make_artifact_id(p, project_path);
	} else if (name === "write" || name === "Write") {
		const p =
			typeof args.file_path === "string"
				? args.file_path
				: typeof args.path === "string"
					? args.path
					: null;
		file_path = p;
		detail = p;
		kind = "file_write";
		label = p ? `Write: ${get_file_label(p)}` : "Write (unknown path)";
		is_write = true;
		if (p) artifact_id = make_artifact_id(p, project_path);
	} else if (DISCOVERY_TOOLS.has(name)) {
		kind = "discovery_command";
		const pattern =
			typeof args.pattern === "string"
				? args.pattern
				: typeof args.path === "string"
					? args.path
					: name;
		detail = truncate(pattern, 200);
		label = `${name}: ${truncate(pattern, 60)}`;
		is_discovery = true;
		discovery_query = pattern;
	} else {
		kind = "opaque_tool";
		label = `Tool: ${name}`;
		detail = name;
	}

	return {
		event: {
			id: evt_id,
			kind,
			turn_index,
			timestamp,
			label,
			artifact_id,
			entry_id,
			detail,
			is_error: false,
		},
		file_path,
		is_discovery,
		is_doc,
		is_read,
		is_edit,
		is_write,
		discovery_query,
	};
}

// ── Main derivation ──────────────────────────────────────────────────────────

export function derive_exploration(
	session_id: string,
	entries: SessionEntry[],
	header: SessionHeader | null,
): ExplorationPayload {
	const project_path = header?.cwd ?? "";

	const raw_turns = group_into_turns(entries);

	const all_events: ExplorationEvent[] = [];
	const artifact_map = new Map<string, ExplorationArtifact>();
	const all_relations: ExplorationRelation[] = [];
	const all_turns: ExplorationTurn[] = [];

	// Track per-turn classified events for cross-turn relations
	const classified_by_turn = new Map<number, ClassifiedEvent[]>();
	const files_read_by_turn = new Map<number, Set<string>>();
	const docs_read_by_turn = new Map<number, Set<string>>();

	for (const raw_turn of raw_turns) {
		const turn_event_ids: string[] = [];
		const turn_artifact_ids = new Set<string>();
		let event_index = 0;

		// User message event
		const user_evt_id = make_event_id(raw_turn.index, event_index);
		const user_evt: ExplorationEvent = {
			id: user_evt_id,
			kind: "user_message",
			turn_index: raw_turn.index,
			timestamp: raw_turn.user_message_timestamp,
			label: `User: ${truncate(raw_turn.user_message_text, 80)}`,
			artifact_id: null,
			entry_id: raw_turn.user_message_entry_id,
			detail: truncate(raw_turn.user_message_text, 200),
			is_error: false,
		};
		all_events.push(user_evt);
		turn_event_ids.push(user_evt_id);
		event_index++;

		// Track classified events in this turn for relation derivation
		const turn_classified: ClassifiedEvent[] = [];
		const turn_reads = new Set<string>();
		const turn_docs = new Set<string>();

		for (const entry of raw_turn.entries) {
			const message = entry.message;
			const role = message.role;
			const timestamp = get_entry_timestamp(entry);
			const entry_id = get_entry_id(entry);

			if (role === "assistant") {
				const tool_calls = extract_tool_calls(message);
				for (const tool of tool_calls) {
					const classified = classify_tool_call(
						tool,
						raw_turn.index,
						event_index,
						timestamp,
						entry_id,
						project_path,
					);

					all_events.push(classified.event);
					turn_event_ids.push(classified.event.id);
					turn_classified.push(classified);

					// Create/update artifact for file-related events
					if (classified.file_path) {
						const art_id = make_artifact_id(classified.file_path, project_path);
						if (!artifact_map.has(art_id)) {
							const relative_path =
								project_path && path.isAbsolute(classified.file_path)
									? path.relative(project_path, classified.file_path)
									: classified.file_path;
							artifact_map.set(art_id, {
								id: art_id,
								kind: get_artifact_kind(classified.file_path),
								path: relative_path,
								label: get_file_label(classified.file_path),
								parent_id: null,
								explored: true,
								first_seen_turn: raw_turn.index,
							});
						}
						turn_artifact_ids.add(art_id);
					}

					// Create discovery_query artifact
					if (classified.is_discovery && classified.discovery_query) {
						const dq_id = make_discovery_artifact_id(
							raw_turn.index,
							event_index,
						);
						artifact_map.set(dq_id, {
							id: dq_id,
							kind: "discovery_query",
							path: classified.discovery_query,
							label: truncate(classified.discovery_query, 60),
							parent_id: null,
							explored: true,
							first_seen_turn: raw_turn.index,
						});
						// Update event's artifact_id to point to discovery query
						classified.event.artifact_id = dq_id;
						turn_artifact_ids.add(dq_id);
					}

					if (classified.is_read && classified.file_path) {
						turn_reads.add(classified.file_path);
					}
					if (classified.is_doc && classified.file_path) {
						turn_docs.add(classified.file_path);
					}

					event_index++;
				}
			} else if (role === "toolResult") {
				const is_error = message.isError ?? false;
				const tool_name = message.toolName ?? "";

				if (is_error && is_tool_discovery_related(tool_name)) {
					const evt_id = make_event_id(raw_turn.index, event_index);
					const evt: ExplorationEvent = {
						id: evt_id,
						kind: "failed_discovery",
						turn_index: raw_turn.index,
						timestamp,
						label: `Failed: ${tool_name}`,
						artifact_id: null,
						entry_id,
						detail: tool_name,
						is_error: true,
					};
					all_events.push(evt);
					turn_event_ids.push(evt_id);
					event_index++;
				}
			}
		}

		classified_by_turn.set(raw_turn.index, turn_classified);
		files_read_by_turn.set(raw_turn.index, turn_reads);
		docs_read_by_turn.set(raw_turn.index, turn_docs);

		// ── Intra-turn relations ─────────────────────────────────────────

		// prompt_triggered: user_message → first non-user events
		if (turn_classified.length > 0) {
			all_relations.push({
				source_id: user_evt_id,
				target_id: turn_classified[0].event.id,
				kind: "prompt_triggered",
				evidence: "explicit_session",
				label: null,
			});
		}

		// sequential_read: consecutive reads in the same turn
		let prev_read: ClassifiedEvent | null = null;
		for (const c of turn_classified) {
			if (c.is_read || c.is_doc) {
				if (prev_read) {
					all_relations.push({
						source_id: prev_read.event.id,
						target_id: c.event.id,
						kind: "sequential_read",
						evidence: "sequencing_inference",
						label: null,
					});
				}
				prev_read = c;
			}
		}

		// command_led_to_read: discovery → subsequent read in same turn
		let last_discovery: ClassifiedEvent | null = null;
		for (const c of turn_classified) {
			if (c.is_discovery) {
				last_discovery = c;
			} else if ((c.is_read || c.is_doc) && last_discovery) {
				all_relations.push({
					source_id: last_discovery.event.id,
					target_id: c.event.id,
					kind: "command_led_to_read",
					evidence: "sequencing_inference",
					label: null,
				});
			}
		}

		// read_preceded_edit: file read then edited in same turn
		const files_read_in_turn = new Map<string, ClassifiedEvent>();
		for (const c of turn_classified) {
			if ((c.is_read || c.is_doc) && c.file_path) {
				if (!files_read_in_turn.has(c.file_path)) {
					files_read_in_turn.set(c.file_path, c);
				}
			}
			if ((c.is_edit || c.is_write) && c.file_path) {
				const read_evt = files_read_in_turn.get(c.file_path);
				if (read_evt) {
					all_relations.push({
						source_id: read_evt.event.id,
						target_id: c.event.id,
						kind: "read_preceded_edit",
						evidence: "sequencing_inference",
						label: null,
					});
				}
			}
		}

		// doc_influenced_read: doc read → subsequent source file reads in same turn
		const doc_events: ClassifiedEvent[] = [];
		for (const c of turn_classified) {
			if (c.is_doc) {
				doc_events.push(c);
			} else if (c.is_read && !c.is_doc && doc_events.length > 0) {
				// Link from most recent doc read
				const latest_doc = doc_events[doc_events.length - 1];
				all_relations.push({
					source_id: latest_doc.event.id,
					target_id: c.event.id,
					kind: "doc_influenced_read",
					evidence: "sequencing_inference",
					label: null,
				});
			}
		}

		// Build turn
		all_turns.push({
			index: raw_turn.index,
			user_message_snippet: truncate(
				raw_turn.user_message_text,
				SNIPPET_MAX_LENGTH,
			),
			event_ids: turn_event_ids,
			artifact_ids: [...turn_artifact_ids],
			timestamp: raw_turn.user_message_timestamp,
			entry_id: raw_turn.user_message_entry_id,
		});
	}

	// ── Cross-turn relations ─────────────────────────────────────────────────

	// read_preceded_edit across adjacent turns
	for (let i = 0; i < raw_turns.length - 1; i++) {
		const reads_in_prev = files_read_by_turn.get(i) ?? new Set();
		if (reads_in_prev.size === 0) continue;

		const next_classified = classified_by_turn.get(i + 1) ?? [];
		const prev_classified = classified_by_turn.get(i) ?? [];

		for (const c of next_classified) {
			if ((c.is_edit || c.is_write) && c.file_path && reads_in_prev.has(c.file_path)) {
				// Find the first read event for this file in the previous turn
				const read_evt = prev_classified.find(
					(pc) => (pc.is_read || pc.is_doc) && pc.file_path === c.file_path,
				);
				if (read_evt) {
					all_relations.push({
						source_id: read_evt.event.id,
						target_id: c.event.id,
						kind: "read_preceded_edit",
						evidence: "sequencing_inference",
						label: null,
					});
				}
			}
		}
	}

	// doc_influenced_read across adjacent turns
	for (let i = 0; i < raw_turns.length - 1; i++) {
		const docs_in_prev = docs_read_by_turn.get(i) ?? new Set();
		if (docs_in_prev.size === 0) continue;

		const reads_in_next = files_read_by_turn.get(i + 1) ?? new Set();
		if (reads_in_next.size === 0) continue;

		// Find a doc event in prev turn and a source read in next turn
		const prev_classified = classified_by_turn.get(i) ?? [];
		const next_classified = classified_by_turn.get(i + 1) ?? [];
		const doc_evt = prev_classified.find((c) => c.is_doc);
		const read_evt = next_classified.find((c) => c.is_read && !c.is_doc);
		if (doc_evt && read_evt) {
			all_relations.push({
				source_id: doc_evt.event.id,
				target_id: read_evt.event.id,
				kind: "doc_influenced_read",
				evidence: "sequencing_inference",
				label: null,
			});
		}
	}

	// user_followup_continued: if a turn's user message looks like a followup
	// User message events are always the first event per turn (index 0),
	// so their IDs are deterministic: evt_<turn_index>_0
	for (let i = 1; i < all_turns.length; i++) {
		const text = raw_turns[i].user_message_text.toLowerCase();
		if (is_followup_message(text)) {
			all_relations.push({
				source_id: make_event_id(i - 1, 0),
				target_id: make_event_id(i, 0),
				kind: "user_followup_continued",
				evidence: "sequencing_inference",
				label: null,
			});
		}
	}

	return {
		session_id,
		project_path,
		turns: all_turns,
		events: all_events,
		artifacts: [...artifact_map.values()],
		relations: all_relations,
		has_repo_context: false,
		derived_at: new Date().toISOString(),
	};
}

// ── Relation helpers ─────────────────────────────────────────────────────────

function is_tool_discovery_related(tool_name: string): boolean {
	const lower = tool_name.toLowerCase();
	return (
		DISCOVERY_TOOLS.has(tool_name) ||
		lower === "bash" ||
		lower === "glob" ||
		lower === "grep" ||
		lower === "search" ||
		lower === "listdir"
	);
}

function is_followup_message(text: string): boolean {
	const followup_patterns = [
		/^(yes|no|yeah|yep|nope|ok|okay|sure|right|correct|exactly)\b/,
		/^(do it|go ahead|proceed|continue|looks good|lgtm)\b/,
		/^(thanks|thank you|ty)\b/,
		/^(what about|how about|and also|also|can you also)\b/,
		/^(actually|wait|hmm|but)\b/,
	];
	for (const pattern of followup_patterns) {
		if (pattern.test(text)) return true;
	}
	return false;
}
