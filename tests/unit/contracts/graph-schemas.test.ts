import { describe, expect, it } from "vitest";
import {
	availability_state_schema,
	confidence_schema,
	graph_edge_kind_schema,
	graph_edge_schema,
	graph_evidence_kind_schema,
	graph_evidence_schema,
	graph_node_kind_schema,
	graph_node_schema,
	session_graph_payload_schema,
} from "../../../contracts/graph/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function make_evidence(overrides: Record<string, unknown> = {}) {
	return {
		kind: "observed_replay",
		source_ref: "entry-123",
		detail: "found in replay",
		...overrides,
	};
}

function make_node(overrides: Record<string, unknown> = {}) {
	return {
		id: "node_1",
		kind: "session",
		label: "Session",
		availability: "available_observed",
		confidence: "high",
		evidence: [make_evidence()],
		...overrides,
	};
}

function make_edge(overrides: Record<string, unknown> = {}) {
	return {
		source_id: "node_1",
		target_id: "node_2",
		kind: "framed_by",
		availability: "available_observed",
		confidence: "high",
		evidence: [make_evidence()],
		label: null,
		...overrides,
	};
}

function make_payload(overrides: Record<string, unknown> = {}) {
	return {
		session_id: "sess-1",
		project_path: "/project",
		nodes: [make_node()],
		edges: [make_edge()],
		has_repo_context: false,
		derived_at: "2026-04-11T10:00:00Z",
		...overrides,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("graph contract schemas", () => {
	describe("availability_state_schema", () => {
		it("accepts all valid states", () => {
			const states = [
				"available_observed",
				"available_ambient",
				"derived_inferred",
				"unavailable",
				"unknown",
			];
			for (const s of states) {
				expect(availability_state_schema.parse(s)).toBe(s);
			}
		});

		it("rejects invalid state", () => {
			expect(() => availability_state_schema.parse("maybe")).toThrow();
		});
	});

	describe("confidence_schema", () => {
		it("accepts all valid levels", () => {
			for (const c of ["high", "medium", "low"]) {
				expect(confidence_schema.parse(c)).toBe(c);
			}
		});
	});

	describe("graph_evidence_kind_schema", () => {
		it("accepts all evidence kinds", () => {
			const kinds = [
				"observed_replay",
				"observed_tool_args",
				"observed_custom_message",
				"parsed_markdown_link",
				"parsed_import",
				"ambient_repo_context",
				"inferred_temporal",
				"heuristic",
			];
			for (const k of kinds) {
				expect(graph_evidence_kind_schema.parse(k)).toBe(k);
			}
		});
	});

	describe("graph_evidence_schema", () => {
		it("parses valid evidence with source_ref", () => {
			const ev = make_evidence();
			expect(graph_evidence_schema.parse(ev)).toEqual(ev);
		});

		it("parses evidence with null source_ref", () => {
			const ev = make_evidence({ source_ref: null });
			expect(graph_evidence_schema.parse(ev)).toEqual(ev);
		});

		it("rejects evidence with invalid kind", () => {
			expect(() =>
				graph_evidence_schema.parse(make_evidence({ kind: "magic" })),
			).toThrow();
		});
	});

	describe("graph_node_schema", () => {
		it("parses valid node", () => {
			const node = make_node();
			expect(graph_node_schema.parse(node)).toEqual(node);
		});

		it("parses all node kinds", () => {
			const kinds = [
				"session",
				"session_framing",
				"runtime_context",
				"instruction_source",
				"system_prompt",
				"developer_prompt",
				"agents_doc",
				"user_prompt",
				"assistant_turn",
				"tool_call",
				"search_query",
				"directory",
				"source_file",
				"doc_file",
				"doc_section",
			];
			for (const kind of kinds) {
				const node = make_node({ id: `node_${kind}`, kind });
				expect(graph_node_schema.parse(node).kind).toBe(kind);
			}
		});

		it("supports unavailable system_prompt without prompt text", () => {
			const node = make_node({
				id: "sys_prompt",
				kind: "system_prompt",
				label: "System prompt (unavailable)",
				availability: "unavailable",
				confidence: "high",
				evidence: [],
			});
			const parsed = graph_node_schema.parse(node);
			expect(parsed.availability).toBe("unavailable");
			expect(parsed.kind).toBe("system_prompt");
		});

		it("supports unknown developer_prompt", () => {
			const node = make_node({
				id: "dev_prompt",
				kind: "developer_prompt",
				label: "Developer prompt (unknown)",
				availability: "unknown",
				confidence: "high",
				evidence: [],
			});
			const parsed = graph_node_schema.parse(node);
			expect(parsed.availability).toBe("unknown");
		});

		it("supports optional metadata", () => {
			const node = make_node({ metadata: { cwd: "/project", model: "opus" } });
			expect(graph_node_schema.parse(node).metadata).toEqual({
				cwd: "/project",
				model: "opus",
			});
		});

		it("rejects node with invalid kind", () => {
			expect(() =>
				graph_node_schema.parse(make_node({ kind: "invalid" })),
			).toThrow();
		});

		it("rejects node without id", () => {
			const { id: _, ...rest } = make_node();
			expect(() => graph_node_schema.parse(rest)).toThrow();
		});
	});

	describe("graph_edge_schema", () => {
		it("parses valid edge", () => {
			const edge = make_edge();
			expect(graph_edge_schema.parse(edge)).toEqual(edge);
		});

		it("parses all edge kinds", () => {
			const kinds = [
				"framed_by",
				"prompted",
				"invoked_tool",
				"searched_for",
				"read",
				"edited",
				"wrote",
				"discovered",
				"linked_to",
				"imports",
				"belongs_to",
				"influenced_by",
				"constrained_by",
				"adjacent_unexplored",
			];
			for (const kind of kinds) {
				const edge = make_edge({ kind });
				expect(graph_edge_schema.parse(edge).kind).toBe(kind);
			}
		});

		it("supports ambient availability on edges", () => {
			const edge = make_edge({
				availability: "available_ambient",
				confidence: "medium",
				evidence: [make_evidence({ kind: "ambient_repo_context" })],
			});
			const parsed = graph_edge_schema.parse(edge);
			expect(parsed.availability).toBe("available_ambient");
		});

		it("rejects edge with invalid kind", () => {
			expect(() =>
				graph_edge_schema.parse(make_edge({ kind: "teleports_to" })),
			).toThrow();
		});
	});

	describe("session_graph_payload_schema", () => {
		it("parses valid payload", () => {
			const payload = make_payload();
			expect(session_graph_payload_schema.parse(payload)).toEqual(payload);
		});

		it("parses payload with empty nodes and edges", () => {
			const payload = make_payload({ nodes: [], edges: [] });
			const parsed = session_graph_payload_schema.parse(payload);
			expect(parsed.nodes).toEqual([]);
			expect(parsed.edges).toEqual([]);
		});

		it("parses payload with mixed availability states", () => {
			const payload = make_payload({
				nodes: [
					make_node({
						id: "n1",
						availability: "available_observed",
					}),
					make_node({
						id: "n2",
						kind: "system_prompt",
						availability: "unavailable",
						evidence: [],
					}),
					make_node({
						id: "n3",
						kind: "agents_doc",
						availability: "available_ambient",
						evidence: [make_evidence({ kind: "ambient_repo_context" })],
					}),
				],
			});
			const parsed = session_graph_payload_schema.parse(payload);
			expect(parsed.nodes).toHaveLength(3);
			expect(parsed.nodes[1].availability).toBe("unavailable");
			expect(parsed.nodes[2].availability).toBe("available_ambient");
		});

		it("rejects payload missing session_id", () => {
			const { session_id: _, ...rest } = make_payload();
			expect(() => session_graph_payload_schema.parse(rest)).toThrow();
		});

		it("rejects payload with invalid node", () => {
			expect(() =>
				session_graph_payload_schema.parse(
					make_payload({ nodes: [{ id: "bad" }] }),
				),
			).toThrow();
		});
	});
});
