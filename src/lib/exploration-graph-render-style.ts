import type { GraphNode } from "@contracts/graph";
import type { SessionGraphTreeNodeRole } from "./exploration-session-graph-view-model";

export type GraphZoomBand = "overview" | "mid" | "detail";
export type GraphNodeChromeMode = "pill" | "compact" | "detail";
export type GraphNodeVisualWeight =
	| "primary"
	| "secondary"
	| "artifact"
	| "framing";

export interface GraphNodeRenderPolicyInput {
	scale: number;
	screen_width: number;
	kind: GraphNode["kind"];
	role: SessionGraphTreeNodeRole;
	is_selected: boolean;
	is_on_selected_path: boolean;
}

export const GRAPH_OVERVIEW_SCALE_CEILING = 0.3;
export const GRAPH_DETAIL_SCALE_FLOOR = 0.48;

export function get_graph_zoom_band(scale: number): GraphZoomBand {
	if (scale < GRAPH_OVERVIEW_SCALE_CEILING) return "overview";
	if (scale < GRAPH_DETAIL_SCALE_FLOOR) return "mid";
	return "detail";
}

export function get_graph_node_chrome_mode(scale: number): GraphNodeChromeMode {
	const zoom_band = get_graph_zoom_band(scale);
	if (zoom_band === "overview") return "pill";
	if (zoom_band === "mid") return "compact";
	return "detail";
}

export function get_graph_node_visual_weight(
	kind: GraphNode["kind"],
	role: SessionGraphTreeNodeRole,
): GraphNodeVisualWeight {
	if (
		role === "framing" ||
		kind === "session_framing" ||
		kind === "instruction_source"
	) {
		return "framing";
	}
	if (kind === "user_prompt" || kind === "assistant_turn") {
		return "primary";
	}
	if (kind === "tool_call" || kind === "search_query") {
		return "secondary";
	}
	if (kind === "source_file" || kind === "doc_file" || kind === "agents_doc") {
		return "artifact";
	}
	return "secondary";
}

export function should_render_graph_node_label(
	input: GraphNodeRenderPolicyInput,
): boolean {
	if (input.is_selected) return true;

	const zoom_band = get_graph_zoom_band(input.scale);
	const visual_weight = get_graph_node_visual_weight(input.kind, input.role);

	if (zoom_band === "overview") {
		return false;
	}

	if (zoom_band === "mid") {
		if (input.is_on_selected_path) return input.screen_width >= 48;
		if (visual_weight === "primary") return input.screen_width >= 56;
		if (visual_weight === "framing") return input.screen_width >= 68;
		return false;
	}

	if (input.is_on_selected_path) return input.screen_width >= 48;
	if (visual_weight === "artifact") return input.screen_width >= 104;
	if (visual_weight === "framing") return input.screen_width >= 92;
	return input.screen_width >= 84;
}

export function should_render_graph_node_accent(
	input: GraphNodeRenderPolicyInput,
): boolean {
	if (input.is_selected || input.is_on_selected_path) return true;

	const zoom_band = get_graph_zoom_band(input.scale);
	const visual_weight = get_graph_node_visual_weight(input.kind, input.role);

	if (zoom_band === "overview") return false;
	if (zoom_band === "mid") {
		return (
			(visual_weight === "primary" || visual_weight === "framing") &&
			input.screen_width >= 22
		);
	}
	return input.screen_width >= 24;
}
