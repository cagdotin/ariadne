/**
 * Exploration view — graph-native composition layer.
 *
 * Orchestrates the path pane, context map, controls strip,
 * framing panel, and inspector. All state derives from
 * SessionGraphPayload.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { SessionEntry } from "@/components/session-viewer/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
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
import { ExplorationControls } from "./exploration-controls";
import { ExplorationGraph } from "./exploration-graph";
import { ExplorationInspectorV2 } from "./exploration-inspector-v2";
import { ExplorationMap } from "./exploration-map";
import { ExplorationPath } from "./exploration-path";

export type MiddlePaneMode = "map" | "graph";

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
	}, [selected_node_id]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!graph || show_ambient || !selected_node_id) return;
		const selected_node = graph.nodes.find(
			(node) => node.id === selected_node_id,
		);
		if (selected_node?.availability === "available_ambient") {
			set_selected_node_id(null);
		}
	}, [graph, show_ambient, selected_node_id]);

	// Derive highlighted subgraph from selection + focus mode
	const selection_subgraph = useMemo(
		() =>
			graph
				? compute_selection_subgraph(selected_node_id, graph, focus_mode)
				: {
						highlighted_node_ids: new Set<string>(),
						highlighted_edge_keys: new Set<string>(),
					},
		[selected_node_id, graph, focus_mode],
	);

	// Derive temporal lens from selection
	const temporal_lens: TemporalLens = useMemo(
		() =>
			graph
				? derive_temporal_lens(selected_node_id, graph)
				: { kind: "full_session" },
		[selected_node_id, graph],
	);

	// Compute temporally visible nodes based on the active lens
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

	// Visibility options bundle — artifact-first map with selection scaffolding + temporal filtering
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

	// Derive route connectors
	const route_connectors = useMemo(
		() =>
			graph
				? compute_route_connectors(graph, selection_subgraph, visibility)
				: [],
		[graph, selection_subgraph, visibility],
	);

	// Derive insight subgraph for the inspector and question actions
	const insight_options: InsightOptions = useMemo(
		() => ({ temporally_visible_node_ids }),
		[temporally_visible_node_ids],
	);
	const insight_subgraph = useMemo(
		() =>
			graph
				? compute_insight_subgraph(selected_node_id, graph, insight_options)
				: { focal_node_id: null, nodes: [], edges: [] },
		[selected_node_id, graph, insight_options],
	);

	// ── Debug: dump graph data to console ────────────────────────────────────
	useEffect(() => {
		if (!graph) return;
		console.group("[Exploration] Session graph loaded");
		console.log("session_id:", graph.session_id);
		console.log("nodes:", graph.nodes.length, "edges:", graph.edges.length);
		console.table(
			graph.nodes.map((n) => ({
				id: n.id,
				kind: n.kind,
				label: n.label,
				availability: n.availability,
				turn_index: n.metadata?.turn_index ?? "",
				tool_index: n.metadata?.tool_index ?? "",
			})),
		);
		console.table(
			graph.edges.map((e) => ({
				source: e.source_id,
				target: e.target_id,
				kind: e.kind,
				availability: e.availability,
			})),
		);
		console.groupEnd();
	}, [graph]);

	useEffect(() => {
		if (!graph || !selected_node_id) return;
		const node = graph.nodes.find((n) => n.id === selected_node_id);
		console.group(
			`[Exploration] Selected: ${node?.label ?? selected_node_id} (${node?.kind})`,
		);
		console.log("temporal_lens:", temporal_lens);
		console.log(
			"insight subgraph:",
			insight_subgraph.nodes.length,
			"nodes,",
			insight_subgraph.edges.length,
			"edges",
		);
		if (insight_subgraph.nodes.length > 0) {
			console.table(
				insight_subgraph.nodes.map((n) => ({
					id: n.id,
					kind: n.node.kind,
					label: n.node.label,
					role: n.role,
				})),
			);
			console.table(
				insight_subgraph.edges.map((e) => ({
					source: e.source_id,
					target: e.target_id,
					kind: e.kind,
					role: e.role,
				})),
			);
		}
		if (temporally_visible_node_ids) {
			console.log(
				"temporally visible nodes:",
				temporally_visible_node_ids.size,
			);
		}
		console.groupEnd();
	}, [
		graph,
		selected_node_id,
		temporal_lens,
		insight_subgraph,
		temporally_visible_node_ids,
	]);

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
				<ResizableHandle className="relative group/handle">
					<Button
						variant="ghost"
						size="icon"
						className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 z-20 size-5 rounded-sm opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background border border-border shadow-sm hover:bg-accent"
						onClick={toggle_left_panel}
					>
						{left_collapsed
							? <PanelLeftOpen className="size-3" />
							: <PanelLeftClose className="size-3" />
						}
					</Button>
				</ResizableHandle>

				{/* Center + Right: Context Map + Inspector */}
				<ResizablePanel defaultSize="65%" minSize="35%" className="min-w-0">
					<ResizablePanelGroup orientation="horizontal" className="min-h-0">
						{/* Center: Map / Graph */}
						<ResizablePanel
							defaultSize="60%"
							minSize="30%"
							className="min-w-0"
						>
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
						<ResizableHandle className="relative group/handle">
							<Button
								variant="ghost"
								size="icon"
								className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 z-20 size-5 rounded-sm opacity-0 group-hover/handle:opacity-100 transition-opacity bg-background border border-border shadow-sm hover:bg-accent"
								onClick={toggle_right_panel}
							>
								{right_collapsed
									? <PanelRightOpen className="size-3" />
									: <PanelRightClose className="size-3" />
								}
							</Button>
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
									<p className="text-xs text-muted-foreground">Select a node to inspect</p>
								</div>
							)}
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
