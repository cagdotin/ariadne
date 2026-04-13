import { describe, expect, it } from "vitest";
import { augment_repo_context } from "../../../backend/analytics/graph/augment-repo-context";
import { session_graph_payload_schema } from "../../../contracts/graph/types";
import type { SessionGraphPayload } from "../../../contracts/graph/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function make_base_graph(
	session_id: string,
	project_path: string,
): SessionGraphPayload {
	return {
		session_id,
		project_path,
		nodes: [
			{
				id: `session_${session_id}`,
				kind: "session",
				label: `Session ${session_id}`,
				availability: "available_observed",
				confidence: "high",
				evidence: [],
			},
			{
				id: `framing_${session_id}`,
				kind: "session_framing",
				label: "Session Framing",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
			},
		],
		edges: [
			{
				source_id: `session_${session_id}`,
				target_id: `framing_${session_id}`,
				kind: "framed_by",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
		],
		has_repo_context: false,
		derived_at: "2026-04-13T10:00:00Z",
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("augment_repo_context", () => {
	it("produces schema-valid payload after augmentation", () => {
		// Use current project path which has CLAUDE.md
		const graph = make_base_graph("sess-1", process.cwd());
		augment_repo_context(graph);
		expect(() => session_graph_payload_schema.parse(graph)).not.toThrow();
	});

	it("sets has_repo_context to true on success", () => {
		const graph = make_base_graph("sess-1", process.cwd());
		augment_repo_context(graph);
		expect(graph.has_repo_context).toBe(true);
	});

	it("adds ambient instruction sources with available_ambient availability", () => {
		const graph = make_base_graph("sess-1", process.cwd());
		augment_repo_context(graph);
		const ambient_nodes = graph.nodes.filter(
			(n) => n.availability === "available_ambient",
		);
		// This project has at least CLAUDE.md
		expect(ambient_nodes.length).toBeGreaterThan(0);
		for (const node of ambient_nodes) {
			expect(node.evidence[0].kind).toBe("ambient_repo_context");
		}
	});

	it("adds constrained_by edges for ambient sources", () => {
		const graph = make_base_graph("sess-1", process.cwd());
		augment_repo_context(graph);
		const ambient_edges = graph.edges.filter(
			(e) => e.availability === "available_ambient",
		);
		expect(ambient_edges.length).toBeGreaterThan(0);
		for (const edge of ambient_edges) {
			expect(edge.kind).toBe("constrained_by");
			expect(edge.label).toBe("ambient");
		}
	});

	it("does not add node if same file already exists in graph (observed)", () => {
		const graph = make_base_graph("sess-1", process.cwd());
		// Pre-add CLAUDE.md as observed
		const claude_id = graph.nodes.find(
			(n) => n.id.includes("CLAUDE"),
		)?.id;
		// Manually add an observed CLAUDE.md node
		graph.nodes.push({
			id: "file_CLAUDE.md",
			kind: "instruction_source",
			label: "CLAUDE.md",
			availability: "available_observed",
			confidence: "high",
			evidence: [{ kind: "observed_replay", source_ref: null, detail: null }],
		});
		const count_before = graph.nodes.length;
		augment_repo_context(graph);
		// Should not add a duplicate CLAUDE.md
		const claude_nodes = graph.nodes.filter(
			(n) => n.id === "file_CLAUDE.md",
		);
		expect(claude_nodes).toHaveLength(1);
	});

	it("skips augmentation when project_path is empty", () => {
		const graph = make_base_graph("sess-1", "");
		const nodes_before = graph.nodes.length;
		augment_repo_context(graph);
		expect(graph.nodes.length).toBe(nodes_before);
		expect(graph.has_repo_context).toBe(false);
	});

	it("skips augmentation when framing node is missing", () => {
		const graph = make_base_graph("sess-1", process.cwd());
		graph.nodes = graph.nodes.filter((n) => n.kind !== "session_framing");
		const edges_before = graph.edges.length;
		augment_repo_context(graph);
		// Should not add any edges
		expect(graph.edges.length).toBe(edges_before);
	});

	it("does not corrupt graph when project path does not exist", () => {
		const graph = make_base_graph("sess-1", "/nonexistent/path/to/project");
		const nodes_before = [...graph.nodes];
		const edges_before = [...graph.edges];
		augment_repo_context(graph);
		// Graph should be unchanged (augmentation fails gracefully)
		expect(graph.nodes).toEqual(nodes_before);
		expect(graph.edges).toEqual(edges_before);
	});
});
