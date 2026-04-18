import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import { compute_grouped_session_graph_layout } from "../../../src/lib/exploration-session-graph-grouped-layout";
import { project_session_graph_grouped } from "../../../src/lib/exploration-session-graph-grouped-view-model";

function make_node(
	id: string,
	kind: GraphNode["kind"],
	metadata?: Record<string, unknown>,
): GraphNode {
	return {
		id,
		kind,
		label: id,
		availability: "available_observed",
		confidence: "high",
		evidence: [],
		metadata,
	};
}

function make_edge(
	source_id: string,
	target_id: string,
	kind: GraphEdge["kind"],
): GraphEdge {
	return {
		source_id,
		target_id,
		kind,
		availability: "available_observed",
		confidence: "high",
		evidence: [],
		label: null,
	};
}

function make_graph(
	nodes: GraphNode[],
	edges: GraphEdge[],
): SessionGraphPayload {
	return {
		session_id: "sess-grouped-layout",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-18T10:00:00Z",
	};
}

function make_graph_fixture(): SessionGraphPayload {
	return make_graph(
		[
			make_node("user_0", "user_prompt", { turn_index: 0 }),
			make_node("turn_0", "assistant_turn", { turn_index: 0 }),
			make_node("search_0", "search_query", {
				turn_index: 0,
				tool_index: 0,
				query: 'rg -n "bridge" src backend',
			}),
			make_node("tool_write_0", "tool_call", {
				turn_index: 0,
				tool_index: 1,
				tool_name: "write",
				relative_path: "backend/analytics/aggregations/file-session-bridge.ts",
			}),
			make_node("user_1", "user_prompt", { turn_index: 1 }),
			make_node("turn_1", "assistant_turn", { turn_index: 1 }),
			make_node("tool_edit_1", "tool_call", {
				turn_index: 1,
				tool_index: 0,
				tool_name: "edit",
				relative_path: "backend/analytics/aggregations/file-session-bridge.ts",
			}),
			make_node("user_2", "user_prompt", { turn_index: 2 }),
			make_node("turn_2", "assistant_turn", { turn_index: 2 }),
			make_node("tool_write_2", "tool_call", {
				turn_index: 2,
				tool_index: 0,
				tool_name: "write",
				relative_path: "backend/analytics/aggregations/file-session-bridge.ts",
			}),
			make_node("file_bridge", "source_file", {
				path: "backend/analytics/aggregations/file-session-bridge.ts",
			}),
		],
		[
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_write_0", "invoked_tool"),
			make_edge("search_0", "tool_write_0", "influenced_by"),
			make_edge("tool_write_0", "file_bridge", "wrote"),
			make_edge("user_1", "turn_1", "prompted"),
			make_edge("turn_1", "tool_edit_1", "invoked_tool"),
			make_edge("tool_edit_1", "file_bridge", "edited"),
			make_edge("user_2", "turn_2", "prompted"),
			make_edge("turn_2", "tool_write_2", "invoked_tool"),
			make_edge("tool_write_2", "file_bridge", "wrote"),
		],
	);
}

describe("compute_grouped_session_graph_layout", () => {
	it("places prompts, turns, searches, actions, and files in fixed columns", () => {
		const projection = project_session_graph_grouped(make_graph_fixture());
		const layout = compute_grouped_session_graph_layout(projection, null);

		expect(layout.nodes.find((node) => node.id === "user_0")?.depth).toBe(1);
		expect(layout.nodes.find((node) => node.id === "turn_0")?.depth).toBe(2);
		expect(layout.nodes.find((node) => node.id === "search_0")?.depth).toBe(3);
		expect(layout.nodes.find((node) => node.id === "tool_write_0")?.depth).toBe(4);
		expect(layout.nodes.find((node) => node.id === "file_bridge")?.depth).toBe(5);
	});

	it("highlights all upstream paths for a selected file", () => {
		const projection = project_session_graph_grouped(make_graph_fixture());
		const layout = compute_grouped_session_graph_layout(projection, "file_bridge");
		const highlighted_ids = layout.nodes
			.filter((node) => node.is_on_selected_path || node.is_selected)
			.map((node) => node.id);
		const highlighted_edges = layout.edges
			.filter((edge) => edge.is_on_selected_path)
			.map((edge) => `${edge.source_id}->${edge.target_id}`);

		expect(highlighted_ids).toEqual(
			expect.arrayContaining([
				"user_0",
				"turn_0",
				"search_0",
				"tool_write_0",
				"user_1",
				"turn_1",
				"tool_edit_1",
				"user_2",
				"turn_2",
				"file_bridge",
			]),
		);
		expect(highlighted_edges).toEqual(
			expect.arrayContaining([
				"user_0->turn_0",
				"turn_0->search_0",
				"search_0->tool_write_0",
				"tool_write_0->file_bridge",
				"user_1->turn_1",
				"turn_1->tool_edit_1",
				"tool_edit_1->file_bridge",
				"user_2->turn_2",
				"turn_2->tool_write_0",
			]),
		);
	});

	it("highlights all downstream activity for a selected turn", () => {
		const projection = project_session_graph_grouped(make_graph_fixture());
		const layout = compute_grouped_session_graph_layout(projection, "turn_0");
		const highlighted_ids = layout.nodes
			.filter((node) => node.is_on_selected_path || node.is_selected)
			.map((node) => node.id);

		expect(highlighted_ids).toEqual(
			expect.arrayContaining(["turn_0", "search_0", "tool_write_0", "file_bridge"]),
		);
		expect(highlighted_ids).not.toContain("turn_1");
	});

	it("routes skipped-column edges through edge lanes instead of through node boxes", () => {
		const projection = project_session_graph_grouped(make_graph_fixture());
		const layout = compute_grouped_session_graph_layout(projection, null);
		const turn_to_action_edge = layout.edges.find(
			(edge) => edge.source_id === "turn_0" && edge.target_id === "tool_write_0",
		);
		const search_node = layout.nodes.find((node) => node.id === "search_0");

		expect(turn_to_action_edge?.points).toHaveLength(6);
		const bridge_y = turn_to_action_edge?.points[2]?.[1] ?? null;
		expect(bridge_y).not.toBeNull();
		expect(bridge_y).toSatisfy(
			(value) =>
				value < (search_node?.y ?? 0) || value > (search_node?.y ?? 0) + 38,
		);
	});

	it("resolves later repeated raw action selections to the grouped action node", () => {
		const projection = project_session_graph_grouped(make_graph_fixture());
		const layout = compute_grouped_session_graph_layout(projection, "tool_write_2");

		expect(layout.selected_projection_node_id).toBe("tool_write_0");
		expect(layout.nodes.find((node) => node.id === "tool_write_0")?.is_selected).toBe(true);
	});
});
