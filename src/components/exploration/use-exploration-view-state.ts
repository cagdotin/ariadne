import type { SessionGraphPayload } from "@contracts/graph";
import { useMemo } from "react";
import {
	compute_route_connectors,
	compute_selection_subgraph,
	type FocusMode,
	type VisibilityOptions,
} from "@/lib/exploration-graph-view-model";
import {
	compute_insight_subgraph,
	type InsightOptions,
} from "@/lib/exploration-insight-graph-view-model";
import {
	compute_arrival_contributors,
	compute_temporally_visible_nodes,
	derive_temporal_lens,
	type TemporalLens,
} from "@/lib/exploration-temporal-view-model";

interface UseExplorationViewStateOptions {
	graph?: SessionGraphPayload | null;
	selected_node_id: string | null;
	focus_mode: FocusMode;
	show_ambient: boolean;
	show_inferred: boolean;
	show_unexplored: boolean;
}

const empty_selection_subgraph = {
	highlighted_node_ids: new Set<string>(),
	highlighted_edge_keys: new Set<string>(),
};

const empty_insight_subgraph = {
	focal_node_id: null,
	nodes: [],
	edges: [],
};

export function use_exploration_view_state({
	graph,
	selected_node_id,
	focus_mode,
	show_ambient,
	show_inferred,
	show_unexplored,
}: UseExplorationViewStateOptions) {
	const selection_subgraph = useMemo(
		() =>
			graph
				? compute_selection_subgraph(selected_node_id, graph, focus_mode)
				: empty_selection_subgraph,
		[selected_node_id, graph, focus_mode],
	);

	const temporal_lens: TemporalLens = useMemo(
		() =>
			graph
				? derive_temporal_lens(selected_node_id, graph)
				: { kind: "full_session" },
		[selected_node_id, graph],
	);

	const temporally_visible_node_ids: Set<string> | undefined = useMemo(() => {
		if (!graph) return undefined;

		if (temporal_lens.kind === "built_so_far") {
			return compute_temporally_visible_nodes(graph, temporal_lens.cutoff);
		}

		if (temporal_lens.kind === "arrival_path") {
			return compute_arrival_contributors(temporal_lens.target_node_id, graph);
		}

		return undefined;
	}, [graph, temporal_lens]);

	const visibility: VisibilityOptions = useMemo(
		() => ({
			show_ambient,
			show_inferred,
			show_unexplored,
			artifact_first: true,
			scaffolding_node_ids:
				selected_node_id && selection_subgraph.highlighted_node_ids.size > 0
					? selection_subgraph.highlighted_node_ids
					: undefined,
			temporally_visible_node_ids,
		}),
		[
			show_ambient,
			show_inferred,
			show_unexplored,
			selected_node_id,
			selection_subgraph,
			temporally_visible_node_ids,
		],
	);

	const route_connectors = useMemo(
		() =>
			graph
				? compute_route_connectors(graph, selection_subgraph, visibility)
				: [],
		[graph, selection_subgraph, visibility],
	);

	const insight_options: InsightOptions = useMemo(
		() => ({ temporally_visible_node_ids }),
		[temporally_visible_node_ids],
	);

	const insight_subgraph = useMemo(
		() =>
			graph
				? compute_insight_subgraph(selected_node_id, graph, insight_options)
				: empty_insight_subgraph,
		[selected_node_id, graph, insight_options],
	);

	return {
		selection_subgraph,
		temporal_lens,
		temporally_visible_node_ids,
		visibility,
		route_connectors,
		insight_subgraph,
	};
}
