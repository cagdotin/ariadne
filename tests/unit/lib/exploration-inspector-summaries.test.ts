import { describe, expect, it } from "vitest";
import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types";
import {
	compute_arrival_paths,
	compute_insight_summary,
	compute_narrative_summary,
	compute_node_summary,
	compute_temporal_narrative,
	type ArrivalPath,
	type NodeSummary,
} from "../../../src/lib/exploration-inspector-summaries";
import {
	compute_insight_subgraph,
	type InsightSubgraph,
} from "../../../src/lib/exploration-insight-graph-view-model";
import type { TemporalLens } from "../../../src/lib/exploration-temporal-view-model";

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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("compute_node_summary", () => {
	describe("for assistant_turn", () => {
		it("shows downstream action counts", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("search_0", "search_query"),
					make_node("tool_read", "tool_call", "available_observed", {
						tool_name: "Read",
					}),
					make_node("tool_edit", "tool_call", "available_observed", {
						tool_name: "Edit",
					}),
					make_node("file_a", "source_file"),
					make_node("doc_b", "doc_file"),
				],
				[
					make_edge("turn_0", "search_0", "invoked_tool"),
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("tool_read", "doc_b", "read"),
				],
			);

			const summary = compute_node_summary("turn_0", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("turn");
			expect(summary!.searches).toBe(1);
			expect(summary!.files_explored).toBeGreaterThanOrEqual(1);
			expect(summary!.edits).toBe(1);
		});
	});

	describe("for source_file", () => {
		it("shows upstream influences", () => {
			const graph = make_graph(
				[
					make_node("turn_0", "assistant_turn", "available_observed", {
						turn_index: 0,
					}),
					make_node("tool_read", "tool_call", "available_observed", {
						tool_name: "Read",
					}),
					make_node("tool_edit", "tool_call", "available_observed", {
						tool_name: "Edit",
					}),
					make_node("file_a", "source_file"),
					make_node("doc_readme", "doc_file"),
				],
				[
					make_edge("turn_0", "tool_read", "invoked_tool"),
					make_edge("turn_0", "tool_edit", "invoked_tool"),
					make_edge("tool_read", "file_a", "read"),
					make_edge("tool_edit", "file_a", "edited"),
					make_edge("doc_readme", "file_a", "linked_to"),
				],
			);

			const summary = compute_node_summary("file_a", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("file");
			expect(summary!.reads).toBeGreaterThanOrEqual(1);
			expect(summary!.edits).toBeGreaterThanOrEqual(1);
			expect(summary!.upstream_docs).toBeGreaterThanOrEqual(1);
		});
	});

	describe("for instruction_source", () => {
		it("shows downstream influence", () => {
			const graph = make_graph(
				[
					make_node("framing", "session_framing"),
					make_node("claude_md", "instruction_source", "available_ambient"),
					make_node("file_a", "source_file"),
					make_node("file_b", "source_file"),
				],
				[
					make_edge("framing", "claude_md", "constrained_by"),
					make_edge("claude_md", "file_a", "influenced_by"),
					make_edge("claude_md", "file_b", "influenced_by"),
				],
			);

			const summary = compute_node_summary("claude_md", graph);
			expect(summary).not.toBeNull();
			expect(summary!.kind).toBe("instruction");
			expect(summary!.downstream_files).toBe(2);
		});
	});

	it("returns null for unknown node id", () => {
		const graph = make_graph([], []);
		expect(compute_node_summary("nonexistent", graph)).toBeNull();
	});
});

// ── Arrival paths ───────────────────────────────────────────────────────────

describe("compute_node_summary — enhanced fields", () => {
	it("includes nearby_unexplored_count for files with adjacent neighbors", () => {
		const graph = make_graph(
			[
				make_node("tool_read", "tool_call"),
				make_node("file_a", "source_file"),
				make_node("file_b", "source_file", "available_ambient"),
				make_node("file_c", "source_file", "available_ambient"),
			],
			[
				make_edge("tool_read", "file_a", "read"),
				make_edge("file_a", "file_b", "adjacent_unexplored"),
				make_edge("file_a", "file_c", "adjacent_unexplored"),
			],
		);

		const summary = compute_node_summary("file_a", graph);
		expect(summary).not.toBeNull();
		expect(summary!.kind).toBe("file");
		if (summary!.kind === "file") {
			expect(summary!.nearby_unexplored_count).toBe(2);
		}
	});

	it("returns 0 nearby_unexplored_count when no adjacent edges", () => {
		const graph = make_graph(
			[
				make_node("tool_read", "tool_call"),
				make_node("file_a", "source_file"),
			],
			[make_edge("tool_read", "file_a", "read")],
		);

		const summary = compute_node_summary("file_a", graph);
		expect(summary).not.toBeNull();
		if (summary!.kind === "file") {
			expect(summary!.nearby_unexplored_count).toBe(0);
		}
	});
});

// ── Narrative summaries ─────────────────────────────────────────────────────

describe("compute_narrative_summary", () => {
	it("generates a narrative for an assistant_turn", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("search_0", "search_query"),
				make_node("tool_read", "tool_call"),
				make_node("tool_edit", "tool_call"),
				make_node("file_a", "source_file"),
				make_node("doc_a", "doc_file"),
			],
			[
				make_edge("turn_0", "search_0", "invoked_tool"),
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
				make_edge("tool_edit", "file_a", "edited"),
				make_edge("tool_read", "doc_a", "read"),
			],
		);

		const narrative = compute_narrative_summary("turn_0", graph);
		expect(narrative).not.toBeNull();
		expect(narrative).toContain("1 search");
		expect(narrative).toContain("1 edit");
	});

	it("generates a narrative for a source_file", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read", "tool_call"),
				make_node("tool_edit", "tool_call"),
				make_node("file_a", "source_file"),
				make_node("doc_readme", "doc_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
				make_edge("tool_edit", "file_a", "edited"),
				make_edge("doc_readme", "file_a", "linked_to"),
			],
		);

		const narrative = compute_narrative_summary("file_a", graph);
		expect(narrative).not.toBeNull();
		expect(narrative).toContain("Edited");
	});

	it("generates a narrative for an instruction_source", () => {
		const graph = make_graph(
			[
				make_node("claude_md", "instruction_source", "available_ambient"),
				make_node("file_a", "source_file"),
				make_node("file_b", "source_file"),
				make_node("tool_edit", "tool_call"),
			],
			[
				make_edge("claude_md", "file_a", "influenced_by"),
				make_edge("claude_md", "file_b", "influenced_by"),
				make_edge("tool_edit", "file_b", "edited"),
			],
		);

		const narrative = compute_narrative_summary("claude_md", graph);
		expect(narrative).not.toBeNull();
		expect(narrative).toContain("2 downstream files");
	});

	it("returns null for unsupported nodes", () => {
		const graph = make_graph(
			[make_node("session", "session")],
			[],
		);

		expect(compute_narrative_summary("session", graph)).toBeNull();
	});
});

describe("compute_arrival_paths", () => {
	it("traces file back through tool → turn → user_prompt", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", {
					turn_index: 0,
					text: "Fix the bug",
				}),
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read", "tool_call", "available_observed", {
					tool_name: "Read",
				}),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
			],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(1);
		expect(paths[0].action).toBe("read");
		expect(paths[0].tool_node_id).toBe("tool_read");
		expect(paths[0].tool_label).toBe("tool_read");
		expect(paths[0].turn_index).toBe(0);
		expect(paths[0].user_message).toBe("Fix the bug");
	});

	it("returns multiple paths for a file read/edited in different turns", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", {
					turn_index: 0,
					text: "Read it",
				}),
				make_node("turn_0", "assistant_turn", "available_observed", {
					turn_index: 0,
				}),
				make_node("tool_read_0", "tool_call", "available_observed", {
					tool_name: "Read",
				}),
				make_node("user_1", "user_prompt", "available_observed", {
					turn_index: 1,
					text: "Edit it",
				}),
				make_node("turn_1", "assistant_turn", "available_observed", {
					turn_index: 1,
				}),
				make_node("tool_edit_1", "tool_call", "available_observed", {
					tool_name: "Edit",
				}),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read_0", "invoked_tool"),
				make_edge("tool_read_0", "file_a", "read"),
				make_edge("turn_1", "tool_edit_1", "invoked_tool"),
				make_edge("tool_edit_1", "file_a", "edited"),
			],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(2);

		// First: read in turn 0
		expect(paths[0].turn_index).toBe(0);
		expect(paths[0].action).toBe("read");
		expect(paths[0].user_message).toBe("Read it");

		// Second: edited in turn 1
		expect(paths[1].turn_index).toBe(1);
		expect(paths[1].action).toBe("edited");
		expect(paths[1].user_message).toBe("Edit it");
	});

	it("returns empty array for node with no tool edges", () => {
		const graph = make_graph(
			[make_node("file_a", "source_file", "available_ambient")],
			[],
		);

		const paths = compute_arrival_paths("file_a", graph);
		expect(paths).toHaveLength(0);
	});
});

// ── Temporal narrative ──────────────────────────────────────────────────────

describe("compute_temporal_narrative", () => {
	it("returns null for full_session lens", () => {
		const graph = make_graph(
			[make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 })],
			[],
		);

		const lens: TemporalLens = { kind: "full_session" };
		expect(compute_temporal_narrative("turn_0", graph, lens)).toBeNull();
	});

	it("returns built-so-far narrative for selected turn", () => {
		const graph = make_graph(
			[make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 })],
			[],
		);

		const lens: TemporalLens = {
			kind: "built_so_far",
			cutoff: { turn_index: 0, tool_index: Infinity },
			selected_turn_index: 0,
		};
		const result = compute_temporal_narrative("turn_0", graph, lens);
		expect(result).not.toBeNull();
		expect(result).toContain("Turn 1");
		expect(result).toContain("cumulative");
	});

	it("returns arrival-path narrative for selected file with first-seen info", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("tool_read", "tool_call", "available_observed", { tool_name: "Read", turn_index: 0 }),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
			],
		);

		const lens: TemporalLens = {
			kind: "arrival_path",
			target_node_id: "file_a",
			target_label: "file_a",
		};
		const result = compute_temporal_narrative("file_a", graph, lens);
		expect(result).not.toBeNull();
		expect(result).toContain("First seen in Turn 1");
	});

	it("returns null for arrival-path on non-file nodes", () => {
		const graph = make_graph(
			[make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 })],
			[],
		);

		const lens: TemporalLens = {
			kind: "arrival_path",
			target_node_id: "turn_0",
			target_label: "turn_0",
		};
		expect(compute_temporal_narrative("turn_0", graph, lens)).toBeNull();
	});
});

// ── Insight summary (graph-mode aware) ──────────────────────────────────────

describe("compute_insight_summary", () => {
	it("returns primary path summary for an artifact with upstream route", () => {
		const graph = make_graph(
			[
				make_node("user_0", "user_prompt", "available_observed", { turn_index: 0, text: "Fix it" }),
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("search_0", "search_query", "available_observed", { turn_index: 0, tool_index: 0 }),
				make_node("tool_read", "tool_call", "available_observed", { turn_index: 0, tool_index: 1 }),
				make_node("doc_readme", "doc_file"),
				make_node("tool_edit", "tool_call", "available_observed", { turn_index: 0, tool_index: 2 }),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "search_0", "invoked_tool"),
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_read", "doc_readme", "read"),
				make_edge("tool_edit", "file_a", "edited"),
			],
		);

		const insight = compute_insight_subgraph("file_a", graph);
		const summary = compute_insight_summary(insight);

		expect(summary).not.toBeNull();
		expect(summary!.primary_path_label).toBeDefined();
		expect(summary!.primary_path_label.length).toBeGreaterThan(0);
	});

	it("includes supporting contributors when present", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("tool_edit", "tool_call", "available_observed", { turn_index: 0, tool_index: 0 }),
				make_node("file_a", "source_file"),
				make_node("claude_md", "instruction_source", "available_ambient"),
			],
			[
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_edit", "file_a", "edited"),
				make_edge("claude_md", "file_a", "influenced_by"),
			],
		);

		const insight = compute_insight_subgraph("file_a", graph);
		const summary = compute_insight_summary(insight);

		expect(summary).not.toBeNull();
		expect(summary!.supporting_labels.length).toBeGreaterThan(0);
	});

	it("includes structural references when present", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("tool_edit", "tool_call", "available_observed", { turn_index: 0, tool_index: 0 }),
				make_node("file_a", "source_file"),
				make_node("file_b", "source_file"),
			],
			[
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_edit", "file_a", "edited"),
				make_edge("file_a", "file_b", "imports"),
			],
		);

		const insight = compute_insight_subgraph("file_a", graph);
		const summary = compute_insight_summary(insight);

		expect(summary).not.toBeNull();
		expect(summary!.structural_ref_labels.length).toBeGreaterThan(0);
	});

	it("includes downstream effects when present", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("tool_read", "tool_call", "available_observed", { turn_index: 0, tool_index: 0 }),
				make_node("tool_edit", "tool_call", "available_observed", { turn_index: 0, tool_index: 1 }),
				make_node("file_a", "source_file"),
				make_node("file_b", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("turn_0", "tool_edit", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
				make_edge("tool_edit", "file_b", "edited"),
			],
		);

		const insight = compute_insight_subgraph("file_a", graph);
		const summary = compute_insight_summary(insight);

		expect(summary).not.toBeNull();
		expect(summary!.downstream_labels.length).toBeGreaterThan(0);
	});

	it("returns null for empty insight subgraph", () => {
		const empty_insight: InsightSubgraph = {
			focal_node_id: null,
			nodes: [],
			edges: [],
		};

		const summary = compute_insight_summary(empty_insight);
		expect(summary).toBeNull();
	});

	it("produces a readable sentence from primary path", () => {
		const graph = make_graph(
			[
				make_node("turn_0", "assistant_turn", "available_observed", { turn_index: 0 }),
				make_node("tool_read", "tool_call", "available_observed", { turn_index: 0, tool_index: 0 }),
				make_node("file_a", "source_file"),
			],
			[
				make_edge("turn_0", "tool_read", "invoked_tool"),
				make_edge("tool_read", "file_a", "read"),
			],
		);

		const insight = compute_insight_subgraph("file_a", graph);
		const summary = compute_insight_summary(insight);

		expect(summary).not.toBeNull();
		// Should be something like "turn_0 → tool_read → file_a"
		expect(summary!.primary_path_label).toContain("→");
	});
});
