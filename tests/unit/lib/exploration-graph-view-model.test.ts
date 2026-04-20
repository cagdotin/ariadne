import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	assign_lanes,
	compute_graph_summary,
	compute_map_edges,
	compute_map_nodes,
	compute_route_connectors,
	compute_selection_subgraph,
	compute_styling_state,
	type FocusMode,
	type LaneId,
	type MapEdge,
	type MapNode,
	type RouteConnector,
} from "../../../src/lib/exploration-graph-view-model";

// ── Fixtures ────────────────────────────────────────────────────────────────

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
		session_id: "s1",
		project_path: "/project",
		nodes,
		edges,
		has_repo_context: true,
		derived_at: "2026-04-13T00:00:00Z",
	};
}

// Reusable small graph: 1 turn, 1 search, 1 file read, 1 file edit
function make_typical_graph(): SessionGraphPayload {
	const nodes: GraphNode[] = [
		make_node("session", "session"),
		make_node("framing", "session_framing"),
		make_node("cwd", "runtime_context", "available_observed", {
			label: "cwd: /project",
		}),
		make_node("system_prompt", "system_prompt", "unavailable"),
		make_node("claude_md", "instruction_source", "available_ambient", {
			path: "CLAUDE.md",
		}),
		make_node("user_0", "user_prompt", "available_observed", {
			turn_index: 0,
			text: "Fix the login bug",
		}),
		make_node("turn_0", "assistant_turn", "available_observed", {
			turn_index: 0,
		}),
		make_node("search_0", "search_query", "available_observed", {
			tool_name: "Grep",
		}),
		make_node("tool_read_0", "tool_call", "available_observed", {
			tool_name: "Read",
			file_path: "src/auth.ts",
		}),
		make_node("tool_edit_0", "tool_call", "available_observed", {
			tool_name: "Edit",
			file_path: "src/auth.ts",
		}),
		make_node("tool_read_doc", "tool_call", "available_observed", {
			tool_name: "Read",
			file_path: "docs/auth.md",
		}),
		make_node("file_auth", "source_file", "available_observed", {
			path: "src/auth.ts",
		}),
		make_node("doc_auth", "doc_file", "available_observed", {
			path: "docs/auth.md",
		}),
		make_node(
			"file_adjacent",
			"source_file",
			"available_ambient",
			{ path: "src/session.ts" },
		),
	];

	const edges: GraphEdge[] = [
		make_edge("session", "framing", "framed_by"),
		make_edge("framing", "cwd", "framed_by"),
		make_edge("framing", "system_prompt", "framed_by"),
		make_edge("framing", "claude_md", "constrained_by"),
		make_edge("session", "user_0", "prompted"),
		make_edge("turn_0", "search_0", "invoked_tool"),
		make_edge("turn_0", "tool_read_0", "invoked_tool"),
		make_edge("turn_0", "tool_edit_0", "invoked_tool"),
		make_edge("turn_0", "tool_read_doc", "invoked_tool"),
		make_edge("tool_read_0", "file_auth", "read"),
		make_edge("tool_edit_0", "file_auth", "edited"),
		make_edge("tool_read_doc", "doc_auth", "read"),
		make_edge("file_auth", "file_adjacent", "adjacent_unexplored"),
	];

	return make_graph(nodes, edges);
}

// ── Lane assignment ─────────────────────────────────────────────────────────

describe("assign_lanes", () => {
	it("assigns framing/instruction nodes to the framing lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("framing")).toBe("framing");
		expect(lanes.get("cwd")).toBe("framing");
		expect(lanes.get("system_prompt")).toBe("framing");
		expect(lanes.get("claude_md")).toBe("framing");
	});

	it("assigns user_prompt and assistant_turn to prompt lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("user_0")).toBe("prompts");
		expect(lanes.get("turn_0")).toBe("prompts");
	});

	it("assigns search_query to discovery lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("search_0")).toBe("discovery");
	});

	it("assigns doc_file to docs lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("doc_auth")).toBe("docs");
	});

	it("assigns read-only source_file to files lane", () => {
		// Add a read-only file to the graph
		const graph = make_typical_graph();
		graph.nodes.push(
			make_node("file_utils", "source_file", "available_observed", {
				path: "src/utils.ts",
			}),
		);
		graph.edges.push(make_edge("tool_read_0", "file_utils", "read"));

		const lanes = assign_lanes(graph);
		expect(lanes.get("file_utils")).toBe("files");
	});

	it("assigns edited source_file to outputs lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		// file_auth has an "edited" edge targeting it, so it should be in outputs
		expect(lanes.get("file_auth")).toBe("outputs");
	});

	it("assigns ambient/adjacent files to context lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("file_adjacent")).toBe("context");
	});

	it("assigns tool_call to discovery lane", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		expect(lanes.get("tool_read_0")).toBe("discovery");
		expect(lanes.get("tool_edit_0")).toBe("discovery");
	});
});

// ── Map nodes ───────────────────────────────────────────────────────────────

describe("compute_map_nodes", () => {
	it("returns map nodes with lane assignments", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes);

		expect(map_nodes.length).toBeGreaterThan(0);
		for (const mn of map_nodes) {
			expect(mn.lane).toBeDefined();
			expect(mn.node).toBeDefined();
		}
	});

	it("can hide ambient nodes when ambient visibility is off", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes, { show_ambient: false });

		expect(map_nodes.find((mn) => mn.node.id === "claude_md")).toBeUndefined();
		expect(map_nodes.find((mn) => mn.node.id === "file_adjacent")).toBeUndefined();
		expect(map_nodes.find((mn) => mn.node.id === "file_auth")).toBeDefined();
	});

	it("excludes session node from map", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes);

		expect(map_nodes.find((mn) => mn.node.id === "session")).toBeUndefined();
	});

	it("marks edited files", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes);

		const auth_node = map_nodes.find((mn) => mn.node.id === "file_auth");
		expect(auth_node?.is_edited).toBe(true);
	});
});

// ── Map edges ───────────────────────────────────────────────────────────────

describe("compute_map_edges", () => {
	it("produces edges that reference existing map node IDs", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes);
		const map_edges = compute_map_edges(graph, map_nodes);

		const node_ids = new Set(map_nodes.map((n) => n.node.id));
		for (const e of map_edges) {
			expect(node_ids.has(e.source_id)).toBe(true);
			expect(node_ids.has(e.target_id)).toBe(true);
		}
	});

	it("can hide ambient edges when ambient visibility is off", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes, { show_ambient: false });
		const map_edges = compute_map_edges(graph, map_nodes, { show_ambient: false });

		expect(
			map_edges.some(
				(edge) =>
					edge.source_id === "file_auth" && edge.target_id === "file_adjacent",
			),
		).toBe(false);
		expect(
			map_edges.some(
				(edge) =>
					edge.source_id === "framing" && edge.target_id === "claude_md",
			),
		).toBe(false);
			expect(map_edges.some((edge) => edge.target_id === "file_auth")).toBe(true);
	});

	it("carries availability from graph edges", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes);
		const map_edges = compute_map_edges(graph, map_nodes);

		expect(map_edges.length).toBeGreaterThan(0);
		for (const e of map_edges) {
			expect(e.availability).toBeDefined();
		}
	});
});

// ── Filtering / noise reduction ──────────────────────────────────────────────

describe("filtering via VisibilityOptions", () => {
	it("hides inferred nodes when show_inferred is false", () => {
		const graph = make_typical_graph();
		// Add an inferred node
		graph.nodes.push(
			make_node("file_inferred", "source_file", "derived_inferred", { path: "src/inferred.ts" }),
		);
		graph.edges.push(make_edge("tool_read_0", "file_inferred", "read"));

		const lanes = assign_lanes(graph);
		const all_nodes = compute_map_nodes(graph, lanes, { show_inferred: true });
		const filtered = compute_map_nodes(graph, lanes, { show_inferred: false });

		expect(all_nodes.find((n) => n.node.id === "file_inferred")).toBeDefined();
		expect(filtered.find((n) => n.node.id === "file_inferred")).toBeUndefined();
	});

	it("hides unexplored neighbor nodes when show_unexplored is false", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		// file_adjacent is an ambient adjacent node — it should be hidden when unexplored is off
		const all_nodes = compute_map_nodes(graph, lanes, { show_ambient: true, show_unexplored: true });
		const filtered = compute_map_nodes(graph, lanes, { show_ambient: true, show_unexplored: false });

		expect(all_nodes.find((n) => n.node.id === "file_adjacent")).toBeDefined();
		expect(filtered.find((n) => n.node.id === "file_adjacent")).toBeUndefined();
	});

	it("only_selected_subgraph limits nodes to highlighted set", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const subgraph = compute_selection_subgraph("file_auth", graph, "path");

		const all_nodes = compute_map_nodes(graph, lanes);
		const filtered = compute_map_nodes(graph, lanes, {
			only_selected_subgraph: true,
			highlighted_node_ids: subgraph.highlighted_node_ids,
		});

		expect(filtered.length).toBeLessThan(all_nodes.length);
		for (const n of filtered) {
			expect(subgraph.highlighted_node_ids.has(n.node.id)).toBe(true);
		}
	});

	it("only_edited_path limits to nodes on an edited file's path", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		const filtered = compute_map_nodes(graph, lanes, { only_edited_path: true });

		// Should include the edited file and nodes on its path
		expect(filtered.find((n) => n.node.id === "file_auth")).toBeDefined();
		// Should exclude search queries and docs not on the edit path
		// (depending on graph structure, docs may or may not be included)
		expect(filtered.length).toBeLessThan(
			compute_map_nodes(graph, lanes).length,
		);
	});
});

// ── Styling state ───────────────────────────────────────────────────────────

describe("compute_styling_state", () => {
	it("returns observed for available_observed nodes", () => {
		expect(compute_styling_state("available_observed")).toBe("observed");
	});

	it("returns ambient for available_ambient nodes", () => {
		expect(compute_styling_state("available_ambient")).toBe("ambient");
	});

	it("returns inferred for derived_inferred nodes", () => {
		expect(compute_styling_state("derived_inferred")).toBe("inferred");
	});

	it("returns unavailable for unavailable/unknown nodes", () => {
		expect(compute_styling_state("unavailable")).toBe("unavailable");
		expect(compute_styling_state("unknown")).toBe("unavailable");
	});
});

// ── Selection subgraph ──────────────────────────────────────────────────────

describe("compute_selection_subgraph", () => {
	it("returns empty sets for null selection", () => {
		const graph = make_typical_graph();
		const result = compute_selection_subgraph(null, graph);

		expect(result.highlighted_node_ids.size).toBe(0);
		expect(result.highlighted_edge_keys.size).toBe(0);
	});

	describe("path mode", () => {
		it("highlights upstream invocation chain for an edited file", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "path");

			// Should trace: file_auth ← tool_edit_0 ← turn_0 (via invoked_tool, edited)
			expect(result.highlighted_node_ids.has("file_auth")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_edit_0")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_read_0")).toBe(true);
			expect(result.highlighted_node_ids.has("turn_0")).toBe(true);
		});

		it("highlights downstream tools and files for a turn", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("turn_0", graph, "path");

			expect(result.highlighted_node_ids.has("turn_0")).toBe(true);
			expect(result.highlighted_node_ids.has("search_0")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_read_0")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_edit_0")).toBe(true);
			expect(result.highlighted_node_ids.has("file_auth")).toBe(true);
		});

		it("does NOT follow framing/constrained_by edges", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "path");

			// Path mode should not reach framing nodes via constrained_by
			expect(result.highlighted_node_ids.has("claude_md")).toBe(false);
			expect(result.highlighted_node_ids.has("framing")).toBe(false);
			expect(result.highlighted_node_ids.has("system_prompt")).toBe(false);
		});

		it("does NOT follow adjacent_unexplored edges", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "path");

			expect(result.highlighted_node_ids.has("file_adjacent")).toBe(false);
		});
	});

	describe("influence mode", () => {
		it("highlights upstream framing/instruction chain for a file", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "influence");

			// Should trace: file_auth ← tool_edit_0/tool_read_0 ← turn_0 (via invoked_tool, read, edited)
			expect(result.highlighted_node_ids.has("file_auth")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_edit_0")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_read_0")).toBe(true);
			expect(result.highlighted_node_ids.has("turn_0")).toBe(true);
		});

		it("follows adjacent_unexplored edges downstream", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "influence");

			// Influence mode follows adjacent_unexplored
			expect(result.highlighted_node_ids.has("file_adjacent")).toBe(true);
		});

		it("follows constrained_by edges from framing", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("framing", graph, "influence");

			// Influence from framing reaches instruction sources
			expect(result.highlighted_node_ids.has("claude_md")).toBe(true);
			expect(result.highlighted_node_ids.has("system_prompt")).toBe(true);
			expect(result.highlighted_node_ids.has("cwd")).toBe(true);
		});

		it("does NOT follow prompted/searched_for edges", () => {
			const graph = make_typical_graph();
			// Select session — in influence mode, it should follow framed_by
			// but not prompted (which is path-only)
			const result = compute_selection_subgraph("session", graph, "influence");

			// framed_by is in influence set, so framing is reachable
			expect(result.highlighted_node_ids.has("framing")).toBe(true);
			// prompted is NOT in influence set, so user_0 should NOT be reached
			expect(result.highlighted_node_ids.has("user_0")).toBe(false);
		});
	});

	describe("neighborhood mode", () => {
		it("highlights only one-hop neighbors from selected node", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "neighborhood");

			// Selected node is always included
			expect(result.highlighted_node_ids.has("file_auth")).toBe(true);

			// One-hop neighbors via any edge kind
			// tool_read_0 → file_auth (read), tool_edit_0 → file_auth (edited)
			expect(result.highlighted_node_ids.has("tool_read_0")).toBe(true);
			expect(result.highlighted_node_ids.has("tool_edit_0")).toBe(true);

			// file_auth → file_adjacent (adjacent_unexplored) — one hop out
			expect(result.highlighted_node_ids.has("file_adjacent")).toBe(true);
		});

		it("does NOT traverse beyond one hop", () => {
			const graph = make_typical_graph();
			const result = compute_selection_subgraph("file_auth", graph, "neighborhood");

			// turn_0 is two hops away (turn_0 → tool_read_0 → file_auth)
			expect(result.highlighted_node_ids.has("turn_0")).toBe(false);
			// search_0 is two hops away
			expect(result.highlighted_node_ids.has("search_0")).toBe(false);
			// session is far away
			expect(result.highlighted_node_ids.has("session")).toBe(false);
		});

		it("uses all edge kinds (not limited to a mode-specific set)", () => {
			// Build a graph where a node has both path and influence edges
			const nodes: GraphNode[] = [
				make_node("doc_a", "doc_file"),
				make_node("file_b", "source_file"),
				make_node("instruction_c", "instruction_source", "available_ambient"),
				make_node("file_d", "source_file"),
			];
			const edges: GraphEdge[] = [
				make_edge("doc_a", "file_b", "linked_to"),          // influence-only edge
				make_edge("doc_a", "instruction_c", "constrained_by"), // influence-only edge
				make_edge("doc_a", "file_d", "read"),                // shared edge
			];
			const graph = make_graph(nodes, edges);

			const result = compute_selection_subgraph("doc_a", graph, "neighborhood");

			// All one-hop neighbors via any edge kind
			expect(result.highlighted_node_ids.has("file_b")).toBe(true);
			expect(result.highlighted_node_ids.has("instruction_c")).toBe(true);
			expect(result.highlighted_node_ids.has("file_d")).toBe(true);
		});

		it("is distinct from path and influence for the same selection", () => {
			const graph = make_typical_graph();
			const path_result = compute_selection_subgraph("file_auth", graph, "path");
			const influence_result = compute_selection_subgraph("file_auth", graph, "influence");
			const neighborhood_result = compute_selection_subgraph("file_auth", graph, "neighborhood");

			// Neighborhood should include adjacent (like influence) but NOT turn_0 (unlike both)
			expect(neighborhood_result.highlighted_node_ids.has("file_adjacent")).toBe(true);
			expect(neighborhood_result.highlighted_node_ids.has("turn_0")).toBe(false);

			// Path includes turn_0 but not adjacent
			expect(path_result.highlighted_node_ids.has("turn_0")).toBe(true);
			expect(path_result.highlighted_node_ids.has("file_adjacent")).toBe(false);

			// Influence includes both turn_0 and adjacent
			expect(influence_result.highlighted_node_ids.has("turn_0")).toBe(true);
			expect(influence_result.highlighted_node_ids.has("file_adjacent")).toBe(true);
		});
	});

	describe("mode distinction", () => {
		it("same file selection produces different subgraphs in path vs influence", () => {
			const graph = make_typical_graph();
			const path_result = compute_selection_subgraph("file_auth", graph, "path");
			const influence_result = compute_selection_subgraph("file_auth", graph, "influence");

			// Both should include the file itself
			expect(path_result.highlighted_node_ids.has("file_auth")).toBe(true);
			expect(influence_result.highlighted_node_ids.has("file_auth")).toBe(true);

			// Path does NOT include adjacent neighbor; Influence DOES
			expect(path_result.highlighted_node_ids.has("file_adjacent")).toBe(false);
			expect(influence_result.highlighted_node_ids.has("file_adjacent")).toBe(true);

			// The subgraphs should differ in size
			expect(influence_result.highlighted_node_ids.size).toBeGreaterThan(
				path_result.highlighted_node_ids.size,
			);
		});

		it("same turn selection produces different subgraphs in path vs influence", () => {
			const graph = make_typical_graph();
			const path_result = compute_selection_subgraph("turn_0", graph, "path");
			const influence_result = compute_selection_subgraph("turn_0", graph, "influence");

			// Path follows invoked_tool downstream → reaches tools and files
			expect(path_result.highlighted_node_ids.has("search_0")).toBe(true);
			expect(path_result.highlighted_node_ids.has("file_auth")).toBe(true);

			// Influence also follows invoked_tool and then adjacent_unexplored
			expect(influence_result.highlighted_node_ids.has("file_auth")).toBe(true);
			expect(influence_result.highlighted_node_ids.has("file_adjacent")).toBe(true);

			// But path does not reach adjacent
			expect(path_result.highlighted_node_ids.has("file_adjacent")).toBe(false);
		});

		it("instruction source highlights differ between modes", () => {
			const graph = make_typical_graph();
			const path_result = compute_selection_subgraph("claude_md", graph, "path");
			const influence_result = compute_selection_subgraph("claude_md", graph, "influence");

			// Path mode: claude_md has no path-type edges, so only self
			expect(path_result.highlighted_node_ids.size).toBe(1);
			expect(path_result.highlighted_node_ids.has("claude_md")).toBe(true);

			// Influence mode: claude_md ← framing via constrained_by (upstream)
			expect(influence_result.highlighted_node_ids.has("framing")).toBe(true);
			expect(influence_result.highlighted_node_ids.size).toBeGreaterThan(1);
		});
	});
});

// ── Route connectors ────────────────────────────────────────────────────────

describe("compute_route_connectors", () => {
	it("marks edges in the selection subgraph as primary emphasis", () => {
		const graph = make_typical_graph();
		const subgraph = compute_selection_subgraph("file_auth", graph, "path");
		const connectors = compute_route_connectors(graph, subgraph, { show_ambient: true });

		const primary = connectors.filter((c) => c.emphasis === "primary");
		expect(primary.length).toBeGreaterThan(0);

		// The read and edited edges to file_auth should be primary
		const to_file = primary.filter((c) => c.target_id === "file_auth");
		expect(to_file.length).toBeGreaterThanOrEqual(1);
	});

	it("marks edges outside selection subgraph as secondary", () => {
		const graph = make_typical_graph();
		const subgraph = compute_selection_subgraph("file_auth", graph, "path");
		const connectors = compute_route_connectors(graph, subgraph, { show_ambient: true });

		const secondary = connectors.filter((c) => c.emphasis === "secondary");
		// framing edges are not in path subgraph so should be secondary
		const framing_edge = secondary.find(
			(c) => c.source_id === "framing" && c.target_id === "cwd",
		);
		expect(framing_edge).toBeDefined();
	});

	it("returns all edges as muted when no selection", () => {
		const graph = make_typical_graph();
		const subgraph = compute_selection_subgraph(null, graph);
		const connectors = compute_route_connectors(graph, subgraph, { show_ambient: true });

		// With no selection, all should be secondary
		expect(connectors.every((c) => c.emphasis === "secondary")).toBe(true);
	});

	it("respects ambient visibility", () => {
		const graph = make_typical_graph();
		const subgraph = compute_selection_subgraph("file_auth", graph, "path");
		const connectors = compute_route_connectors(graph, subgraph, { show_ambient: false });

		// No edges involving ambient nodes
		const ambient_connectors = connectors.filter(
			(c) => c.source_id === "claude_md" || c.target_id === "claude_md" ||
				c.source_id === "file_adjacent" || c.target_id === "file_adjacent",
		);
		expect(ambient_connectors.length).toBe(0);
	});

	it("carries styling state from edge availability", () => {
		const graph = make_typical_graph();
		const subgraph = compute_selection_subgraph("file_auth", graph, "path");
		const connectors = compute_route_connectors(graph, subgraph, { show_ambient: true });

		for (const c of connectors) {
			expect(["observed", "ambient", "inferred", "unavailable"]).toContain(c.styling);
		}
	});
});

// ── Graph summary ───────────────────────────────────────────────────────────

describe("compute_graph_summary", () => {
	it("counts turns correctly", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		expect(summary.turns).toBe(1);
	});

	it("counts searches", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		expect(summary.searches).toBe(1);
	});

	it("counts docs read", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		expect(summary.docs_read).toBe(1);
	});

	it("counts files read", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		// file_auth is both read and edited
		expect(summary.files_read).toBeGreaterThanOrEqual(1);
	});

	it("counts files edited", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		expect(summary.files_edited).toBe(1);
	});

	it("counts framing sources", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		// cwd, system_prompt, claude_md
		expect(summary.framing_sources).toBeGreaterThanOrEqual(2);
	});

	it("counts unavailable framing slots", () => {
		const graph = make_typical_graph();
		const summary = compute_graph_summary(graph);

		// system_prompt is unavailable
		expect(summary.unavailable_framing).toBe(1);
	});
});

// ── Artifact-first map visibility ───────────────────────────────────────────

describe("artifact_first visibility", () => {
	it("hides narrative lanes (framing, prompts, discovery) by default", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes, { artifact_first: true });

		const lane_set = new Set(map_nodes.map((n) => n.lane));
		expect(lane_set.has("framing")).toBe(false);
		expect(lane_set.has("prompts")).toBe(false);
		expect(lane_set.has("discovery")).toBe(false);
	});

	it("preserves artifact lanes (docs, files, outputs, context)", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);
		const map_nodes = compute_map_nodes(graph, lanes, { artifact_first: true });

		// Should still have artifact nodes
		expect(map_nodes.find((n) => n.node.id === "doc_auth")).toBeDefined();
		expect(map_nodes.find((n) => n.node.id === "file_auth")).toBeDefined();
	});

	it("reintroduces scaffolding nodes from narrative lanes when specified", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		// Simulate selection-driven scaffolding: turn_0 and tool_edit_0 are
		// on the path to file_auth
		const scaffolding = new Set(["turn_0", "tool_edit_0"]);
		const map_nodes = compute_map_nodes(graph, lanes, {
			artifact_first: true,
			scaffolding_node_ids: scaffolding,
		});

		expect(map_nodes.find((n) => n.node.id === "turn_0")).toBeDefined();
		expect(map_nodes.find((n) => n.node.id === "tool_edit_0")).toBeDefined();
		// Other narrative nodes not in scaffolding remain hidden
		expect(map_nodes.find((n) => n.node.id === "search_0")).toBeUndefined();
		expect(map_nodes.find((n) => n.node.id === "framing")).toBeUndefined();
	});

	it("returns to artifact-only baseline when scaffolding is cleared", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		// With scaffolding
		const with_scaffolding = compute_map_nodes(graph, lanes, {
			artifact_first: true,
			scaffolding_node_ids: new Set(["turn_0"]),
		});
		expect(with_scaffolding.find((n) => n.node.id === "turn_0")).toBeDefined();

		// Without scaffolding (selection cleared)
		const without = compute_map_nodes(graph, lanes, { artifact_first: true });
		expect(without.find((n) => n.node.id === "turn_0")).toBeUndefined();
	});

	it("still respects ambient/inferred/unexplored toggles in artifact-first mode", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		const with_ambient = compute_map_nodes(graph, lanes, {
			artifact_first: true,
			show_ambient: true,
		});
		const without_ambient = compute_map_nodes(graph, lanes, {
			artifact_first: true,
			show_ambient: false,
		});

		// file_adjacent is ambient + context lane — hidden when ambient off
		expect(with_ambient.find((n) => n.node.id === "file_adjacent")).toBeDefined();
		expect(without_ambient.find((n) => n.node.id === "file_adjacent")).toBeUndefined();
	});
});

// ── Temporal visibility filtering ───────────────────────────────────────────

describe("temporal visibility filtering via temporally_visible_node_ids", () => {
	it("filters map nodes to only temporally visible set", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		const temporally_visible_node_ids = new Set(["file_auth", "doc_auth", "framing", "cwd", "session"]);
		const map_nodes = compute_map_nodes(graph, lanes, { temporally_visible_node_ids });

		// Should only include nodes in the temporal set (minus session which is always excluded)
		expect(map_nodes.find((n) => n.node.id === "file_auth")).toBeDefined();
		expect(map_nodes.find((n) => n.node.id === "doc_auth")).toBeDefined();
		expect(map_nodes.find((n) => n.node.id === "framing")).toBeDefined();
		expect(map_nodes.find((n) => n.node.id === "cwd")).toBeDefined();

		// Nodes not in temporal set should be excluded
		expect(map_nodes.find((n) => n.node.id === "turn_0")).toBeUndefined();
		expect(map_nodes.find((n) => n.node.id === "search_0")).toBeUndefined();
		expect(map_nodes.find((n) => n.node.id === "file_adjacent")).toBeUndefined();
	});

	it("composes with artifact_first filtering", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		// All nodes are temporally visible, but artifact_first hides narrative lanes
		const temporally_visible_node_ids = new Set(graph.nodes.map((n) => n.id));
		const map_nodes = compute_map_nodes(graph, lanes, {
			artifact_first: true,
			temporally_visible_node_ids,
		});

		// Narrative lanes hidden by artifact_first
		expect(map_nodes.find((n) => n.node.id === "turn_0")).toBeUndefined();
		// Artifact lanes still visible
		expect(map_nodes.find((n) => n.node.id === "file_auth")).toBeDefined();
	});

	it("shows full map when temporally_visible_node_ids is undefined", () => {
		const graph = make_typical_graph();
		const lanes = assign_lanes(graph);

		const with_temporal = compute_map_nodes(graph, lanes, {});
		const without_temporal = compute_map_nodes(graph, lanes);

		expect(with_temporal.length).toBe(without_temporal.length);
	});
});
