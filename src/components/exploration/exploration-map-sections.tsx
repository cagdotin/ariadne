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
import { Badge } from "@/components/ui/badge";
import {
	compute_styling_state,
	type LaneId,
	lane_labels,
	type MapEdge,
	type MapNode,
	type RouteConnector,
	type StylingState,
} from "@/lib/exploration-graph-view-model";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";
import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";
import { MiddlePaneModeToggle } from "./exploration-middle-pane-mode-toggle";

interface ExplorationMapHeaderProps {
	temporal_lens?: TemporalLens;
	middle_pane_mode?: MiddlePaneMode;
	on_set_middle_pane_mode?: (mode: MiddlePaneMode) => void;
	has_selection: boolean;
	primary_connector_count: number;
}

interface LaneSectionProps {
	lane_id: LaneId;
	nodes: MapNode[];
	edges: MapEdge[];
	route_connectors: RouteConnector[];
	selected_node_id: string | null;
	highlighted_node_ids: Set<string>;
	has_selection: boolean;
	on_select_node: (node_id: string) => void;
}

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

export function ExplorationMapHeader({
	temporal_lens,
	middle_pane_mode,
	on_set_middle_pane_mode,
	has_selection,
	primary_connector_count,
}: ExplorationMapHeaderProps) {
	const temporal_label = get_temporal_label(temporal_lens);

	return (
		<div className="flex flex-none items-center gap-2 border-b border-border px-3 py-1.5">
			{middle_pane_mode && on_set_middle_pane_mode ? (
				<MiddlePaneModeToggle
					mode={middle_pane_mode}
					on_set_mode={on_set_middle_pane_mode}
				/>
			) : (
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Context Map
				</span>
			)}
			{temporal_label && (
				<Badge className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary hover:bg-primary/10">
					{temporal_label}
				</Badge>
			)}
			{has_selection && primary_connector_count > 0 && (
				<span className="tabular-nums text-[9px] text-primary/70">
					{primary_connector_count} route edges
				</span>
			)}
		</div>
	);
}

export function LaneSection({
	lane_id,
	nodes,
	edges,
	route_connectors,
	selected_node_id,
	highlighted_node_ids,
	has_selection,
	on_select_node,
}: LaneSectionProps) {
	const LaneIcon = lane_icons[lane_id];
	const header_color = lane_header_colors[lane_id];

	return (
		<div className="space-y-1.5" data-lane={lane_id}>
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
				<span className="tabular-nums text-[9px] text-muted-foreground">
					({nodes.length})
				</span>
			</div>

			<div className="flex flex-wrap gap-1">
				{nodes.map((map_node) => {
					const has_primary_connector = route_connectors.some(
						(connector) =>
							connector.emphasis === "primary" &&
							(connector.source_id === map_node.node.id ||
								connector.target_id === map_node.node.id),
					);
					return (
						<MapNodeButton
							key={map_node.node.id}
							map_node={map_node}
							lane_id={lane_id}
							is_selected={selected_node_id === map_node.node.id}
							is_highlighted={highlighted_node_ids.has(map_node.node.id)}
							has_selection={has_selection}
							has_primary_connector={has_primary_connector}
							edges={edges}
							on_select={() => on_select_node(map_node.node.id)}
						/>
					);
				})}
			</div>
		</div>
	);
}

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
	const connection_count = edges.filter(
		(edge) =>
			edge.source_id === map_node.node.id ||
			edge.target_id === map_node.node.id,
	).length;

	return (
		<button
			type="button"
			className={cn(
				"flex items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-all",
				"hover:ring-1 hover:ring-primary/30",
				lane_color,
				styling_border[styling],
				styling_opacity[styling],
				is_selected && "bg-primary/10 opacity-100 ring-2 ring-primary",
				is_highlighted &&
					!is_selected &&
					has_selection &&
					"opacity-100 ring-1 ring-primary/50",
				has_primary_connector &&
					!is_selected &&
					is_highlighted &&
					"border-primary/40",
				has_selection && !is_selected && !is_highlighted && "opacity-20",
				map_node.is_edited && !is_selected && "ring-1 ring-orange-400/40",
			)}
			onClick={on_select}
			title={`${map_node.node.label} (${styling})`}
		>
			<Icon className={cn("size-3 shrink-0", lane_header_colors[lane_id])} />
			<span className="max-w-[160px] truncate text-[11px]">
				{map_node.node.label}
			</span>
			{connection_count > 1 && (
				<span className="shrink-0 tabular-nums text-[9px] text-muted-foreground">
					{connection_count}
				</span>
			)}
		</button>
	);
}

function get_node_icon(node: MapNode): typeof File {
	const kind = node.node.kind;
	if (kind === "session_framing") return Sparkles;
	if (kind === "runtime_context") {
		if (node.node.label.startsWith("cwd:")) return FolderOpen;
		if (node.node.label.startsWith("Model:")) return Cpu;
		if (node.node.label.startsWith("Thinking:")) return Brain;
		return Zap;
	}
	if (kind === "system_prompt" || kind === "developer_prompt") {
		return ShieldQuestion;
	}
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

function get_temporal_label(temporal_lens?: TemporalLens): string | null {
	if (!temporal_lens || temporal_lens.kind === "full_session") return null;
	if (temporal_lens.kind === "built_so_far") {
		return `Built to Turn ${temporal_lens.selected_turn_index + 1}`;
	}
	const short_label =
		temporal_lens.target_label.length > 30
			? `…${temporal_lens.target_label.slice(-28)}`
			: temporal_lens.target_label;
	return `Arrival path to ${short_label}`;
}
