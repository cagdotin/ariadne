/**
 * Exploration view — graph-native composition layer.
 *
 * Orchestrates the path pane, context map, controls strip,
 * framing panel, and inspector. All state derives from
 * SessionGraphPayload.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { useEffect, useMemo, useState } from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
	compute_selection_subgraph,
	type FocusMode,
} from "@/lib/exploration-graph-view-model";
import { ExplorationControls } from "./exploration-controls";
import { ExplorationFraming } from "./exploration-framing";
import { ExplorationInspectorV2 } from "./exploration-inspector-v2";
import { ExplorationMap } from "./exploration-map";
import { ExplorationPath } from "./exploration-path";

interface ExplorationViewProps {
	graph?: SessionGraphPayload | null;
}

export function ExplorationView({ graph }: ExplorationViewProps) {
	const [selected_node_id, set_selected_node_id] = useState<string | null>(
		null,
	);
	const [focus_mode, set_focus_mode] = useState<FocusMode>("path");
	const [show_ambient, set_show_ambient] = useState(true);

	useEffect(() => {
		if (!graph || show_ambient || !selected_node_id) return;
		const selected_node = graph.nodes.find((node) => node.id === selected_node_id);
		if (selected_node?.availability === "available_ambient") {
			set_selected_node_id(null);
		}
	}, [graph, show_ambient, selected_node_id]);

	// Derive highlighted subgraph from selection + focus mode
	const selection_subgraph = useMemo(
		() =>
			graph
				? compute_selection_subgraph(selected_node_id, graph, focus_mode)
				: { highlighted_node_ids: new Set<string>(), highlighted_edge_keys: new Set<string>() },
		[selected_node_id, graph, focus_mode],
	);

	// If no graph, fall back to a simple message
	if (!graph) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">
					No graph data available
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{/* Session framing */}
			<ExplorationFraming
				graph={graph}
				show_ambient={show_ambient}
				on_select_node={(node) => set_selected_node_id(node.id)}
			/>

			{/* Controls strip with summary chips and focus mode */}
			<ExplorationControls
				graph={graph}
				focus_mode={focus_mode}
				on_focus_mode_change={set_focus_mode}
				show_ambient={show_ambient}
				on_toggle_ambient={() => set_show_ambient((v) => !v)}
			/>

			{/* Main split view */}
			<ResizablePanelGroup
				orientation="horizontal"
				className="flex-1 min-h-0 min-w-0"
			>
				{/* Left: Exploration Path */}
				<ResizablePanel defaultSize="35%" minSize="25%" className="min-w-0">
					<ExplorationPath
						graph={graph}
						selected_node_id={selected_node_id}
						highlighted_node_ids={selection_subgraph.highlighted_node_ids}
						on_select_node={set_selected_node_id}
					/>
				</ResizablePanel>

				<ResizableHandle />

				{/* Right: Context Map + Inspector */}
				<ResizablePanel defaultSize="65%" minSize="35%" className="min-w-0">
					<ResizablePanelGroup orientation="horizontal" className="min-h-0">
						<ResizablePanel
							defaultSize={selected_node_id ? "60%" : "100%"}
							minSize="40%"
							className="min-w-0"
						>
							<ExplorationMap
								graph={graph}
								selected_node_id={selected_node_id}
								highlighted_node_ids={
									selection_subgraph.highlighted_node_ids
								}
								show_ambient={show_ambient}
								on_select_node={set_selected_node_id}
							/>
						</ResizablePanel>

						{selected_node_id && (
							<>
								<ResizableHandle />
								<ResizablePanel
									defaultSize="40%"
									minSize="25%"
									maxSize="50%"
									className="min-w-0"
								>
									<ExplorationInspectorV2
										selected_node_id={selected_node_id}
										graph={graph}
										on_select_node={set_selected_node_id}
										on_close={() => set_selected_node_id(null)}
									/>
								</ResizablePanel>
							</>
						)}
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
