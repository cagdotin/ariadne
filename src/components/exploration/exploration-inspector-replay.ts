import type { GraphNode, SessionGraphPayload } from "@contracts/graph";
import type {
	ContentBlock,
	MessageEntry,
	SessionEntry,
	ToolCallContent,
} from "@/components/session-viewer/types";

export interface ReplayStat {
	label: string;
	value: string;
}

export interface ReplayTextSection {
	title: string;
	text: string;
}

export interface ReplayJsonSection {
	title: string;
	data: unknown;
}

export interface FileActivityDetail {
	tool_node_id: string;
	tool_label: string;
	action: string;
	turn_index: number | null;
	tool_index: number | null;
	tool_arguments: Record<string, unknown> | null;
	result_text: string | null;
	result_details: unknown;
	result_is_error: boolean;
}

export interface NodeReplayDetails {
	stats: ReplayStat[];
	text_sections: ReplayTextSection[];
	json_sections: ReplayJsonSection[];
	file_activity: FileActivityDetail[];
	raw_entries: SessionEntry[];
}

function is_message_entry(
	entry: SessionEntry | null | undefined,
): entry is MessageEntry {
	return entry?.type === "message";
}

function extract_text_blocks(
	content: string | ContentBlock[] | undefined,
): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const block of content) {
		if (block.type === "text") parts.push(block.text);
		if (block.type === "thinking") parts.push(block.thinking);
	}
	return parts.join("\n\n").trim();
}

function find_tool_call_block(
	entry: SessionEntry | null | undefined,
	tool_call_id: string | null,
): ToolCallContent | null {
	if (!tool_call_id || !is_message_entry(entry)) return null;
	if (entry.message.role !== "assistant") return null;

	for (const block of entry.message.content) {
		if (block.type === "toolCall" && block.id === tool_call_id) {
			return block;
		}
	}
	return null;
}

function format_metadata_value(value: unknown): string {
	if (value == null) return "—";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function build_node_replay_details(
	node: GraphNode,
	graph: SessionGraphPayload,
	entries: SessionEntry[],
): NodeReplayDetails {
	const entry_by_id = new Map(entries.map((entry) => [entry.id, entry]));
	const raw_entries: SessionEntry[] = [];
	const raw_entry_ids = new Set<string>();
	const stats: ReplayStat[] = [];
	const text_sections: ReplayTextSection[] = [];
	const json_sections: ReplayJsonSection[] = [];
	const file_activity: FileActivityDetail[] = [];

	const add_raw_entry = (entry: SessionEntry | null | undefined) => {
		if (!entry || raw_entry_ids.has(entry.id)) return;
		raw_entry_ids.add(entry.id);
		raw_entries.push(entry);
	};

	const add_stat = (label: string, value: unknown) => {
		if (value == null) return;
		const text = format_metadata_value(value);
		if (!text || text === "—") return;
		stats.push({ label, value: text });
	};

	const primary_entry_id =
		node.evidence.find((ev) => ev.source_ref)?.source_ref ?? null;
	const primary_entry = primary_entry_id
		? (entry_by_id.get(primary_entry_id) ?? null)
		: null;
	add_raw_entry(primary_entry);

	const tool_result_entry_id =
		typeof node.metadata?.tool_result_entry_id === "string"
			? node.metadata.tool_result_entry_id
			: null;
	const tool_result_entry = tool_result_entry_id
		? (entry_by_id.get(tool_result_entry_id) ?? null)
		: null;
	add_raw_entry(tool_result_entry);

	const tool_call_id =
		typeof node.metadata?.tool_call_id === "string"
			? node.metadata.tool_call_id
			: null;
	const tool_call_block = find_tool_call_block(primary_entry, tool_call_id);

	add_stat("Node ID", node.id);
	add_stat("Replay refs", node.evidence.filter((ev) => ev.source_ref).length);
	add_stat(
		"Incoming edges",
		graph.edges.filter((edge) => edge.target_id === node.id).length,
	);
	add_stat(
		"Outgoing edges",
		graph.edges.filter((edge) => edge.source_id === node.id).length,
	);
	add_stat("Turn", node.metadata?.turn_index);
	add_stat("Tool index", node.metadata?.tool_index);
	add_stat("Tool", node.metadata?.tool_name);
	add_stat("Path", node.metadata?.path);
	add_stat("Relative path", node.metadata?.relative_path);
	add_stat("Query", node.metadata?.query);
	add_stat("Provider", node.metadata?.provider);
	add_stat("Model", node.metadata?.model_id);
	add_stat("Thinking", node.metadata?.thinking_level);
	add_stat("Custom type", node.metadata?.custom_type);

	if (is_message_entry(primary_entry)) {
		if (primary_entry.message.role === "user") {
			const text = extract_text_blocks(primary_entry.message.content);
			if (text) text_sections.push({ title: "Content", text });
		}

		if (primary_entry.message.role === "assistant") {
			const assistant_text = extract_text_blocks(primary_entry.message.content);
			if (assistant_text && !tool_call_block) {
				text_sections.push({ title: "Content", text: assistant_text });
			}
			if (primary_entry.message.usage) {
				json_sections.push({
					title: "Usage",
					data: primary_entry.message.usage,
				});
			}
		}

		if (primary_entry.message.role === "toolResult") {
			const result_text = extract_text_blocks(primary_entry.message.content);
			if (result_text)
				text_sections.push({ title: "Output", text: result_text });
			if (primary_entry.message.details) {
				json_sections.push({
					title: "Parsed result details",
					data: primary_entry.message.details,
				});
			}
		}

		if (primary_entry.message.role === "custom") {
			const text = extract_text_blocks(primary_entry.message.content);
			if (text) text_sections.push({ title: "Content", text });
			if (primary_entry.message.details) {
				json_sections.push({
					title: "Details",
					data: primary_entry.message.details,
				});
			}
		}
	}

	if (tool_call_block) {
		json_sections.push({ title: "Input", data: tool_call_block.arguments });
	}

	if (
		is_message_entry(tool_result_entry) &&
		tool_result_entry.message.role === "toolResult"
	) {
		const result_text = extract_text_blocks(tool_result_entry.message.content);
		if (result_text) text_sections.push({ title: "Output", text: result_text });
		if (tool_result_entry.message.details) {
			json_sections.push({
				title: "Parsed result details",
				data: tool_result_entry.message.details,
			});
		}
		if (tool_result_entry.message.isError) {
			add_stat("Tool result", "error");
		}
	}

	if (
		node.kind === "source_file" ||
		node.kind === "doc_file" ||
		node.kind === "agents_doc"
	) {
		const incoming_tool_edges = graph.edges.filter(
			(edge) =>
				edge.target_id === node.id &&
				(edge.kind === "read" ||
					edge.kind === "edited" ||
					edge.kind === "wrote"),
		);

		for (const edge of incoming_tool_edges) {
			const tool_node = graph.nodes.find(
				(candidate) => candidate.id === edge.source_id,
			);
			if (!tool_node) continue;

			const tool_entry_id =
				tool_node.evidence.find((ev) => ev.source_ref)?.source_ref ?? null;
			const tool_entry = tool_entry_id
				? (entry_by_id.get(tool_entry_id) ?? null)
				: null;
			const tool_node_call_id =
				typeof tool_node.metadata?.tool_call_id === "string"
					? tool_node.metadata.tool_call_id
					: null;
			const tool_block = find_tool_call_block(tool_entry, tool_node_call_id);
			const tool_result_id =
				typeof tool_node.metadata?.tool_result_entry_id === "string"
					? tool_node.metadata.tool_result_entry_id
					: null;
			const tool_result = tool_result_id
				? (entry_by_id.get(tool_result_id) ?? null)
				: null;
			const result_text =
				is_message_entry(tool_result) &&
				tool_result.message.role === "toolResult"
					? extract_text_blocks(tool_result.message.content)
					: "";
			const result_details =
				is_message_entry(tool_result) &&
				tool_result.message.role === "toolResult"
					? (tool_result.message.details ?? null)
					: null;
			const result_is_error =
				is_message_entry(tool_result) &&
				tool_result.message.role === "toolResult"
					? (tool_result.message.isError ?? false)
					: false;

			add_raw_entry(tool_entry);
			add_raw_entry(tool_result);
			file_activity.push({
				tool_node_id: tool_node.id,
				tool_label: tool_node.label,
				action: edge.kind,
				turn_index:
					typeof tool_node.metadata?.turn_index === "number"
						? tool_node.metadata.turn_index
						: null,
				tool_index:
					typeof tool_node.metadata?.tool_index === "number"
						? tool_node.metadata.tool_index
						: null,
				tool_arguments: tool_block?.arguments ?? null,
				result_text: result_text || null,
				result_details,
				result_is_error,
			});
		}

		file_activity.sort((left, right) => {
			const left_turn = left.turn_index ?? Number.MAX_SAFE_INTEGER;
			const right_turn = right.turn_index ?? Number.MAX_SAFE_INTEGER;
			if (left_turn !== right_turn) return left_turn - right_turn;
			return (
				(left.tool_index ?? Number.MAX_SAFE_INTEGER) -
				(right.tool_index ?? Number.MAX_SAFE_INTEGER)
			);
		});
	}

	if (node.metadata && Object.keys(node.metadata).length > 0) {
		json_sections.push({ title: "Parsed node metadata", data: node.metadata });
	}

	return {
		stats,
		text_sections,
		json_sections,
		file_activity,
		raw_entries,
	};
}
