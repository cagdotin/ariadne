/**
 * Exploration inspector v2 — graph-native inspector pane.
 *
 * Shows provenance, summaries, and graph relationships for a selected node.
 * Works directly with SessionGraphPayload rather than ExplorationPayload.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";
import { ArrowDown, ArrowRight, ArrowUp, Clock, Info, X } from "lucide-react";
import { useMemo } from "react";
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
