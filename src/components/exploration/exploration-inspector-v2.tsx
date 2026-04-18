/**
 * Exploration inspector v2 — graph-native inspector pane.
 *
 * Shows provenance, summaries, and graph relationships for a selected node.
 * Works directly with SessionGraphPayload rather than ExplorationPayload.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";
import { ArrowDown, ArrowRight, ArrowUp, Clock, Info, X } from "lucide-react";
import { useMemo } from "react";
import type {
	ContentBlock,
	MessageEntry,
	SessionEntry,
	ToolCallContent,
} from "@/components/session-viewer/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	compute_arrival_paths,
	compute_insight_summary,
	compute_narrative_summary,
	compute_node_summary,
	compute_temporal_narrative,
	type ArrivalPath,
	type FileSummary,
	type InsightSummary,
	type InstructionSummary,
	type TurnSummary,
} from "@/lib/exploration-inspector-summaries";
import type { InsightSubgraph } from "@/lib/exploration-insight-graph-view-model";
import {
	compute_question_actions,
	type QuestionAction,
} from "@/lib/exploration-question-actions";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";
import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-view";

interface ExplorationInspectorV2Props {
	selected_node_id: string;
	graph: SessionGraphPayload;
	entries?: SessionEntry[];
	temporal_lens?: TemporalLens;
	middle_pane_mode?: MiddlePaneMode;
	insight_subgraph?: InsightSubgraph;
	on_select_node: (node_id: string) => void;
	on_close: () => void;
	on_apply_action?: (action: QuestionAction) => void;
}

const evidence_labels: Record<string, string> = {
	observed_replay: "Observed in replay",
	observed_tool_args: "From tool arguments",
	observed_custom_message: "Runtime custom message",
	parsed_markdown_link: "Parsed from markdown",
	parsed_import: "Parsed from imports",
	ambient_repo_context: "Ambient repo context",
	inferred_temporal: "Inferred from ordering",
	heuristic: "Heuristic (low confidence)",
};

const evidence_colors: Record<string, string> = {
	observed_replay: "bg-green-500/10 text-green-600",
	observed_tool_args: "bg-green-500/10 text-green-600",
	observed_custom_message: "bg-cyan-500/10 text-cyan-600",
	parsed_markdown_link: "bg-cyan-500/10 text-cyan-600",
	parsed_import: "bg-blue-500/10 text-blue-600",
	ambient_repo_context: "bg-blue-500/10 text-blue-500",
	inferred_temporal: "bg-amber-500/10 text-amber-600",
	heuristic: "bg-muted text-muted-foreground",
};

const availability_labels: Record<string, string> = {
	available_observed: "Observed",
	available_ambient: "Ambient",
	derived_inferred: "Inferred",
	unavailable: "Unavailable",
	unknown: "Unknown",
};

const availability_badge_colors: Record<string, string> = {
	available_observed: "bg-green-500/10 text-green-600",
	available_ambient: "bg-blue-500/10 text-blue-600",
	derived_inferred: "bg-amber-500/10 text-amber-600",
	unavailable: "bg-muted text-muted-foreground",
	unknown: "bg-muted text-muted-foreground italic",
};

interface ReplayStat {
	label: string;
	value: string;
}

interface ReplayTextSection {
	title: string;
	text: string;
}

interface ReplayJsonSection {
	title: string;
	data: unknown;
}

interface FileActivityDetail {
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

interface NodeReplayDetails {
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

function extract_text_blocks(content: string | ContentBlock[] | undefined): string {
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

function build_node_replay_details(
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

	const primary_entry_id = node.evidence.find((ev) => ev.source_ref)?.source_ref ?? null;
	const primary_entry = primary_entry_id ? (entry_by_id.get(primary_entry_id) ?? null) : null;
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
			if (result_text) text_sections.push({ title: "Output", text: result_text });
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
				json_sections.push({ title: "Details", data: primary_entry.message.details });
			}
		}
	}

	if (tool_call_block) {
		json_sections.push({ title: "Input", data: tool_call_block.arguments });
	}

	if (is_message_entry(tool_result_entry) && tool_result_entry.message.role === "toolResult") {
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
				(edge.kind === "read" || edge.kind === "edited" || edge.kind === "wrote"),
		);

		for (const edge of incoming_tool_edges) {
			const tool_node = graph.nodes.find((candidate) => candidate.id === edge.source_id);
			if (!tool_node) continue;

			const tool_entry_id = tool_node.evidence.find((ev) => ev.source_ref)?.source_ref ?? null;
			const tool_entry = tool_entry_id ? (entry_by_id.get(tool_entry_id) ?? null) : null;
			const tool_node_call_id =
				typeof tool_node.metadata?.tool_call_id === "string"
					? tool_node.metadata.tool_call_id
					: null;
			const tool_block = find_tool_call_block(tool_entry, tool_node_call_id);
			const tool_result_id =
				typeof tool_node.metadata?.tool_result_entry_id === "string"
					? tool_node.metadata.tool_result_entry_id
					: null;
			const tool_result = tool_result_id ? (entry_by_id.get(tool_result_id) ?? null) : null;
			const result_text =
				is_message_entry(tool_result) && tool_result.message.role === "toolResult"
					? extract_text_blocks(tool_result.message.content)
					: "";
			const result_details =
				is_message_entry(tool_result) && tool_result.message.role === "toolResult"
					? (tool_result.message.details ?? null)
					: null;
			const result_is_error =
				is_message_entry(tool_result) && tool_result.message.role === "toolResult"
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
			return (left.tool_index ?? Number.MAX_SAFE_INTEGER) - (right.tool_index ?? Number.MAX_SAFE_INTEGER);
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

export function ExplorationInspectorV2({
	selected_node_id,
	graph,
	entries = [],
	temporal_lens,
	middle_pane_mode,
	insight_subgraph,
	on_select_node,
	on_close,
	on_apply_action,
}: ExplorationInspectorV2Props) {
	const node = useMemo(
		() => graph.nodes.find((n) => n.id === selected_node_id) ?? null,
		[graph.nodes, selected_node_id],
	);

	const summary = useMemo(
		() => compute_node_summary(selected_node_id, graph),
		[selected_node_id, graph],
	);

	// Full arrival paths: traces tool → turn → user_prompt for files/docs
	const arrival_paths = useMemo(
		() => compute_arrival_paths(selected_node_id, graph),
		[selected_node_id, graph],
	);

	// Question actions
	const question_actions = useMemo(
		() => compute_question_actions(selected_node_id, graph),
		[selected_node_id, graph],
	);

	// Narrative summary
	const narrative = useMemo(
		() => compute_narrative_summary(selected_node_id, graph),
		[selected_node_id, graph],
	);

	// Temporal narrative
	const temporal_narrative = useMemo(
		() => temporal_lens ? compute_temporal_narrative(selected_node_id, graph, temporal_lens) : null,
		[selected_node_id, graph, temporal_lens],
	);

	// Insight summary (graph-mode aware)
	const insight_summary = useMemo(
		() => (middle_pane_mode === "graph" && insight_subgraph)
			? compute_insight_summary(insight_subgraph)
			: null,
		[middle_pane_mode, insight_subgraph],
	);

	const connected_edges = useMemo(() => {
		const incoming: Array<{ edge: GraphEdge; node: GraphNode }> = [];
		const outgoing: Array<{ edge: GraphEdge; node: GraphNode }> = [];

		for (const edge of graph.edges) {
			if (edge.source_id === selected_node_id) {
				const target = graph.nodes.find((n) => n.id === edge.target_id);
				if (target) outgoing.push({ edge, node: target });
			}
			if (edge.target_id === selected_node_id) {
				const source = graph.nodes.find((n) => n.id === edge.source_id);
				if (source) incoming.push({ edge, node: source });
			}
		}

		return { incoming, outgoing };
	}, [selected_node_id, graph]);

	const replay_details = useMemo(
		() => (node ? build_node_replay_details(node, graph, entries) : null),
		[node, graph, entries],
	);

	if (!node) return null;

	return (
		<aside className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
			{/* Header */}
			<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-none">
				<div className="flex items-center gap-2 min-w-0">
					<Info className="size-3.5 text-muted-foreground shrink-0" />
					<span className="text-xs font-medium truncate">{node.label}</span>
				</div>
				<Button variant="ghost" size="xs" onClick={on_close}>
					<X className="size-3.5" />
				</Button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
				{/* Temporal context banner */}
				{temporal_lens && temporal_lens.kind !== "full_session" && (
					<div className="flex items-center gap-1.5 rounded-md bg-primary/5 border border-primary/20 px-2.5 py-1.5">
						<Clock className="size-3 text-primary shrink-0" />
						<span className="text-[10px] text-primary font-medium">
							{temporal_lens.kind === "built_so_far"
								? `Built so far by end of Turn ${temporal_lens.selected_turn_index + 1}`
								: `Arrival path to ${temporal_lens.target_label}`}
						</span>
					</div>
				)}

				{/* Properties */}
				<div>
					<SectionLabel>Properties</SectionLabel>
					<div className="mt-1 space-y-1">
						<PropertyRow label="Kind">
							<Badge variant="outline" className="text-[10px]">
								{node.kind.replace(/_/g, " ")}
							</Badge>
						</PropertyRow>
						<PropertyRow label="Availability">
							<Badge
								className={cn(
									"text-[10px]",
									availability_badge_colors[node.availability],
								)}
							>
								{availability_labels[node.availability] ?? node.availability}
							</Badge>
						</PropertyRow>
						<PropertyRow label="Confidence">
							<span className="text-[10px]">{node.confidence}</span>
						</PropertyRow>
					</div>
				</div>

				{/* Summary section — context-dependent */}
				{summary?.kind === "turn" && (
					<TurnSummarySection summary={summary} />
				)}
				{summary?.kind === "file" && (
					<FileSummarySection summary={summary} />
				)}
				{summary?.kind === "instruction" && (
					<InstructionSummarySection summary={summary} />
				)}

				{/* Rich replay-backed node details */}
				{replay_details && replay_details.stats.length > 0 && (
					<div>
						<SectionLabel>Node stats</SectionLabel>
						<div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
							{replay_details.stats.map((stat) => (
								<SummaryTextItem
									key={`${stat.label}-${stat.value}`}
									label={stat.label}
									value={stat.value}
								/>
							))}
						</div>
					</div>
				)}

				{replay_details && replay_details.text_sections.map((section, index) => (
					<div key={`${section.title}-${index}`}>
						<SectionLabel>{section.title}</SectionLabel>
						<div className="mt-1">
							<TextPreview text={section.text} max_lines={24} />
						</div>
					</div>
				))}

				{replay_details && replay_details.file_activity.length > 0 && (
					<div>
						<SectionLabel>Observed activity</SectionLabel>
						<div className="mt-1 space-y-2">
							{replay_details.file_activity.map((activity) => (
								<FileActivityCard
									key={`${activity.tool_node_id}-${activity.action}`}
									activity={activity}
									on_select_node={on_select_node}
								/>
							))}
						</div>
					</div>
				)}

				{replay_details && replay_details.json_sections.map((section, index) => (
					<div key={`${section.title}-${index}`}>
						<SectionLabel>{section.title}</SectionLabel>
						<div className="mt-1">
							<JsonPreview data={section.data} />
						</div>
					</div>
				))}

				{replay_details && replay_details.raw_entries.length > 0 && (
					<div>
						<SectionLabel>Replay entries</SectionLabel>
						<div className="mt-1 space-y-2">
							{replay_details.raw_entries.map((entry) => (
								<div key={entry.id} className="rounded-sm border border-border/50 p-2 space-y-1">
									<div className="flex items-center justify-between gap-2 text-[9px] text-muted-foreground uppercase tracking-wider">
										<span>{entry.type}</span>
										<span className="font-mono normal-case">{entry.id}</span>
									</div>
									<JsonPreview data={entry} />
								</div>
							))}
						</div>
					</div>
				)}

				{/* Narrative summary */}
				{narrative && (
					<div className="rounded-md bg-muted/40 px-2.5 py-2">
						<p className="text-[11px] text-foreground leading-relaxed">
							{narrative}
						</p>
					</div>
				)}

				{/* Temporal narrative */}
				{temporal_narrative && (
					<div className="rounded-md bg-primary/5 border border-primary/10 px-2.5 py-2">
						<p className="text-[10px] text-primary/80 leading-relaxed">
							{temporal_narrative}
						</p>
					</div>
				)}

				{/* Graph-mode insight summary */}
				{insight_summary && (
					<InsightSummarySection summary={insight_summary} />
				)}

				{/* Question actions */}
				{question_actions.length > 0 && on_apply_action && (
					<div>
						<SectionLabel>Quick actions</SectionLabel>
						<div className="mt-1 flex flex-wrap gap-1">
							{question_actions.map((action) => (
								<button
									key={action.id}
									type="button"
									className="text-[10px] px-2 py-0.5 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors text-left"
									onClick={() => on_apply_action(action)}
								>
									{action.label}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Evidence */}
				{node.evidence.length > 0 && (
					<div>
						<SectionLabel>Evidence</SectionLabel>
						<div className="mt-1 space-y-1.5">
							{node.evidence.map((ev, idx) => (
								<div
									key={`${ev.kind}-${ev.source_ref ?? idx}`}
									className="px-2 py-1 rounded-sm"
								>
									<Badge
										className={cn("text-[9px]", evidence_colors[ev.kind])}
									>
										{evidence_labels[ev.kind] ?? ev.kind}
									</Badge>
									{ev.detail && (
										<p className="text-[10px] text-muted-foreground mt-0.5">
											{ev.detail}
										</p>
									)}
									{ev.source_ref && (
										<p className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono truncate">
											ref: {ev.source_ref}
										</p>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{node.evidence.length === 0 && (
					<div>
						<SectionLabel>Evidence</SectionLabel>
						<p className="text-[10px] text-muted-foreground mt-1 italic">
							No evidence available — this context is not captured in session
							logs.
						</p>
					</div>
				)}

				{/* How it was reached — full arrival paths for files/docs */}
				{arrival_paths.length > 0 && (
					<div>
						<SectionLabel>
							<ArrowDown className="size-2.5 inline mr-1" />
							How it was reached
						</SectionLabel>
						<div className="mt-1 space-y-1.5">
							{arrival_paths.map((ap, idx) => (
								<ArrivalPathRow
									key={`${ap.tool_node_id}-${ap.action}-${idx}`}
									path={ap}
									on_select_node={on_select_node}
								/>
							))}
						</div>
					</div>
				)}

				{/* Fallback: raw incoming edges for non-file nodes */}
				{arrival_paths.length === 0 && connected_edges.incoming.length > 0 && (
					<div>
						<SectionLabel>
							<ArrowDown className="size-2.5 inline mr-1" />
							How it was reached
						</SectionLabel>
						<div className="mt-1 space-y-1">
							{connected_edges.incoming.map(({ edge, node: other }) => (
								<RelationshipButton
									key={`${edge.source_id}-${edge.kind}`}
									direction="incoming"
									edge={edge}
									other_node={other}
									on_click={() => on_select_node(other.id)}
								/>
							))}
						</div>
					</div>
				)}

				{/* Outgoing relationships (What followed) */}
				{connected_edges.outgoing.length > 0 && (
					<div>
						<SectionLabel>
							<ArrowUp className="size-2.5 inline mr-1" />
							What followed from this
						</SectionLabel>
						<div className="mt-1 space-y-1">
							{connected_edges.outgoing.map(({ edge, node: other }) => (
								<RelationshipButton
									key={`${edge.target_id}-${edge.kind}`}
									direction="outgoing"
									edge={edge}
									other_node={other}
									on_click={() => on_select_node(other.id)}
								/>
							))}
						</div>
					</div>
				)}

				{/* Metadata */}
				{node.metadata && Object.keys(node.metadata).length > 0 && (
					<div>
						<SectionLabel>Metadata</SectionLabel>
						<div className="mt-1 space-y-0.5">
							{Object.entries(node.metadata).map(([key, value]) => (
								<div
									key={key}
									className="flex items-center gap-2 text-[10px]"
								>
									<span className="text-muted-foreground">{key}:</span>
									<span className="truncate">{String(value)}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</aside>
	);
}

// ── Reusable components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
			{children}
		</span>
	);
}

function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-[10px] text-muted-foreground">{label}:</span>
			{children}
		</div>
	);
}

function RelationshipButton({
	direction,
	edge,
	other_node,
	on_click,
}: {
	direction: "incoming" | "outgoing";
	edge: GraphEdge;
	other_node: GraphNode;
	on_click: () => void;
}) {
	return (
		<button
			type="button"
			className="w-full flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm hover:bg-accent/50 transition-colors text-left"
			onClick={on_click}
		>
			<ArrowRight
				className={cn(
					"size-2.5 text-muted-foreground shrink-0",
					direction === "incoming" && "rotate-180",
				)}
			/>
			<span className="truncate flex-1">{other_node.label}</span>
			<Badge
				className={cn(
					"text-[9px] ml-auto shrink-0",
					availability_badge_colors[edge.availability],
				)}
			>
				{edge.kind.replace(/_/g, " ")}
			</Badge>
		</button>
	);
}

// ── Summary sections ────────────────────────────────────────────────────────

function TurnSummarySection({ summary }: { summary: TurnSummary }) {
	return (
		<div>
			<SectionLabel>Turn Summary</SectionLabel>
			<div className="mt-1 grid grid-cols-2 gap-1">
				<SummaryItem label="Searches" value={summary.searches} />
				<SummaryItem label="Files explored" value={summary.files_explored} />
				<SummaryItem label="Docs explored" value={summary.docs_explored} />
				<SummaryItem label="Edits" value={summary.edits} />
				<SummaryItem label="Writes" value={summary.writes} />
			</div>
		</div>
	);
}

function FileSummarySection({ summary }: { summary: FileSummary }) {
	return (
		<div>
			<SectionLabel>File Summary</SectionLabel>
			<div className="mt-1 space-y-1">
				<div className="grid grid-cols-2 gap-1">
					<SummaryItem label="Reads" value={summary.reads} />
					<SummaryItem label="Edits" value={summary.edits} />
					<SummaryItem label="Writes" value={summary.writes} />
					<SummaryItem label="Upstream docs" value={summary.upstream_docs} />
					<SummaryItem
						label="Upstream instructions"
						value={summary.upstream_instructions}
					/>
					{summary.nearby_unexplored_count > 0 && (
						<SummaryItem
							label="Unexplored neighbors"
							value={summary.nearby_unexplored_count}
						/>
					)}
				</div>
				{summary.first_seen_turn !== null && (
					<div className="text-[10px] text-muted-foreground">
						First seen: Turn {summary.first_seen_turn + 1}
					</div>
				)}
				<Badge
					variant={summary.is_explored ? "default" : "secondary"}
					className="text-[10px]"
				>
					{summary.is_explored ? "Explored" : "Unexplored neighbor"}
				</Badge>
			</div>
		</div>
	);
}

function InstructionSummarySection({
	summary,
}: {
	summary: InstructionSummary;
}) {
	return (
		<div>
			<SectionLabel>Influence Summary</SectionLabel>
			<div className="mt-1 grid grid-cols-2 gap-1">
				<SummaryItem label="Downstream files" value={summary.downstream_files} />
				<SummaryItem label="Downstream edits" value={summary.downstream_edits} />
			</div>
			<Badge
				className={cn(
					"text-[10px] mt-1",
					availability_badge_colors[summary.availability],
				)}
			>
				{availability_labels[summary.availability] ?? summary.availability}
			</Badge>
		</div>
	);
}

function SummaryItem({ label, value }: { label: string; value: number }) {
	return (
		<div className="text-[10px]">
			<span className="text-muted-foreground">{label}: </span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

function SummaryTextItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="text-[10px] min-w-0">
			<span className="text-muted-foreground">{label}: </span>
			<span className="break-all">{value}</span>
		</div>
	);
}

function TextPreview({
	text,
	max_lines = 12,
}: {
	text: string;
	max_lines?: number;
}) {
	const lines = text.split("\n");
	const truncated = lines.length > max_lines;
	const display = truncated
		? `${lines.slice(0, max_lines).join("\n")}\n…`
		: text;

	return (
		<pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-sm max-h-80 overflow-y-auto leading-relaxed">
			{display}
		</pre>
	);
}

function JsonPreview({ data }: { data: unknown }) {
	return (
		<pre className="text-[9px] font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-sm max-h-80 overflow-y-auto leading-relaxed">
			{JSON.stringify(data, null, 2)}
		</pre>
	);
}

function FileActivityCard({
	activity,
	on_select_node,
}: {
	activity: FileActivityDetail;
	on_select_node: (node_id: string) => void;
}) {
	return (
		<div className="rounded-sm border border-border/50 p-2 space-y-2">
			<div className="flex items-center gap-1.5">
				<Badge
					className={cn(
						"text-[9px]",
						action_colors[activity.action] ?? "text-muted-foreground bg-muted",
					)}
				>
					{action_labels[activity.action] ?? activity.action}
				</Badge>
				{activity.turn_index !== null && (
					<span className="text-[9px] text-muted-foreground">
						Turn {activity.turn_index + 1}
					</span>
				)}
				{activity.tool_index !== null && (
					<span className="text-[9px] text-muted-foreground">
						Tool {activity.tool_index + 1}
					</span>
				)}
			</div>

			<button
				type="button"
				className="w-full text-left text-[10px] hover:bg-accent/50 rounded-sm px-1 py-0.5 transition-colors"
				onClick={() => on_select_node(activity.tool_node_id)}
			>
				{activity.tool_label}
			</button>

			{activity.tool_arguments && (
				<div>
					<div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
						Input
					</div>
					<JsonPreview data={activity.tool_arguments} />
				</div>
			)}

			{activity.result_text && (
				<div>
					<div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
						Output
					</div>
					<TextPreview text={activity.result_text} max_lines={16} />
				</div>
			)}

			{Boolean(activity.result_details) && (
				<div>
					<div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
						Parsed result
					</div>
					<JsonPreview data={activity.result_details} />
				</div>
			)}

			{activity.result_is_error && (
				<Badge className="text-[9px] bg-red-500/10 text-red-600">
					Tool result error
				</Badge>
			)}
		</div>
	);
}

// ── Insight summary section ──────────────────────────────────────────────────

function InsightSummarySection({ summary }: { summary: InsightSummary }) {
	return (
		<div className="rounded-md bg-muted/30 border border-border/50 px-2.5 py-2 space-y-1.5">
			<SectionLabel>Graph Insight</SectionLabel>

			{summary.primary_path_label && (
				<div className="space-y-0.5">
					<span className="text-[9px] text-primary font-medium uppercase tracking-wider">
						Primary path
					</span>
					<p className="text-[10px] text-foreground leading-relaxed font-mono">
						{summary.primary_path_label}
					</p>
				</div>
			)}

			{summary.supporting_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] text-amber-500 font-medium uppercase tracking-wider">
						Supporting
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.supporting_labels.join(", ")}
					</p>
				</div>
			)}

			{summary.structural_ref_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] text-cyan-500 font-medium uppercase tracking-wider">
						Structural references
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.structural_ref_labels.join(", ")}
					</p>
				</div>
			)}

			{summary.downstream_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] text-orange-500 font-medium uppercase tracking-wider">
						Downstream effects
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.downstream_labels.join(", ")}
					</p>
				</div>
			)}
		</div>
	);
}

// ── Arrival path row ────────────────────────────────────────────────────────

const action_labels: Record<string, string> = {
	read: "Read",
	edited: "Edited",
	wrote: "Written",
};

const action_colors: Record<string, string> = {
	read: "text-green-600 bg-green-500/10",
	edited: "text-orange-600 bg-orange-500/10",
	wrote: "text-purple-600 bg-purple-500/10",
};

function ArrivalPathRow({
	path,
	on_select_node,
}: {
	path: ArrivalPath;
	on_select_node: (node_id: string) => void;
}) {
	return (
		<div className="rounded-sm border border-border/50 px-2 py-1.5 space-y-1">
			{/* Action badge */}
			<div className="flex items-center gap-1.5">
				<Badge
					className={cn(
						"text-[9px]",
						action_colors[path.action] ?? "text-muted-foreground bg-muted",
					)}
				>
					{action_labels[path.action] ?? path.action}
				</Badge>
				{path.turn_index !== null && (
					<span className="text-[9px] text-muted-foreground tabular-nums">
						Turn {path.turn_index + 1}
					</span>
				)}
			</div>

			{/* User prompt that triggered this */}
			{path.user_message && path.user_prompt_node_id && (
				<button
					type="button"
					className="w-full flex items-start gap-1.5 text-left hover:bg-accent/50 rounded-sm px-1 py-0.5 transition-colors"
					onClick={() => on_select_node(path.turn_node_id ?? path.user_prompt_node_id!)}
				>
					<ArrowRight className="size-2.5 text-blue-500 mt-0.5 shrink-0" />
					<span className="text-[10px] text-foreground line-clamp-2">
						{path.user_message}
					</span>
				</button>
			)}

			{/* Tool that performed the action */}
			<button
				type="button"
				className="w-full flex items-center gap-1.5 text-left hover:bg-accent/50 rounded-sm px-1 py-0.5 transition-colors"
				onClick={() => on_select_node(path.tool_node_id)}
			>
				<ArrowRight className="size-2.5 text-muted-foreground shrink-0" />
				<span className="text-[10px] text-muted-foreground truncate">
					{path.tool_label}
				</span>
			</button>
		</div>
	);
}
