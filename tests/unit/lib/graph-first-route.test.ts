/**
 * Route-level contract tests for graph-first exploration loading.
 *
 * These tests prove that the exploration route can be fully powered by
 * a single graph fetch + renderer-side adapter projection, without
 * needing the legacy get_session_exploration() call.
 */
import { describe, expect, it } from "vitest";
import { exploration_payload_schema } from "../../../contracts/exploration/types";
import type { SessionGraphPayload } from "../../../contracts/graph/types";
import { session_graph_payload_schema } from "../../../contracts/graph/types";
import { project_graph_to_exploration } from "../../../src/lib/graph-to-exploration-adapter";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function make_minimal_graph(): SessionGraphPayload {
	return {
		session_id: "sess-minimal",
		project_path: "/project",
		nodes: [
			{
				id: "session_sess-minimal",
				kind: "session",
				label: "Session",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_replay", source_ref: "sess-minimal", detail: null },
				],
			},
		],
		edges: [],
		has_repo_context: false,
		derived_at: "2026-04-13T10:00:00Z",
	};
}

function make_rich_graph(): SessionGraphPayload {
	return {
		session_id: "sess-rich",
		project_path: "/project",
		nodes: [
			{
				id: "session_sess-rich",
				kind: "session",
				label: "Session sess-rich",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_replay", source_ref: "sess-rich", detail: null },
				],
			},
			{
				id: "framing_sess-rich",
				kind: "session_framing",
				label: "Session Framing",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
			},
			// Framing children
			{
				id: "framing_cwd",
				kind: "runtime_context",
				label: "cwd: /project",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_replay", source_ref: "init", detail: null },
				],
			},
			{
				id: "framing_system_prompt",
				kind: "system_prompt",
				label: "System Prompt",
				availability: "unavailable",
				confidence: "low",
				evidence: [],
			},
			{
				id: "file_CLAUDE.md",
				kind: "instruction_source",
				label: "CLAUDE.md",
				availability: "available_ambient",
				confidence: "medium",
				evidence: [
					{
						kind: "ambient_repo_context",
						source_ref: "CLAUDE.md",
						detail: null,
					},
				],
				metadata: { path: "CLAUDE.md" },
			},
			// Turn 0
			{
				id: "user_prompt_0",
				kind: "user_prompt",
				label: "User: implement feature",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u0", detail: null }],
				metadata: { turn_index: 0, text: "implement feature" },
			},
			{
				id: "assistant_turn_0",
				kind: "assistant_turn",
				label: "Turn 1",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u0", detail: null }],
				metadata: { turn_index: 0 },
			},
			{
				id: "tool_0_0",
				kind: "tool_call",
				label: "Read: main.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a0", detail: null },
				],
				metadata: { tool_name: "Read", file_path: "/project/src/main.ts" },
			},
			{
				id: "tool_0_1",
				kind: "tool_call",
				label: "Write: feature.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a0", detail: null },
				],
				metadata: { tool_name: "Write", file_path: "/project/src/feature.ts" },
			},
			{
				id: "file_src_main.ts",
				kind: "source_file",
				label: "main.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a0", detail: null },
				],
				metadata: { path: "src/main.ts" },
			},
			{
				id: "file_src_feature.ts",
				kind: "source_file",
				label: "feature.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a0", detail: null },
				],
				metadata: { path: "src/feature.ts" },
			},
			// Turn 1
			{
				id: "user_prompt_1",
				kind: "user_prompt",
				label: "User: add tests",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u1", detail: null }],
				metadata: { turn_index: 1, text: "add tests" },
			},
			{
				id: "assistant_turn_1",
				kind: "assistant_turn",
				label: "Turn 2",
				availability: "available_observed",
				confidence: "high",
				evidence: [{ kind: "observed_replay", source_ref: "u1", detail: null }],
				metadata: { turn_index: 1 },
			},
			{
				id: "tool_1_0",
				kind: "tool_call",
				label: "Write: feature.test.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: {
					tool_name: "Write",
					file_path: "/project/tests/feature.test.ts",
				},
			},
			{
				id: "file_tests_feature.test.ts",
				kind: "source_file",
				label: "feature.test.ts",
				availability: "available_observed",
				confidence: "high",
				evidence: [
					{ kind: "observed_tool_args", source_ref: "a1", detail: null },
				],
				metadata: { path: "tests/feature.test.ts" },
			},
		],
		edges: [
			// Framing edges
			{
				source_id: "session_sess-rich",
				target_id: "framing_sess-rich",
				kind: "framed_by",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "framing_sess-rich",
				target_id: "framing_cwd",
				kind: "framed_by",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "framing_sess-rich",
				target_id: "framing_system_prompt",
				kind: "framed_by",
				availability: "unavailable",
				confidence: "low",
				evidence: [],
				label: null,
			},
			{
				source_id: "framing_sess-rich",
				target_id: "file_CLAUDE.md",
				kind: "framed_by",
				availability: "available_ambient",
				confidence: "medium",
				evidence: [],
				label: null,
			},
			// Turn 0 edges
			{
				source_id: "session_sess-rich",
				target_id: "user_prompt_0",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "user_prompt_0",
				target_id: "assistant_turn_0",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_0",
				target_id: "tool_0_0",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_0",
				target_id: "tool_0_1",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "tool_0_0",
				target_id: "file_src_main.ts",
				kind: "read",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "tool_0_1",
				target_id: "file_src_feature.ts",
				kind: "wrote",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			// Turn 1 edges
			{
				source_id: "session_sess-rich",
				target_id: "user_prompt_1",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "user_prompt_1",
				target_id: "assistant_turn_1",
				kind: "prompted",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "assistant_turn_1",
				target_id: "tool_1_0",
				kind: "invoked_tool",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
			{
				source_id: "tool_1_0",
				target_id: "file_tests_feature.test.ts",
				kind: "wrote",
				availability: "available_observed",
				confidence: "high",
				evidence: [],
				label: null,
			},
		],
		has_repo_context: true,
		derived_at: "2026-04-13T12:00:00Z",
	};
}

// ── Graph-first route contract ───────────────────────────────────────────────

describe("graph-first route contract", () => {
	it("graph payload alone is sufficient to produce valid ExplorationPayload", () => {
		const graph = make_rich_graph();
		// Validate the graph itself
		expect(() => session_graph_payload_schema.parse(graph)).not.toThrow();
		// Project to exploration
		const payload = project_graph_to_exploration(graph);
		// Validate the projection
		expect(() => exploration_payload_schema.parse(payload)).not.toThrow();
	});

	it("minimal graph produces valid empty exploration payload", () => {
		const graph = make_minimal_graph();
		const payload = project_graph_to_exploration(graph);
		expect(() => exploration_payload_schema.parse(payload)).not.toThrow();
		expect(payload.turns).toHaveLength(0);
		expect(payload.events).toHaveLength(0);
		expect(payload.artifacts).toHaveLength(0);
	});

	it("graph-derived payload preserves multi-turn structure", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		expect(payload.turns).toHaveLength(2);
		expect(payload.turns[0].user_message_snippet).toBe("implement feature");
		expect(payload.turns[1].user_message_snippet).toBe("add tests");
	});

	it("graph-derived payload preserves artifact exploration state", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		// Observed files are explored
		const main = payload.artifacts.find((a) => a.path === "src/main.ts");
		expect(main?.explored).toBe(true);

		// Ambient instruction source is unexplored
		const claude_md = payload.artifacts.find((a) => a.path === "CLAUDE.md");
		expect(claude_md?.explored).toBe(false);
	});

	it("graph-derived payload produces correct event kinds", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		const kinds = payload.events.map((e) => e.kind);
		expect(kinds.filter((k) => k === "user_message")).toHaveLength(2);
		expect(kinds).toContain("file_read");
		expect(kinds).toContain("file_write");
	});

	it("graph-derived payload links events to correct artifacts", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		// The Read: main.ts event should link to the main.ts artifact
		const read_evt = payload.events.find((e) => e.label === "Read: main.ts");
		expect(read_evt?.artifact_id).toBe("file_src_main.ts");

		// The Write: feature.ts event should link to the feature.ts artifact
		const write_evt = payload.events.find(
			(e) => e.label === "Write: feature.ts",
		);
		expect(write_evt?.artifact_id).toBe("file_src_feature.ts");
	});

	it("graph framing nodes are preserved in the graph payload for ExplorationFraming", () => {
		const graph = make_rich_graph();
		const framing = graph.nodes.find((n) => n.kind === "session_framing");
		expect(framing).toBeDefined();

		const framing_edges = graph.edges.filter(
			(e) => e.source_id === framing?.id,
		);
		expect(framing_edges.length).toBe(3); // cwd, system_prompt, CLAUDE.md
	});

	it("graph-derived relations preserve exploration-compatible edge structure", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		// read and wrote edges should produce relations
		expect(payload.relations.length).toBeGreaterThan(0);

		const rel_kinds = payload.relations.map((r) => r.kind);
		expect(rel_kinds).toContain("command_led_to_read"); // from read edge
		expect(rel_kinds).toContain("read_preceded_edit"); // from wrote edge
	});
});

// ── Selection compatibility ──────────────────────────────────────────────────

describe("graph-first selection compatibility", () => {
	it("graph-derived artifacts have stable IDs for selection", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		// Artifact IDs come from graph node IDs — stable and deterministic
		const art_ids = payload.artifacts.map((a) => a.id);
		expect(art_ids).toContain("file_src_main.ts");
		expect(art_ids).toContain("file_src_feature.ts");
		expect(art_ids).toContain("file_CLAUDE.md");
	});

	it("graph-derived events reference graph-derived artifact IDs", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		const art_ids = new Set(payload.artifacts.map((a) => a.id));
		for (const evt of payload.events) {
			if (evt.artifact_id) {
				expect(art_ids.has(evt.artifact_id)).toBe(true);
			}
		}
	});

	it("graph-derived turn artifact_ids all exist in artifacts list", () => {
		const graph = make_rich_graph();
		const payload = project_graph_to_exploration(graph);

		const art_ids = new Set(payload.artifacts.map((a) => a.id));
		for (const turn of payload.turns) {
			for (const aid of turn.artifact_ids) {
				expect(art_ids.has(aid)).toBe(true);
			}
		}
	});
});
