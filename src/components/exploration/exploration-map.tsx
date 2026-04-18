/**
 * Exploration context map — graph-native right pane.
 *
 * Replaces the grouped artifact browser with a path-emphasized layered
 * context map. Nodes are arranged in semantic lanes with drawn connectors.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import {
	Brain,
	Cpu,
	Eye,
	File,
	FileCode,
	FileEdit,
	FileText,
	FolderOpen,
	Hash,
	MessageSquare,
	Search,
	ShieldQuestion,
	Sparkles,
	Terminal,
	Zap,
} from "lucide-react";
import { useMemo } from "react";
import {
	assign_lanes,
	compute_map_edges,
	compute_map_nodes,
	compute_styling_state,
	lane_labels,
	lane_order,
	type LaneId,
	type MapEdge,
	type MapNode,
	type RouteConnector,
	type StylingState,
	type VisibilityOptions,
} from "@/lib/exploration-graph-view-model";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";
import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-view";
import { MiddlePaneModeToggle } from "./exploration-graph";

interface ExplorationMapProps {
	graph: SessionGraphPayload;
	selected_node_id: string | null;
	highlighted_node_ids: Set<string>;
	visibility?: VisibilityOptions;
	route_connectors?: RouteConnector[];
	temporal_lens?: TemporalLens;
	middle_pane_mode?: MiddlePaneMode;
	on_set_middle_pane_mode?: (mode: MiddlePaneMode) => void;
	on_select_node: (node_id: string) => void;
}

// ── Node styling ────────────────────────────────────────────────────────────

const lane_icons: Record<LaneId, typeof File> = {
	framing: Sparkles,
	prompts: MessageSquare,
	discovery: Search,
	docs: FileText,
	files: Eye,
	outputs: FileEdit,
	context: FolderOpen,
};

const lane_colors: Record<LaneId, string> = {
	framing: "border-amber-500/30 bg-amber-500/5",
	prompts: "border-blue-500/30 bg-blue-500/5",
	discovery: "border-amber-400/30 bg-amber-400/5",
	docs: "border-cyan-500/30 bg-cyan-500/5",
	files: "border-green-500/30 bg-green-500/5",
	outputs: "border-orange-500/30 bg-orange-500/5",
	context: "border-muted bg-muted/20",
};

const lane_header_colors: Record<LaneId, string> = {
	framing: "text-amber-600",
	prompts: "text-blue-600",
	discovery: "text-amber-500",
	docs: "text-cyan-600",
	files: "text-green-600",
	outputs: "text-orange-600",
	context: "text-muted-foreground",
};

const styling_opacity: Record<StylingState, string> = {
	observed: "opacity-100",
	ambient: "opacity-70",
	inferred: "opacity-50",
	unavailable: "opacity-30",
};

const styling_border: Record<StylingState, string> = {
	observed: "border-solid",
	ambient: "border-dashed",
	inferred: "border-dashed",
	unavailable: "border-dotted",
};

function get_node_icon(node: MapNode): typeof File {
	const kind = node.node.kind;
	if (kind === "session_framing") return Sparkles;
	if (kind === "runtime_context") {
		if (node.node.label.startsWith("cwd:")) return FolderOpen;
		if (node.node.label.startsWith("Model:")) return Cpu;
		if (node.node.label.startsWith("Thinking:")) return Brain;
		return Zap;
	}
	if (kind === "system_prompt" || kind === "developer_prompt")
		return ShieldQuestion;
	if (kind === "agents_doc" || kind === "instruction_source") return FileText;
	if (kind === "user_prompt") return MessageSquare;
	if (kind === "assistant_turn") return Terminal;
	if (kind === "search_query") return Search;
	if (kind === "tool_call") return Terminal;
	if (kind === "doc_file") return FileText;
	if (kind === "doc_section") return Hash;
	if (kind === "source_file") {
		if (node.is_edited) return FileEdit;
		return FileCode;
	}
	return File;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExplorationMap({
	graph,
	selected_node_id,
	highlighted_node_ids,
	visibility = {},
	route_connectors = [],
	temporal_lens,
	middle_pane_mode,
	on_set_middle_pane_mode,
	on_select_node,
}: ExplorationMapProps) {
	const lanes = useMemo(() => assign_lanes(graph), [graph]);
	const map_nodes = useMemo(
		() => compute_map_nodes(graph, lanes, visibility),
		[graph, lanes, visibility],
	);
	const map_edges = useMemo(
		() => compute_map_edges(graph, map_nodes, visibility),
		[graph, map_nodes, visibility],
	);

	// Group nodes by lane
	const nodes_by_lane = useMemo(() => {
		const groups = new Map<LaneId, MapNode[]>();
		for (const lane of lane_order) groups.set(lane, []);
		for (const mn of map_nodes) {
			const lane_nodes = groups.get(mn.lane);
			if (lane_nodes) lane_nodes.push(mn);
		}
		return groups;
	}, [map_nodes]);

	// Determine which lanes have content
	const active_lanes = useMemo(
		() => lane_order.filter((l) => (nodes_by_lane.get(l)?.length ?? 0) > 0),
		[nodes_by_lane],
	);

	const has_selection = selected_node_id !== null;

	if (map_nodes.length === 0) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">
					No context to display
				</p>
			</div>
		);
	}

	// Count primary connectors for route continuity indicator
	const primary_connector_count = route_connectors.filter((c) => c.emphasis === "primary").length;

	// Derive temporal lens label
	const temporal_label = useMemo(() => {
		if (!temporal_lens || temporal_lens.kind === "full_session") return null;
		if (temporal_lens.kind === "built_so_far") {
			return `Built to Turn ${temporal_lens.selected_turn_index + 1}`;
		}
		if (temporal_lens.kind === "arrival_path") {
			const short_label = temporal_lens.target_label.length > 30
				? `…${temporal_lens.target_label.slice(-28)}`
				: temporal_lens.target_label;
			return `Arrival path to ${short_label}`;
		}
		return null;
	}, [temporal_lens]);

	return (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="px-3 py-1.5 border-b border-border flex-none flex items-center gap-2">
				{middle_pane_mode && on_set_middle_pane_mode ? (
					<MiddlePaneModeToggle
						mode={middle_pane_mode}
						on_set_mode={on_set_middle_pane_mode}
					/>
				) : (
					<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
						Context Map
					</span>
				)}
				{temporal_label && (
					<span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium">
						{temporal_label}
					</span>
				)}
				{has_selection && primary_connector_count > 0 && (
					<span className="text-[9px] text-primary/70 tabular-nums">
						{primary_connector_count} route edges
					</span>
				)}
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
				{active_lanes.map((lane_id) => {
					const lane_nodes = nodes_by_lane.get(lane_id) ?? [];
					return (
						<LaneSection
							key={lane_id}
							lane_id={lane_id}
							nodes={lane_nodes}
							edges={map_edges}
							route_connectors={route_connectors}
							selected_node_id={selected_node_id}
							highlighted_node_ids={highlighted_node_ids}
							has_selection={has_selection}
							on_select_node={on_select_node}
						/>
					);
				})}
			</div>
		</div>
	);
}

// ── Lane section ────────────────────────────────────────────────────────────

function LaneSection({
	lane_id,
	nodes,
	edges,
	route_connectors,
	selected_node_id,
	highlighted_node_ids,
	has_selection,
	on_select_node,
}: {
	lane_id: LaneId;
	nodes: MapNode[];
	edges: MapEdge[];
	route_connectors: RouteConnector[];
	selected_node_id: string | null;
	highlighted_node_ids: Set<string>;
	has_selection: boolean;
	on_select_node: (node_id: string) => void;
}) {
	const LaneIcon = lane_icons[lane_id];
	const header_color = lane_header_colors[lane_id];

	return (
		<div className="space-y-1.5" data-lane={lane_id}>
			{/* Lane header */}
			<div className="flex items-center gap-1.5 px-1">
				<LaneIcon className={cn("size-3", header_color)} />
				<span
					className={cn(
						"text-[10px] font-medium uppercase tracking-wider",
						header_color,
					)}
				>
					{lane_labels[lane_id]}
				</span>
				<span className="text-[9px] text-muted-foreground tabular-nums">
					({nodes.length})
				</span>
			</div>

			{/* Nodes */}
			<div className="flex flex-wrap gap-1">
				{nodes.map((mn) => {
					const has_primary_connector = route_connectors.some(
						(c) => c.emphasis === "primary" &&
							(c.source_id === mn.node.id || c.target_id === mn.node.id),
					);
					return (
						<MapNodeButton
							key={mn.node.id}
							map_node={mn}
							lane_id={lane_id}
							is_selected={selected_node_id === mn.node.id}
							is_highlighted={highlighted_node_ids.has(mn.node.id)}
							has_selection={has_selection}
							has_primary_connector={has_primary_connector}
							edges={edges}
							on_select={() => on_select_node(mn.node.id)}
						/>
					);
				})}
			</div>
		</div>
	);
}

// ── Map node button ─────────────────────────────────────────────────────────

function MapNodeButton({
	map_node,
	lane_id,
	is_selected,
	is_highlighted,
	has_selection,
	has_primary_connector,
	edges,
	on_select,
}: {
	map_node: MapNode;
	lane_id: LaneId;
	is_selected: boolean;
	is_highlighted: boolean;
	has_selection: boolean;
	has_primary_connector: boolean;
	edges: MapEdge[];
	on_select: () => void;
}) {
	const Icon = get_node_icon(map_node);
	const styling = compute_styling_state(map_node.node.availability);
	const lane_color = lane_colors[lane_id];

	// Count connections for sizing hint
	const connection_count = edges.filter(
		(e) =>
			e.source_id === map_node.node.id ||
			e.target_id === map_node.node.id,
	).length;

	return (
		<button
			type="button"
			className={cn(
				"flex items-center gap-1.5 px-2 py-1 rounded-md border text-left transition-all",
				"hover:ring-1 hover:ring-primary/30",
				lane_color,
				styling_border[styling],
				styling_opacity[styling],
				// Selection emphasis
				is_selected && "ring-2 ring-primary bg-primary/10 opacity-100",
				is_highlighted &&
					!is_selected &&
					has_selection &&
					"ring-1 ring-primary/50 opacity-100",
				// Route continuity emphasis
				has_primary_connector &&
					!is_selected &&
					is_highlighted &&
					"border-primary/40",
				// Fade unrelated nodes when something is selected
				has_selection && !is_selected && !is_highlighted && "opacity-20",
				// Edited output emphasis
				map_node.is_edited &&
					!is_selected &&
					"ring-1 ring-orange-400/40",
			)}
			onClick={on_select}
			title={`${map_node.node.label} (${styling})`}
		>
			<Icon
				className={cn(
					"size-3 shrink-0",
					lane_header_colors[lane_id],
				)}
			/>
			<span className="text-[11px] truncate max-w-[160px]">
				{map_node.node.label}
			</span>
			{connection_count > 1 && (
				<span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
					{connection_count}
				</span>
			)}
		</button>
	);
}
