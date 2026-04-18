import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
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
		session_id: "sess-tree",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-18T10:00:00Z",
	};
}

function make_session_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session_root", "session"),
			make_node("framing", "session_framing"),
			make_node("runtime", "runtime_context"),
			make_node("system_prompt", "system_prompt", "unavailable"),
			make_node("ambient_rules", "instruction_source", "available_ambient", {
				path: "CLAUDE.md",
			}),
			make_node("agents_doc", "agents_doc", "available_observed", {
				path: "AGENTS.md",
			}),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("search_0", "search_query", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("tool_write_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 2,
			}),
			make_node("doc_spec", "doc_file"),
			make_node("file_shared", "source_file"),
			make_node("file_output", "source_file"),
			make_node("user_1", "user_prompt", "available_observed", {
				turn_index: 1,
			}),
			make_node("turn_1", "assistant_turn", "available_observed", {
				turn_index: 1,
			}),
			make_node("tool_edit_1", "tool_call", "available_observed", {
				turn_index: 1,
				tool_index: 0,
			}),
		],
		[
			make_edge("session_root", "framing", "framed_by"),
			make_edge("framing", "runtime", "framed_by"),
			make_edge("framing", "system_prompt", "framed_by", "unavailable"),
			make_edge(
				"framing",
				"ambient_rules",
				"constrained_by",
				"available_ambient",
			),
			make_edge("framing", "agents_doc", "constrained_by"),
			make_edge("session_root", "user_0", "prompted"),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("turn_0", "tool_write_0", "invoked_tool"),
			make_edge("search_0", "doc_spec", "read"),
			make_edge("tool_read_0", "file_shared", "read"),
			make_edge("tool_write_0", "file_output", "wrote"),
			make_edge("tool_read_0", "agents_doc", "read"),
			make_edge("session_root", "user_1", "prompted"),
			make_edge("user_1", "turn_1", "prompted"),
			make_edge("turn_1", "tool_edit_1", "invoked_tool"),
			make_edge("tool_edit_1", "file_shared", "edited"),
			make_edge("doc_spec", "file_output", "linked_to"),
		],
	);
}

function make_discovery_lineage_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session_root", "session"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("search_0", "search_query", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("tool_read_1", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 2,
			}),
			make_node("file_a", "source_file"),
			make_node("file_b", "source_file"),
		],
		[
			make_edge("session_root", "user_0", "prompted"),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "search_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("turn_0", "tool_read_1", "invoked_tool"),
			make_edge("search_0", "tool_read_0", "influenced_by", "derived_inferred"),
			make_edge("search_0", "file_a", "discovered", "derived_inferred"),
			make_edge("tool_read_0", "file_a", "read"),
			make_edge("tool_read_1", "file_b", "read"),
		],
	);
}

function make_tool_led_lineage_graph(): SessionGraphPayload {
	return make_graph(
		[
			make_node("session_root", "session"),
			make_node("user_0", "user_prompt", "available_observed", {
				turn_index: 0,
			}),
			make_node("turn_0", "assistant_turn", "available_observed", {
				turn_index: 0,
			}),
			make_node("tool_read_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 0,
			}),
			make_node("tool_edit_0", "tool_call", "available_observed", {
				turn_index: 0,
				tool_index: 1,
			}),
			make_node("file_a", "source_file"),
		],
		[
			make_edge("session_root", "user_0", "prompted"),
			make_edge("user_0", "turn_0", "prompted"),
			make_edge("turn_0", "tool_read_0", "invoked_tool"),
			make_edge("turn_0", "tool_edit_0", "invoked_tool"),
			make_edge(
				"tool_read_0",
				"tool_edit_0",
				"influenced_by",
				"derived_inferred",
			),
			make_edge("tool_read_0", "file_a", "read"),
			make_edge("tool_edit_0", "file_a", "edited"),
		],
	);
}

describe("project_session_graph_tree", () => {
	it("projects the full session topology without requiring a selection", () => {
		const tree = project_session_graph_tree(make_session_graph());

		expect(tree.nodes.map((node) => node.id)).toEqual(
			expect.arrayContaining([
				"framing",
				"user_0",
				"user_1",
				"turn_0",
				"turn_1",
				"search_0",
				"tool_read_0",
				"tool_write_0",
				"tool_edit_1",
				"agents_doc",
				"doc_spec",
				"file_output",
				"file_shared",
				"ambient_rules",
			]),
		);
		expect(tree.nodes).toHaveLength(14);
		expect(tree.roots).toEqual(["framing", "user_0", "user_1"]);
	});

	it("suppresses non-topology framing and structural cross-links", () => {
		const tree = project_session_graph_tree(make_session_graph());

		expect(tree.nodes.some((node) => node.id === "session_root")).toBe(false);
		expect(tree.nodes.some((node) => node.id === "runtime")).toBe(false);
		expect(tree.nodes.some((node) => node.id === "system_prompt")).toBe(false);
		expect(tree.edges.some((edge) => edge.kind === "linked_to")).toBe(false);
	});

	it("chooses the earliest causal parent for repeated artifacts", () => {
		const tree = project_session_graph_tree(make_session_graph());
		const shared_file = tree.nodes.find((node) => node.id === "file_shared");

		expect(shared_file?.parent_id).toBe("tool_read_0");
	});

	it("keeps explicitly read AGENTS docs in the exploration tree instead of the framing cluster", () => {
		const tree = project_session_graph_tree(make_session_graph());
		const agents_doc = tree.nodes.find((node) => node.id === "agents_doc");

		expect(agents_doc?.parent_id).toBe("tool_read_0");
		expect(agents_doc?.role).toBe("artifact");
	});

	it("respects ambient visibility filters", () => {
		const tree = project_session_graph_tree(make_session_graph(), {
			show_ambient: false,
		});

		expect(tree.nodes.some((node) => node.id === "ambient_rules")).toBe(false);
	});

	it("orders tool children by replay order", () => {
		const tree = project_session_graph_tree(make_session_graph());
		const turn_0 = tree.nodes.find((node) => node.id === "turn_0");

		expect(turn_0?.child_ids).toEqual([
			"search_0",
			"tool_read_0",
			"tool_write_0",
		]);
	});

	it("prefers same-turn influenced_by over invoked_tool for later tool nodes", () => {
		const tree = project_session_graph_tree(make_discovery_lineage_graph());
		const read_tool = tree.nodes.find((node) => node.id === "tool_read_0");
		const file_a = tree.nodes.find((node) => node.id === "file_a");

		expect(read_tool?.parent_id).toBe("search_0");
		expect(file_a?.parent_id).toBe("tool_read_0");
	});

	it("falls back to assistant_turn when inferred lineage is hidden", () => {
		const tree = project_session_graph_tree(make_discovery_lineage_graph(), {
			show_inferred: false,
		});
		const read_tool = tree.nodes.find((node) => node.id === "tool_read_0");

		expect(read_tool?.parent_id).toBe("turn_0");
	});

	it("allows a prior tool_call to parent a later tool_call when influenced_by is stronger", () => {
		const tree = project_session_graph_tree(make_tool_led_lineage_graph());
		const edit_tool = tree.nodes.find((node) => node.id === "tool_edit_0");
		const file_a = tree.nodes.find((node) => node.id === "file_a");

		expect(edit_tool?.parent_id).toBe("tool_read_0");
		expect(file_a?.parent_id).toBe("tool_read_0");
	});
});
