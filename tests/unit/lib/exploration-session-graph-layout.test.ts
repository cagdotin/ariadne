import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import { compute_session_graph_layout } from "../../../src/lib/exploration-session-graph-layout";
import { project_session_graph_tree } from "../../../src/lib/exploration-session-graph-view-model";

function make_node(
	id: string,
	kind: GraphNode["kind"],
	availability: GraphNode["availability"] = "available_observed",
	metadata?: Record<string, unknown>,
): GraphNode {
	return {
		id,
		kind,
		label: id,
		availability,
		confidence: "high",
		evidence: [],
		metadata,
	};
}

function make_edge(
	source_id: string,
	target_id: string,
	kind: GraphEdge["kind"],
	availability: GraphEdge["availability"] = "available_observed",
): GraphEdge {
	return {
		source_id,
		target_id,
		kind,
		availability,
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
		session_id: "sess-layout",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-18T10:00:00Z",
	};
}

function make_layout_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("framing", "session_framing"),
			make_node("ambient_rules", "instruction_source", "available_ambient"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("tool_0_0", "search_query", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_0_1", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("doc_a", "doc_file"),
			make_node("file_a", "source_file"),
			make_node("user_1", "user_prompt", "available_observed", {
				turn_index: 1,
			}),
			make_node("turn_1", "assistant_turn", "available_observed", {
				turn_index: 1,
			}),
			make_node("tool_1_0", "tool_call", "available_observed", {
				turn_index: 1,
				tool_index: 0,
			}),
			make_node("file_b", "source_file"),
		],
		[
			make_edge(
				"framing",
				"ambient_rules",
				"constrained_by",
				"available_ambient",
			),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "tool_0_0", "invoked_tool"),
			make_edge("turn_0", "tool_0_1", "invoked_tool"),
			make_edge("tool_0_0", "doc_a", "read"),
			make_edge("tool_0_1", "file_a", "read"),
			make_edge("user_1", "turn_1", "prompted"),
			make_edge("turn_1", "tool_1_0", "invoked_tool"),
			make_edge("tool_1_0", "file_b", "edited"),
		],
	);
}

describe("compute_session_graph_layout", () => {
	it("returns an empty layout for an empty projection", () => {
		const layout = compute_session_graph_layout(
			{ nodes: [], edges: [], roots: [] },
			null,
		);

		expect(layout.nodes).toHaveLength(0);
		expect(layout.edges).toHaveLength(0);
		expect(layout.width).toBe(0);
		expect(layout.height).toBe(0);
	});

	it("places prompts, turns, tools, and artifacts in increasing depth", () => {
		const tree = project_session_graph_tree(make_layout_graph());
		const layout = compute_session_graph_layout(tree, null);

		const user = layout.nodes.find((node) => node.id === "user_0");
		const turn = layout.nodes.find((node) => node.id === "turn_0");
		const tool = layout.nodes.find((node) => node.id === "tool_0_1");
		const file = layout.nodes.find((node) => node.id === "file_a");

		expect(user?.depth).toBe(0);
		expect(turn?.depth).toBe(1);
		expect(tool?.depth).toBe(2);
		expect(file?.depth).toBe(3);
	});

	it("marks the selected node lineage", () => {
		const tree = project_session_graph_tree(make_layout_graph());
		const layout = compute_session_graph_layout(tree, "file_a");

		const selected = layout.nodes.find((node) => node.id === "file_a");
		const turn = layout.nodes.find((node) => node.id === "turn_0");
		const sibling = layout.nodes.find((node) => node.id === "file_b");
		const selected_edges = layout.edges.filter(
			(edge) => edge.is_on_selected_path,
		);

		expect(selected?.is_selected).toBe(true);
		expect(turn?.is_on_selected_path).toBe(true);
		expect(sibling?.is_on_selected_path).toBe(false);
		expect(
			selected_edges.map((edge) => `${edge.source_id}->${edge.target_id}`),
		).toEqual(["user_0->turn_0", "turn_0->tool_0_1", "tool_0_1->file_a"]);
	});

	it("keeps framing as a separate root branch", () => {
		const tree = project_session_graph_tree(make_layout_graph());
		const layout = compute_session_graph_layout(tree, null);

		const framing = layout.nodes.find((node) => node.id === "framing");
		const user_0 = layout.nodes.find((node) => node.id === "user_0");
		const user_1 = layout.nodes.find((node) => node.id === "user_1");

		expect(framing?.depth).toBe(0);
		expect(user_0?.depth).toBe(0);
		expect(user_1?.depth).toBe(0);
		expect(framing?.row).toBeLessThan(user_0?.row ?? Number.POSITIVE_INFINITY);
		expect(user_0?.row).toBeLessThan(user_1?.row ?? Number.POSITIVE_INFINITY);
	});

	it("produces positive dimensions and routed edges", () => {
		const tree = project_session_graph_tree(make_layout_graph());
		const layout = compute_session_graph_layout(tree, null);

		expect(layout.width).toBeGreaterThan(0);
		expect(layout.height).toBeGreaterThan(0);
		expect(layout.edges.length).toBeGreaterThan(0);
		for (const edge of layout.edges) {
			expect([2, 4]).toContain(edge.points.length);
		}
	});
});
