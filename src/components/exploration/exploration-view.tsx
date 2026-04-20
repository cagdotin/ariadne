/**
 * Exploration view — graph-native composition layer.
 *
 * Orchestrates the path pane, context map, controls strip,
 * framing panel, and inspector. All state derives from
 * SessionGraphPayload.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import {
	PanelLeftClose,
	PanelLeftOpen,
	PanelRightClose,
	PanelRightOpen,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { SessionEntry } from "@/components/session-viewer/types";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { FocusMode } from "@/lib/exploration-graph-view-model";
import { ExplorationControls } from "./exploration-controls";
import { ExplorationGraph } from "./exploration-graph";
import { ExplorationInspectorV2 } from "./exploration-inspector-v2";
import { ExplorationMap } from "./exploration-map";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";
import { ExplorationPanelToggleHandle } from "./exploration-panel-toggle-handle";
import { ExplorationPath } from "./exploration-path";
import { use_exploration_view_state } from "./use-exploration-view-state";

interface ExplorationViewProps {
	graph?: SessionGraphPayload | null;
	entries?: SessionEntry[];
}

export function ExplorationView({ graph, entries = [] }: ExplorationViewProps) {
	const [selected_node_id, set_selected_node_id] = useState<string | null>(
		null,
	);
	const [focus_mode, set_focus_mode] = useState<FocusMode>("path");
	const [show_ambient, set_show_ambient] = useState(true);
	const [show_inferred, set_show_inferred] = useState(true);
	const [show_unexplored, set_show_unexplored] = useState(true);
	const [middle_pane_mode, set_middle_pane_mode] =
		useState<MiddlePaneMode>("map");

	// ── Collapsible panel state ──────────────────────────────────────────────
	const left_panel_ref = useRef<PanelImperativeHandle>(null);
	const right_panel_ref = useRef<PanelImperativeHandle>(null);
	const [left_collapsed, set_left_collapsed] = useState(false);
	const [right_collapsed, set_right_collapsed] = useState(true);

	const toggle_left_panel = useCallback(() => {
		if (left_collapsed) {
			left_panel_ref.current?.expand();
		} else {
			left_panel_ref.current?.collapse();
		}
	}, [left_collapsed]);

	const toggle_right_panel = useCallback(() => {
		if (right_collapsed) {
			right_panel_ref.current?.expand();
		} else {
			right_panel_ref.current?.collapse();
		}
	}, [right_collapsed]);

	// Collapse right panel on mount
	useEffect(() => {
		right_panel_ref.current?.collapse();
	}, []);

	// Auto-expand right panel when a node is selected
	useEffect(() => {
		if (selected_node_id && right_collapsed) {
			right_panel_ref.current?.expand();
		}
	}, [selected_node_id, right_collapsed]);

	useEffect(() => {
		if (!graph || show_ambient || !selected_node_id) return;
		const selected_node = graph.nodes.find(
			(node) => node.id === selected_node_id,
		);
		if (selected_node?.availability === "available_ambient") {
			set_selected_node_id(null);
		}
	}, [graph, show_ambient, selected_node_id]);

	const {
		selection_subgraph,
		temporal_lens,
		visibility,
		route_connectors,
		insight_subgraph,
	} = use_exploration_view_state({
		graph,
		selected_node_id,
		focus_mode,
		show_ambient,
		show_inferred,
		show_unexplored,
	});

	// If no graph, fall back to a simple message
	if (!graph) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">No graph data available</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{/* Controls strip with summary chips and focus mode */}
			<ExplorationControls
				graph={graph}
				focus_mode={focus_mode}
				on_focus_mode_change={set_focus_mode}
				show_ambient={show_ambient}
				on_toggle_ambient={() => set_show_ambient((v) => !v)}
				show_inferred={show_inferred}
				on_toggle_inferred={() => set_show_inferred((v) => !v)}
				show_unexplored={show_unexplored}
				on_toggle_unexplored={() => set_show_unexplored((v) => !v)}
				left_collapsed={left_collapsed}
				on_toggle_left={toggle_left_panel}
				right_collapsed={right_collapsed}
				on_toggle_right={toggle_right_panel}
			/>

			{/* Main split view */}
			<ResizablePanelGroup
				orientation="horizontal"
				className="flex-1 min-h-0 min-w-0"
			>
				{/* Left: Exploration Path (collapsible) */}
				<ResizablePanel
					defaultSize="35%"
					minSize="20%"
					collapsible
					collapsedSize={0}
					panelRef={left_panel_ref}
					onResize={(size) => set_left_collapsed(size.asPercentage === 0)}
					className="min-w-0"
				>
					<ExplorationPath
						graph={graph}
						selected_node_id={selected_node_id}
						highlighted_node_ids={selection_subgraph.highlighted_node_ids}
						show_ambient={show_ambient}
						on_select_node={set_selected_node_id}
					/>
				</ResizablePanel>

				{/* Left handle with collapse toggle */}
				<ResizableHandle className="group/handle relative">
					<ExplorationPanelToggleHandle
						collapsed={left_collapsed}
						collapsed_icon={PanelLeftOpen}
						expanded_icon={PanelLeftClose}
						on_toggle={toggle_left_panel}
					/>
				</ResizableHandle>

				{/* Center + Right: Context Map + Inspector */}
				<ResizablePanel defaultSize="65%" minSize="35%" className="min-w-0">
					<ResizablePanelGroup orientation="horizontal" className="min-h-0">
						{/* Center: Map / Graph */}
						<ResizablePanel defaultSize="60%" minSize="30%" className="min-w-0">
							{middle_pane_mode === "map" ? (
								<ExplorationMap
									graph={graph}
									selected_node_id={selected_node_id}
									highlighted_node_ids={selection_subgraph.highlighted_node_ids}
									visibility={visibility}
									route_connectors={route_connectors}
									temporal_lens={temporal_lens}
									middle_pane_mode={middle_pane_mode}
									on_set_middle_pane_mode={set_middle_pane_mode}
									on_select_node={set_selected_node_id}
								/>
							) : (
								<ExplorationGraph
									graph={graph}
									selected_node_id={selected_node_id}
									show_ambient={show_ambient}
									show_inferred={show_inferred}
									show_unexplored={show_unexplored}
									middle_pane_mode={middle_pane_mode}
									on_set_middle_pane_mode={set_middle_pane_mode}
									on_select_node={set_selected_node_id}
								/>
							)}
						</ResizablePanel>

						{/* Right handle with collapse toggle */}
						<ResizableHandle className="group/handle relative">
							<ExplorationPanelToggleHandle
								collapsed={right_collapsed}
								collapsed_icon={PanelRightOpen}
								expanded_icon={PanelRightClose}
								on_toggle={toggle_right_panel}
							/>
						</ResizableHandle>

						{/* Right: Inspector (collapsible, always mounted) */}
						<ResizablePanel
							defaultSize="40%"
							minSize="20%"
							maxSize="50%"
							collapsible
							collapsedSize={0}
							panelRef={right_panel_ref}
							onResize={(size) => set_right_collapsed(size.asPercentage === 0)}
							className="min-w-0"
						>
							{selected_node_id ? (
								<ExplorationInspectorV2
									selected_node_id={selected_node_id}
									graph={graph}
									entries={entries}
									temporal_lens={temporal_lens}
									middle_pane_mode={middle_pane_mode}
									insight_subgraph={insight_subgraph}
									on_select_node={set_selected_node_id}
									on_close={toggle_right_panel}
									on_apply_action={(action) => {
										set_focus_mode(action.focus_mode);
									}}
								/>
							) : (
								<div className="flex items-center justify-center h-full p-4">
									<p className="text-xs text-muted-foreground">
										Select a node to inspect
									</p>
								</div>
							)}
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
