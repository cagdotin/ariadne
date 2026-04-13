/**
 * Exploration inspector v2 — graph-native inspector pane.
 *
 * Shows provenance, summaries, and graph relationships for a selected node.
 * Works directly with SessionGraphPayload rather than ExplorationPayload.
 */

import type { GraphEdge, GraphNode, SessionGraphPayload } from "@contracts/graph";
import { ArrowDown, ArrowRight, ArrowUp, Info, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	compute_arrival_paths,
	compute_node_summary,
	type ArrivalPath,
	type FileSummary,
	type InstructionSummary,
	type TurnSummary,
} from "@/lib/exploration-inspector-summaries";
import { cn } from "@/lib/utils";

interface ExplorationInspectorV2Props {
	selected_node_id: string;
	graph: SessionGraphPayload;
	on_select_node: (node_id: string) => void;
	on_close: () => void;
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
	on_select_node,
	on_close,
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
