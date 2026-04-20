import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	project_session_graph_grouped,
	resolve_grouped_selection_member_id,
} from "../../../src/lib/exploration-session-graph-grouped-view-model";

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
		session_id: "sess-grouped",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-18T10:00:00Z",
	};
}

function make_repeated_touch_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("user_0", "user_prompt", { turn_index: 0 }),
			make_node("turn_0", "assistant_turn", { turn_index: 0 }),
			make_node("tool_write_0", "tool_call", {
				turn_index: 0,
				tool_index: 0,
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
			make_edge("turn_0", "tool_write_0", "invoked_tool"),
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

describe("project_session_graph_grouped", () => {
	it("collapses repeated file-touch actions by semantic signature", () => {
		const projection = project_session_graph_grouped(
			make_repeated_touch_graph(),
		);
		const write_group = projection.nodes.find(
			(node) => node.id === "tool_write_0",
		);
		const edit_group = projection.nodes.find(
			(node) => node.id === "tool_edit_1",
		);
		const file_group = projection.nodes.find(
			(node) => node.id === "file_bridge",
		);

		expect(write_group?.member_ids).toEqual(["tool_write_0", "tool_write_2"]);
		expect(edit_group?.member_ids).toEqual(["tool_edit_1"]);
		expect(file_group?.member_ids).toEqual(["file_bridge"]);
		expect(projection.raw_to_group_id.get("tool_write_2")).toBe("tool_write_0");
	});

	it("keeps repeated turns separate while converging on grouped actions and files", () => {
		const projection = project_session_graph_grouped(
			make_repeated_touch_graph(),
		);
		const prompted_edges = projection.edges.filter(
			(edge) => edge.kind === "prompted",
		);
		const invoked_edges = projection.edges.filter(
			(edge) => edge.kind === "invoked_tool",
		);
		const artifact_edges = projection.edges.filter(
			(edge) => edge.kind === "wrote" || edge.kind === "edited",
		);

		expect(prompted_edges).toHaveLength(3);
		expect(invoked_edges).toHaveLength(3);
		expect(artifact_edges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source_id: "tool_write_0",
					target_id: "file_bridge",
				}),
				expect.objectContaining({
					source_id: "tool_edit_1",
					target_id: "file_bridge",
				}),
			]),
		);
	});

	it("prefers the latest grouped member when selecting a collapsed repeated action", () => {
		const projection = project_session_graph_grouped(
			make_repeated_touch_graph(),
		);

		expect(
			resolve_grouped_selection_member_id(projection, "tool_write_0", null),
		).toBe("tool_write_2");
		expect(
			resolve_grouped_selection_member_id(
				projection,
				"tool_write_0",
				"tool_write_0",
			),
		).toBe("tool_write_0");
	});
});
