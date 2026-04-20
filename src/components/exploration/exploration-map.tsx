/**
 * Exploration context map — graph-native right pane.
 *
 * Replaces the grouped artifact browser with a path-emphasized layered
 * context map. Nodes are arranged in semantic lanes with drawn connectors.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { useMemo } from "react";
import {
	assign_lanes,
	compute_map_edges,
	compute_map_nodes,
	type LaneId,
	lane_order,
	type RouteConnector,
	type VisibilityOptions,
} from "@/lib/exploration-graph-view-model";
import type { TemporalLens } from "@/lib/exploration-temporal-view-model";
import { ExplorationMapHeader, LaneSection } from "./exploration-map-sections";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";

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
	const nodes_by_lane = useMemo(
		() => group_nodes_by_lane(map_nodes),
		[map_nodes],
	);
	const active_lanes = useMemo(
		() =>
			lane_order.filter(
				(lane_id) => (nodes_by_lane.get(lane_id)?.length ?? 0) > 0,
			),
		[nodes_by_lane],
	);
	const has_selection = selected_node_id !== null;
	const primary_connector_count = useMemo(
		() =>
			route_connectors.filter((connector) => connector.emphasis === "primary")
				.length,
		[route_connectors],
	);

	if (map_nodes.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<p className="text-sm text-muted-foreground">No context to display</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<ExplorationMapHeader
				temporal_lens={temporal_lens}
				middle_pane_mode={middle_pane_mode}
				on_set_middle_pane_mode={on_set_middle_pane_mode}
				has_selection={has_selection}
				primary_connector_count={primary_connector_count}
			/>
			<div className="flex-1 space-y-3 overflow-y-auto p-3">
				{active_lanes.map((lane_id) => (
					<LaneSection
						key={lane_id}
						lane_id={lane_id}
						nodes={nodes_by_lane.get(lane_id) ?? []}
						edges={map_edges}
						route_connectors={route_connectors}
						selected_node_id={selected_node_id}
						highlighted_node_ids={highlighted_node_ids}
						has_selection={has_selection}
						on_select_node={on_select_node}
					/>
				))}
			</div>
		</div>
	);
}

function group_nodes_by_lane(map_nodes: ReturnType<typeof compute_map_nodes>) {
	const groups = new Map<LaneId, ReturnType<typeof compute_map_nodes>>();
	for (const lane_id of lane_order) {
		groups.set(lane_id, []);
	}
	for (const map_node of map_nodes) {
		groups.get(map_node.lane)?.push(map_node);
	}
	return groups;
}
