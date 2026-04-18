/**
 * Exploration graph — full-session topology surface.
 *
 * Renders the entire session exploration tree from SessionGraphPayload,
 * keeping selection as a shared highlight rather than the primary input.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import {
	BookOpen,
	FileCode,
	FileText,
	GitBranch,
	MessageSquare,
	Search,
	ShieldQuestion,
	Terminal,
} from "lucide-react";
import { useMemo } from "react";
import {
	compute_session_graph_layout,
	SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
	SESSION_GRAPH_LAYOUT_NODE_WIDTH,
	type SessionGraphLayoutEdge,
	type SessionGraphLayoutNode,
} from "@/lib/exploration-session-graph-layout";
import {
	project_session_graph_tree,
	type SessionGraphTreeEdgeRole,
} from "@/lib/exploration-session-graph-view-model";
import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-view";

// ── Shared toggle component ─────────────────────────────────────────────────

export function MiddlePaneModeToggle({
	mode,
	on_set_mode,
}: {
	mode: MiddlePaneMode;
	on_set_mode: (mode: MiddlePaneMode) => void;
}) {
	return (
		<div
			className="flex items-center gap-0.5 border border-border rounded-md overflow-hidden"
			data-testid="middle-pane-mode-toggle"
		>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "map"
						? "bg-primary text-primary-foreground"
						: "hover:bg-accent text-muted-foreground",
				)}
				onClick={() => on_set_mode("map")}
			>
				Map
			</button>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "graph"
						? "bg-primary text-primary-foreground"
						: "hover:bg-accent text-muted-foreground",
				)}
				onClick={() => on_set_mode("graph")}
			>
				Graph
			</button>
		</div>
	);
}

// ── Props ───────────────────────────────────────────────────────────────────

interface ExplorationGraphProps {
	graph: SessionGraphPayload;
	selected_node_id: string | null;
	show_ambient: boolean;
	show_inferred: boolean;
	show_unexplored: boolean;
	middle_pane_mode: MiddlePaneMode;
	on_set_middle_pane_mode: (mode: MiddlePaneMode) => void;
	on_select_node: (node_id: string) => void;
}

// ── Visual grammar ──────────────────────────────────────────────────────────

const edge_stroke_colors: Record<SessionGraphTreeEdgeRole, string> = {
	session: "hsl(var(--border))",
	framing: "hsl(38 92% 50%)",
};

const edge_stroke_dash: Record<SessionGraphTreeEdgeRole, string> = {
	session: "",
	framing: "6 4",
};

function get_node_icon(kind: string): typeof FileCode {
	if (kind === "user_prompt") return MessageSquare;
	if (kind === "assistant_turn" || kind === "tool_call") return Terminal;
	if (kind === "search_query") return Search;
	if (kind === "source_file") return FileCode;
	if (kind === "doc_file") return FileText;
	if (kind === "agents_doc") return ShieldQuestion;
	if (kind === "instruction_source" || kind === "session_framing") {
		return BookOpen;
	}
	return GitBranch;
}

function get_node_shell_class(node: SessionGraphLayoutNode): string {
	if (node.kind === "user_prompt") {
		return "border-primary/35 bg-primary/6";
	}
	if (node.kind === "assistant_turn") {
		return "border-primary/25 bg-primary/4";
	}
	if (node.kind === "search_query") {
		return "border-amber-500/35 bg-amber-500/7";
	}
	if (node.kind === "tool_call") {
		return "border-border bg-background";
	}
	if (node.kind === "source_file") {
		return "border-emerald-500/30 bg-emerald-500/6";
	}
	if (node.kind === "doc_file") {
		return "border-sky-500/30 bg-sky-500/6";
	}
	if (node.kind === "agents_doc") {
		return node.role === "framing"
			? "border-amber-500/35 bg-amber-500/7"
			: "border-sky-500/30 bg-sky-500/6";
	}
	if (node.role === "framing") {
		return "border-amber-500/35 bg-amber-500/7";
	}
	return "border-border bg-muted/20";
}

function get_node_icon_class(node: SessionGraphLayoutNode): string {
	if (node.kind === "user_prompt" || node.kind === "assistant_turn") {
		return "text-primary";
	}
	if (node.kind === "search_query") return "text-amber-500";
	if (node.kind === "source_file") return "text-emerald-500";
	if (node.kind === "doc_file") return "text-sky-500";
	if (node.role === "framing") return "text-amber-500";
	return "text-muted-foreground";
}

function format_selected_label(label: string): string {
	return label.length > 44 ? `${label.slice(0, 41)}…` : label;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExplorationGraph({
	graph,
	selected_node_id,
	show_ambient,
	show_inferred,
	show_unexplored,
	middle_pane_mode,
	on_set_middle_pane_mode,
	on_select_node,
}: ExplorationGraphProps) {
	const tree = useMemo(
		() =>
			project_session_graph_tree(graph, {
				show_ambient,
				show_inferred,
				show_unexplored,
			}),
		[graph, show_ambient, show_inferred, show_unexplored],
	);

	const layout = useMemo(
		() => compute_session_graph_layout(tree, selected_node_id),
		[tree, selected_node_id],
	);

	const selected_node = useMemo(
		() => graph.nodes.find((node) => node.id === selected_node_id) ?? null,
		[graph, selected_node_id],
	);

	const has_content = layout.nodes.length > 0;

	return (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="px-3 py-1.5 border-b border-border flex-none flex items-center gap-2 flex-wrap">
				<MiddlePaneModeToggle
					mode={middle_pane_mode}
					on_set_mode={on_set_middle_pane_mode}
				/>
				<span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium">
					Full session topology
				</span>
				{selected_node && (
					<span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
						Selected: {format_selected_label(selected_node.label)}
					</span>
				)}
				{has_content && (
					<span className="text-[9px] text-muted-foreground tabular-nums">
						{tree.nodes.length} nodes · {tree.edges.length} edges
					</span>
				)}
				<div className="h-3 w-px bg-border" />
				<div className="flex items-center gap-2 text-[9px] text-muted-foreground">
					<div className="flex items-center gap-1">
						<svg width="14" height="8" aria-hidden="true">
							<line
								x1="0"
								y1="4"
								x2="14"
								y2="4"
								stroke={edge_stroke_colors.session}
								strokeWidth="1.5"
							/>
						</svg>
						<span>Session</span>
					</div>
					<div className="flex items-center gap-1">
						<svg width="14" height="8" aria-hidden="true">
							<line
								x1="0"
								y1="4"
								x2="14"
								y2="4"
								stroke={edge_stroke_colors.framing}
								strokeWidth="1.5"
								strokeDasharray={edge_stroke_dash.framing}
							/>
						</svg>
						<span>Framing</span>
					</div>
				</div>
			</div>

			{!has_content ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
					<GitBranch className="size-6 text-muted-foreground/40" />
					<p className="text-[11px] text-muted-foreground">
						No graph content matches the current visibility filters
					</p>
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-auto">
					<div
						className="relative"
						style={{
							width: layout.width,
							height: layout.height,
							minWidth: "100%",
							minHeight: "100%",
						}}
					>
						<svg
							className="absolute inset-0 pointer-events-none"
							width={layout.width}
							height={layout.height}
							aria-hidden="true"
						>
							{layout.edges.map((edge) => (
								<GraphEdgeLine
									key={`${edge.source_id}-${edge.target_id}-${edge.kind}`}
									edge={edge}
								/>
							))}
						</svg>

						{layout.nodes.map((node) => (
							<GraphNodeCard
								key={node.id}
								node={node}
								on_select={() => on_select_node(node.id)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ── Edge layer ──────────────────────────────────────────────────────────────

function GraphEdgeLine({ edge }: { edge: SessionGraphLayoutEdge }) {
	const stroke = edge.is_on_selected_path
		? "hsl(var(--primary))"
		: edge_stroke_colors[edge.role];
	const width = edge.is_on_selected_path ? 2.5 : 1.5;
	const dash = edge_stroke_dash[edge.role];
	const opacity = edge.is_on_selected_path
		? 0.95
		: edge.role === "framing"
			? 0.75
			: 0.8;
	const d = edge.points
		.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`)
		.join(" ");

	return (
		<path
			d={d}
			fill="none"
			stroke={stroke}
			strokeWidth={width}
			strokeDasharray={dash || undefined}
			strokeLinejoin="round"
			opacity={opacity}
		/>
	);
}

// ── Node layer ──────────────────────────────────────────────────────────────

function GraphNodeCard({
	node,
	on_select,
}: {
	node: SessionGraphLayoutNode;
	on_select: () => void;
}) {
	const Icon = get_node_icon(node.kind);
	const shell_class = get_node_shell_class(node);
	const icon_class = get_node_icon_class(node);

	return (
		<button
			type="button"
			className={cn(
				"absolute flex items-center gap-1.5 px-2 rounded-md border text-left transition-all shadow-[0_1px_0_rgba(0,0,0,0.02)]",
				"hover:ring-1 hover:ring-primary/25 hover:z-10",
				shell_class,
				node.role === "framing" && "opacity-90",
				node.is_on_selected_path &&
					!node.is_selected &&
					"ring-1 ring-primary/20",
				node.is_selected && "ring-2 ring-primary bg-primary/10 z-10 shadow-sm",
			)}
			style={{
				left: node.x,
				top: node.y,
				width: SESSION_GRAPH_LAYOUT_NODE_WIDTH,
				height: SESSION_GRAPH_LAYOUT_NODE_HEIGHT,
			}}
			onClick={on_select}
			title={node.label}
		>
			<Icon className={cn("size-3 shrink-0", icon_class)} />
			<span className="text-[10px] truncate flex-1">{node.label}</span>
		</button>
	);
}
