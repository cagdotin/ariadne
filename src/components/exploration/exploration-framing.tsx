/**
 * Exploration framing panel — shows session framing context derived from
 * the session graph IR. Displays what shaped the agent before repo traversal.
 */

import type { GraphNode, SessionGraphPayload } from "@contracts/graph";
import {
	AlertTriangle,
	Brain,
	ChevronDown,
	ChevronRight,
	Cpu,
	FileText,
	FolderOpen,
	Info,
	ShieldQuestion,
	Sparkles,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ExplorationFramingProps {
	graph: SessionGraphPayload;
	show_ambient?: boolean;
	on_select_node?: (node: GraphNode) => void;
}

const availability_labels: Record<string, string> = {
	available_observed: "Observed",
	available_ambient: "Ambient",
	derived_inferred: "Inferred",
	unavailable: "Unavailable",
	unknown: "Unknown",
};

const availability_colors: Record<string, string> = {
	available_observed: "bg-green-500/10 text-green-600",
	available_ambient: "bg-blue-500/10 text-blue-600",
	derived_inferred: "bg-amber-500/10 text-amber-600",
	unavailable: "bg-muted text-muted-foreground",
	unknown: "bg-muted text-muted-foreground italic",
};

function get_framing_icon(node: GraphNode) {
	if (node.kind === "runtime_context") {
		if (node.label.startsWith("cwd:")) return FolderOpen;
		if (node.label.startsWith("Model:")) return Cpu;
		if (node.label.startsWith("Thinking:")) return Brain;
		if (node.label.startsWith("Runtime:")) return Zap;
	}
	if (node.kind === "system_prompt") return ShieldQuestion;
	if (node.kind === "developer_prompt") return ShieldQuestion;
	if (node.kind === "agents_doc") return FileText;
	if (node.kind === "instruction_source") return FileText;
	return Info;
}

function get_framing_icon_color(node: GraphNode): string {
	if (node.availability === "unavailable" || node.availability === "unknown") {
		return "text-muted-foreground";
	}
	if (node.kind === "runtime_context") {
		if (node.label.startsWith("cwd:")) return "text-blue-500";
		if (node.label.startsWith("Model:")) return "text-purple-500";
		if (node.label.startsWith("Thinking:")) return "text-amber-500";
		return "text-cyan-500";
	}
	if (node.kind === "agents_doc") return "text-green-500";
	if (node.kind === "instruction_source") return "text-green-400";
	return "text-muted-foreground";
}

export function ExplorationFraming({
	graph,
	show_ambient = true,
	on_select_node,
}: ExplorationFramingProps) {
	const [expanded, set_expanded] = useState(true);

	// Find framing-related nodes
	const framing_node = graph.nodes.find((n) => n.kind === "session_framing");
	if (!framing_node) return null;

	// Get all nodes connected from the framing node
	const framing_children_ids = new Set(
		graph.edges
			.filter((e) => e.source_id === framing_node.id)
			.map((e) => e.target_id),
	);

	const framing_children = graph.nodes.filter((n) =>
		framing_children_ids.has(n.id),
	);

	// Separate by category
	const runtime_nodes = framing_children.filter(
		(n) => n.kind === "runtime_context",
	);
	const prompt_nodes = framing_children.filter(
		(n) => n.kind === "system_prompt" || n.kind === "developer_prompt",
	);
	const instruction_nodes = framing_children
		.filter((n) => n.kind === "agents_doc" || n.kind === "instruction_source")
		.filter((n) => show_ambient || n.availability !== "available_ambient");

	const total =
		runtime_nodes.length + prompt_nodes.length + instruction_nodes.length;
	const unavailable_count = [...runtime_nodes, ...prompt_nodes, ...instruction_nodes].filter(
		(n) => n.availability === "unavailable" || n.availability === "unknown",
	).length;

	return (
		<div className="border-b border-border bg-muted/20">
			{/* Header */}
			<button
				type="button"
				className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30 transition-colors"
				onClick={() => set_expanded(!expanded)}
			>
				{expanded ? (
					<ChevronDown className="size-3 text-muted-foreground" />
				) : (
					<ChevronRight className="size-3 text-muted-foreground" />
				)}
				<Sparkles className="size-3 text-amber-500" />
				<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Session Framing
				</span>
				<span className="text-[9px] text-muted-foreground tabular-nums ml-auto">
					{total} sources
					{unavailable_count > 0 && (
						<span className="text-amber-500 ml-1">
							({unavailable_count} unavailable)
						</span>
					)}
				</span>
			</button>

			{/* Body */}
			{expanded && (
				<div className="px-3 pb-2 space-y-2">
					{/* Runtime context */}
					{runtime_nodes.length > 0 && (
						<div className="space-y-0.5">
							<span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
								Runtime Context
							</span>
							{runtime_nodes.map((node) => (
								<FramingItem
									key={node.id}
									node={node}
									on_click={on_select_node}
								/>
							))}
						</div>
					)}

					{/* Instruction sources */}
					{instruction_nodes.length > 0 && (
						<div className="space-y-0.5">
							<span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
								Instruction Sources
							</span>
							{instruction_nodes.map((node) => (
								<FramingItem
									key={node.id}
									node={node}
									on_click={on_select_node}
								/>
							))}
						</div>
					)}

					{/* Prompt availability */}
					{prompt_nodes.length > 0 && (
						<div className="space-y-0.5">
							<span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
								Prompt Context
							</span>
							{prompt_nodes.map((node) => (
								<FramingItem
									key={node.id}
									node={node}
									on_click={on_select_node}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ── Framing item ─────────────────────────────────────────────────────────────

function FramingItem({
	node,
	on_click,
}: {
	node: GraphNode;
	on_click?: (node: GraphNode) => void;
}) {
	const Icon = get_framing_icon(node);
	const icon_color = get_framing_icon_color(node);
	const is_unavailable =
		node.availability === "unavailable" || node.availability === "unknown";

	return (
		<button
			type="button"
			className={cn(
				"w-full flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-left",
				"hover:bg-accent/50 transition-colors",
				is_unavailable && "opacity-50",
			)}
			onClick={() => on_click?.(node)}
			title={
				node.evidence.length > 0
					? node.evidence.map((e) => e.detail ?? e.kind).join("; ")
					: undefined
			}
		>
			<Icon className={cn("size-3 shrink-0", icon_color)} />
			<span
				className={cn(
					"text-[11px] truncate flex-1",
					is_unavailable && "italic text-muted-foreground",
				)}
			>
				{node.label}
			</span>
			<Badge
				className={cn(
					"text-[8px] shrink-0",
					availability_colors[node.availability],
				)}
			>
				{availability_labels[node.availability] ?? node.availability}
			</Badge>
			{is_unavailable && (
				<AlertTriangle className="size-2.5 text-amber-500 shrink-0" />
			)}
		</button>
	);
}
