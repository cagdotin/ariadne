import { describe, expect, it } from "vitest";
import {
	GRAPH_DETAIL_SCALE_FLOOR,
	GRAPH_OVERVIEW_SCALE_CEILING,
	get_graph_node_chrome_mode,
	get_graph_node_visual_weight,
	get_graph_zoom_band,
	should_render_graph_node_accent,
	should_render_graph_node_label,
} from "../../../src/lib/exploration-graph-render-style";

describe("exploration-graph-render-style", () => {
	it("derives overview, mid, and detail zoom bands from viewport scale", () => {
		expect(get_graph_zoom_band(GRAPH_OVERVIEW_SCALE_CEILING - 0.01)).toBe(
			"overview",
		);
		expect(get_graph_zoom_band(GRAPH_OVERVIEW_SCALE_CEILING)).toBe("mid");
		expect(get_graph_zoom_band(GRAPH_DETAIL_SCALE_FLOOR - 0.01)).toBe("mid");
		expect(get_graph_zoom_band(GRAPH_DETAIL_SCALE_FLOOR)).toBe("detail");
	});

	it("maps zoom bands onto node chrome modes", () => {
		expect(get_graph_node_chrome_mode(0.12)).toBe("pill");
		expect(get_graph_node_chrome_mode(0.32)).toBe("compact");
		expect(get_graph_node_chrome_mode(0.72)).toBe("detail");
	});

	it("classifies graph node visual weight by kind and role", () => {
		expect(get_graph_node_visual_weight("user_prompt", "session")).toBe(
			"primary",
		);
		expect(get_graph_node_visual_weight("search_query", "session")).toBe(
			"secondary",
		);
		expect(get_graph_node_visual_weight("doc_file", "artifact")).toBe(
			"artifact",
		);
		expect(get_graph_node_visual_weight("agents_doc", "framing")).toBe(
			"framing",
		);
	});

	it("keeps labels sparse at overview scale and artifact-light at mid scale", () => {
		expect(
			should_render_graph_node_label({
				scale: 0.12,
				screen_width: 96,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(false);

		expect(
			should_render_graph_node_label({
				scale: 0.12,
				screen_width: 96,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: true,
			}),
		).toBe(false);

		expect(
			should_render_graph_node_label({
				scale: 0.32,
				screen_width: 62,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(true);

		expect(
			should_render_graph_node_label({
				scale: 0.32,
				screen_width: 110,
				kind: "source_file",
				role: "artifact",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(false);
	});

	it("always keeps the selected node label visible regardless of band", () => {
		expect(
			should_render_graph_node_label({
				scale: 0.08,
				screen_width: 12,
				kind: "doc_file",
				role: "artifact",
				is_selected: true,
				is_on_selected_path: false,
			}),
		).toBe(true);
	});

	it("suppresses most accents at overview scale but keeps focused nodes marked", () => {
		expect(
			should_render_graph_node_accent({
				scale: 0.1,
				screen_width: 120,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(false);

		expect(
			should_render_graph_node_accent({
				scale: 0.1,
				screen_width: 120,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: true,
			}),
		).toBe(true);

		expect(
			should_render_graph_node_accent({
				scale: 0.34,
				screen_width: 32,
				kind: "assistant_turn",
				role: "session",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(true);

		expect(
			should_render_graph_node_accent({
				scale: 0.34,
				screen_width: 32,
				kind: "search_query",
				role: "session",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(false);

		expect(
			should_render_graph_node_accent({
				scale: 0.34,
				screen_width: 32,
				kind: "source_file",
				role: "artifact",
				is_selected: false,
				is_on_selected_path: false,
			}),
		).toBe(false);
	});
});
