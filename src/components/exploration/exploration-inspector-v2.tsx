/**
 * Exploration inspector v2 — graph-native inspector pane.
 *
 * Shows provenance, summaries, and graph relationships for a selected node.
 * Works directly with SessionGraphPayload rather than ExplorationPayload.
 */

import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "@contracts/graph";
import { ArrowDown, ArrowUp, Clock, Info, X } from "lucide-react";
import { useMemo } from "react";
import type { SessionEntry } from "@/components/session-viewer/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InsightSubgraph } from "@/lib/exploration-insight-graph-view-model";
import {
	compute_arrival_paths,
	compute_insight_summary,
	compute_narrative_summary,
	compute_node_summary,
	compute_temporal_narrative,
} from "@/lib/exploration-inspector-summaries";
import {
	compute_question_actions,
	type QuestionAction,
} from "@/lib/exploration-question-actions";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";
import { cn } from "@/lib/utils";
import { build_node_replay_details } from "./exploration-inspector-replay";
import {
	ArrivalPathRow,
	FileActivityCard,
	FileSummarySection,
	InsightSummarySection,
	InstructionSummarySection,
	JsonPreview,
	PropertyRow,
	RelationshipButton,
	SectionLabel,
	SummaryTextItem,
	TextPreview,
	TurnSummarySection,
} from "./exploration-inspector-sections";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";

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
		() =>
			graph.nodes.find((candidate) => candidate.id === selected_node_id) ??
			null,
		[graph.nodes, selected_node_id],
	);
	const node_by_id = useMemo(
		() => new Map(graph.nodes.map((candidate) => [candidate.id, candidate])),
		[graph.nodes],
	);

	const summary = useMemo(
		() => compute_node_summary(selected_node_id, graph),
		[selected_node_id, graph],
	);
	const arrival_paths = useMemo(
		() => compute_arrival_paths(selected_node_id, graph),
		[selected_node_id, graph],
	);
	const question_actions = useMemo(
		() => compute_question_actions(selected_node_id, graph),
		[selected_node_id, graph],
	);
	const narrative = useMemo(
		() => compute_narrative_summary(selected_node_id, graph),
		[selected_node_id, graph],
	);
	const temporal_narrative = useMemo(
		() =>
			temporal_lens
				? compute_temporal_narrative(selected_node_id, graph, temporal_lens)
				: null,
		[selected_node_id, graph, temporal_lens],
	);
	const insight_summary = useMemo(
		() =>
			middle_pane_mode === "graph" && insight_subgraph
				? compute_insight_summary(insight_subgraph)
				: null,
		[middle_pane_mode, insight_subgraph],
	);

	const connected_edges = useMemo(() => {
		const incoming: Array<{ edge: GraphEdge; node: GraphNode }> = [];
		const outgoing: Array<{ edge: GraphEdge; node: GraphNode }> = [];

		for (const edge of graph.edges) {
			if (edge.source_id === selected_node_id) {
				const target = node_by_id.get(edge.target_id);
				if (target) outgoing.push({ edge, node: target });
			}
			if (edge.target_id === selected_node_id) {
				const source = node_by_id.get(edge.source_id);
				if (source) incoming.push({ edge, node: source });
			}
		}

		return { incoming, outgoing };
	}, [selected_node_id, graph.edges, node_by_id]);

	const replay_details = useMemo(
		() => (node ? build_node_replay_details(node, graph, entries) : null),
		[node, graph, entries],
	);

	if (!node) return null;

	return (
		<aside className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
			<div className="flex flex-none items-center justify-between gap-2 border-b border-border px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<Info className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate text-xs font-medium">{node.label}</span>
				</div>
				<Button variant="ghost" size="xs" onClick={on_close}>
					<X className="size-3.5" />
				</Button>
			</div>

			<div className="flex-1 space-y-4 overflow-y-auto p-3">
				{temporal_lens && temporal_lens.kind !== "full_session" && (
					<div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
						<Clock className="size-3 shrink-0 text-primary" />
						<span className="text-[10px] font-medium text-primary">
							{temporal_lens.kind === "built_so_far"
								? `Built so far by end of Turn ${temporal_lens.selected_turn_index + 1}`
								: `Arrival path to ${temporal_lens.target_label}`}
						</span>
					</div>
				)}

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

				{summary?.kind === "turn" && <TurnSummarySection summary={summary} />}
				{summary?.kind === "file" && <FileSummarySection summary={summary} />}
				{summary?.kind === "instruction" && (
					<InstructionSummarySection summary={summary} />
				)}

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

				{replay_details?.text_sections.map((section) => (
					<div key={`${section.title}-${section.text}`}>
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

				{replay_details?.json_sections.map((section) => (
					<div key={`${section.title}-${JSON.stringify(section.data)}`}>
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
								<div
									key={entry.id}
									className="space-y-1 rounded-sm border border-border/50 p-2"
								>
									<div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-muted-foreground">
										<span>{entry.type}</span>
										<span className="font-mono normal-case">{entry.id}</span>
									</div>
									<JsonPreview data={entry} />
								</div>
							))}
						</div>
					</div>
				)}

				{narrative && (
					<div className="rounded-md bg-muted/40 px-2.5 py-2">
						<p className="text-[11px] leading-relaxed text-foreground">
							{narrative}
						</p>
					</div>
				)}

				{temporal_narrative && (
					<div className="rounded-md border border-primary/10 bg-primary/5 px-2.5 py-2">
						<p className="text-[10px] leading-relaxed text-primary/80">
							{temporal_narrative}
						</p>
					</div>
				)}

				{insight_summary && <InsightSummarySection summary={insight_summary} />}

				{question_actions.length > 0 && on_apply_action && (
					<div>
						<SectionLabel>Quick actions</SectionLabel>
						<div className="mt-1 flex flex-wrap gap-1">
							{question_actions.map((action) => (
								<button
									key={action.id}
									type="button"
									className="rounded-md border border-border bg-background px-2 py-0.5 text-left text-[10px] transition-colors hover:bg-accent/50"
									onClick={() => on_apply_action(action)}
								>
									{action.label}
								</button>
							))}
						</div>
					</div>
				)}

				<div>
					<SectionLabel>Evidence</SectionLabel>
					{node.evidence.length > 0 ? (
						<div className="mt-1 space-y-1.5">
							{node.evidence.map((evidence, index) => (
								<div
									key={`${evidence.kind}-${evidence.source_ref ?? index}`}
									className="rounded-sm px-2 py-1"
								>
									<Badge
										className={cn("text-[9px]", evidence_colors[evidence.kind])}
									>
										{evidence_labels[evidence.kind] ?? evidence.kind}
									</Badge>
									{evidence.detail && (
										<p className="mt-0.5 text-[10px] text-muted-foreground">
											{evidence.detail}
										</p>
									)}
									{evidence.source_ref && (
										<p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/70">
											ref: {evidence.source_ref}
										</p>
									)}
								</div>
							))}
						</div>
					) : (
						<p className="mt-1 text-[10px] italic text-muted-foreground">
							No evidence available — this context is not captured in session
							logs.
						</p>
					)}
				</div>

				{arrival_paths.length > 0 ? (
					<div>
						<SectionLabel>
							<ArrowDown className="mr-1 inline size-2.5" />
							How it was reached
						</SectionLabel>
						<div className="mt-1 space-y-1.5">
							{arrival_paths.map((path) => (
								<ArrivalPathRow
									key={`${path.tool_node_id}-${path.action}-${path.turn_index}-${path.user_prompt_node_id ?? "none"}`}
									path={path}
									on_select_node={on_select_node}
								/>
							))}
						</div>
					</div>
				) : connected_edges.incoming.length > 0 ? (
					<div>
						<SectionLabel>
							<ArrowDown className="mr-1 inline size-2.5" />
							How it was reached
						</SectionLabel>
						<div className="mt-1 space-y-1">
							{connected_edges.incoming.map(({ edge, node: other_node }) => (
								<RelationshipButton
									key={`${edge.source_id}-${edge.kind}`}
									direction="incoming"
									edge={edge}
									other_node={other_node}
									on_click={() => on_select_node(other_node.id)}
								/>
							))}
						</div>
					</div>
				) : null}

				{connected_edges.outgoing.length > 0 && (
					<div>
						<SectionLabel>
							<ArrowUp className="mr-1 inline size-2.5" />
							What followed from this
						</SectionLabel>
						<div className="mt-1 space-y-1">
							{connected_edges.outgoing.map(({ edge, node: other_node }) => (
								<RelationshipButton
									key={`${edge.target_id}-${edge.kind}`}
									direction="outgoing"
									edge={edge}
									other_node={other_node}
									on_click={() => on_select_node(other_node.id)}
								/>
							))}
						</div>
					</div>
				)}

				{node.metadata && Object.keys(node.metadata).length > 0 && (
					<div>
						<SectionLabel>Metadata</SectionLabel>
						<div className="mt-1 space-y-0.5">
							{Object.entries(node.metadata).map(([key, value]) => (
								<div key={key} className="flex items-center gap-2 text-[10px]">
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
