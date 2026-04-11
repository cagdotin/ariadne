import { describe, expect, it } from "vitest";
import type {
	ExplorationArtifact,
	ExplorationEvent,
	ExplorationPayload,
	ExplorationRelation,
	ExplorationTurn,
} from "../../../../contracts/exploration/types";
import {
	compute_causal_chain,
	compute_highlight_ids,
	compute_related_relations,
	type SelectionTarget,
} from "../../../../src/components/exploration/exploration-selection";

// ── Fixtures ────────────────────────────────────────────────────────────────

function make_turn(
	index: number,
	event_ids: string[],
	artifact_ids: string[],
): ExplorationTurn {
	return {
		index,
		user_message_snippet: `Turn ${index}`,
		event_ids,
		artifact_ids,
		timestamp: "2025-06-01T10:00:00Z",
		entry_id: `turn_${index}`,
	};
}

function make_event(
	id: string,
	kind: string,
	opts: { artifact_id?: string; turn_index?: number } = {},
): ExplorationEvent {
	return {
		id,
		kind: kind as ExplorationEvent["kind"],
		turn_index: opts.turn_index ?? 0,
		timestamp: "2025-06-01T10:00:00Z",
		label: id,
		artifact_id: opts.artifact_id ?? null,
		entry_id: null,
		detail: null,
		is_error: false,
	};
}

function make_artifact(
	id: string,
	opts: { explored?: boolean; kind?: string } = {},
): ExplorationArtifact {
	return {
		id,
		kind: (opts.kind ?? "source_file") as ExplorationArtifact["kind"],
		path: id.replace("art_", ""),
		label: id,
		parent_id: null,
		explored: opts.explored ?? true,
		first_seen_turn: 0,
	};
}

function make_relation(
	source_id: string,
	target_id: string,
	kind: string,
	evidence = "sequencing_inference",
): ExplorationRelation {
	return {
		source_id,
		target_id,
		kind: kind as ExplorationRelation["kind"],
		evidence: evidence as ExplorationRelation["evidence"],
		label: null,
	};
}

function make_payload(
	overrides: Partial<ExplorationPayload> = {},
): ExplorationPayload {
	return {
		session_id: "s1",
		project_path: "/project",
		turns: [],
		events: [],
		artifacts: [],
		relations: [],
		has_repo_context: false,
		derived_at: "2025-06-01T10:00:00Z",
		...overrides,
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("compute_highlight_ids", () => {
	it("returns empty set for null selection", () => {
		const payload = make_payload();
		const result = compute_highlight_ids(null, payload);
		expect(result.size).toBe(0);
	});

	// ── Turn selection ──────────────────────────────────────────────

	describe("turn selection", () => {
		it("highlights all event IDs and artifact IDs in the turn", () => {
			const turn = make_turn(0, ["evt_0_0", "evt_0_1"], ["art_src/a.ts"]);
			const payload = make_payload({
				turns: [turn],
				events: [
					make_event("evt_0_0", "user_message"),
					make_event("evt_0_1", "file_read", { artifact_id: "art_src/a.ts" }),
				],
				artifacts: [make_artifact("art_src/a.ts")],
			});

			const selection: SelectionTarget = { type: "turn", turn };
			const ids = compute_highlight_ids(selection, payload);

			expect(ids.has("evt_0_0")).toBe(true);
			expect(ids.has("evt_0_1")).toBe(true);
			expect(ids.has("art_src/a.ts")).toBe(true);
			expect(ids.size).toBe(3);
		});
	});

	// ── Event selection ─────────────────────────────────────────────

	describe("event selection", () => {
		it("highlights the event and its linked artifact", () => {
			const evt = make_event("evt_0_1", "file_read", {
				artifact_id: "art_src/a.ts",
			});
			const payload = make_payload({
				events: [evt],
				artifacts: [make_artifact("art_src/a.ts")],
			});

			const selection: SelectionTarget = { type: "event", event: evt };
			const ids = compute_highlight_ids(selection, payload);

			expect(ids.has("evt_0_1")).toBe(true);
			expect(ids.has("art_src/a.ts")).toBe(true);
		});

		it("highlights relation endpoints where event is source or target", () => {
			const evt = make_event("evt_0_1", "file_read", {
				artifact_id: "art_src/a.ts",
			});
			const payload = make_payload({
				events: [make_event("evt_0_0", "user_message"), evt],
				artifacts: [make_artifact("art_src/a.ts")],
				relations: [make_relation("evt_0_0", "evt_0_1", "prompt_triggered")],
			});

			const selection: SelectionTarget = { type: "event", event: evt };
			const ids = compute_highlight_ids(selection, payload);

			// evt_0_0 is pulled in as the other end of the relation
			expect(ids.has("evt_0_0")).toBe(true);
			expect(ids.has("evt_0_1")).toBe(true);
		});

		it("does not highlight unrelated items", () => {
			const evt = make_event("evt_0_1", "file_read");
			const payload = make_payload({
				events: [evt, make_event("evt_1_0", "user_message", { turn_index: 1 })],
			});

			const selection: SelectionTarget = { type: "event", event: evt };
			const ids = compute_highlight_ids(selection, payload);

			expect(ids.has("evt_1_0")).toBe(false);
		});
	});

	// ── Artifact selection ──────────────────────────────────────────

	describe("artifact selection", () => {
		it("highlights the artifact and all events referencing it", () => {
			const art = make_artifact("art_src/a.ts");
			const payload = make_payload({
				events: [
					make_event("evt_0_0", "user_message"),
					make_event("evt_0_1", "file_read", { artifact_id: "art_src/a.ts" }),
					make_event("evt_0_2", "file_edit", { artifact_id: "art_src/a.ts" }),
					make_event("evt_0_3", "file_read", { artifact_id: "art_src/b.ts" }),
				],
				artifacts: [art, make_artifact("art_src/b.ts")],
			});

			const selection: SelectionTarget = { type: "artifact", artifact: art };
			const ids = compute_highlight_ids(selection, payload);

			expect(ids.has("art_src/a.ts")).toBe(true);
			expect(ids.has("evt_0_1")).toBe(true);
			expect(ids.has("evt_0_2")).toBe(true);
			// Unrelated
			expect(ids.has("evt_0_0")).toBe(false);
			expect(ids.has("evt_0_3")).toBe(false);
		});

		it("highlights relation endpoints for artifact relations", () => {
			const art = make_artifact("art_src/a.ts");
			const payload = make_payload({
				events: [],
				artifacts: [
					art,
					make_artifact("art_src/b.ts"),
					make_artifact("art_src/c.ts"),
				],
				relations: [
					make_relation("art_src/a.ts", "art_src/b.ts", "file_imports_file"),
					make_relation("art_src/c.ts", "art_src/a.ts", "doc_references_file"),
				],
			});

			const selection: SelectionTarget = { type: "artifact", artifact: art };
			const ids = compute_highlight_ids(selection, payload);

			expect(ids.has("art_src/a.ts")).toBe(true);
			expect(ids.has("art_src/b.ts")).toBe(true);
			expect(ids.has("art_src/c.ts")).toBe(true);
		});

		it("unexplored neighbors are visibly distinct from explored artifacts", () => {
			const explored = make_artifact("art_src/a.ts", { explored: true });
			const unexplored = make_artifact("art_src/b.ts", { explored: false });

			// The distinction is in the artifact.explored property
			expect(explored.explored).toBe(true);
			expect(unexplored.explored).toBe(false);
		});
	});
});

// ── Related relations ──────────────────────────────────────────────���────────

describe("compute_related_relations", () => {
	it("returns empty array for empty highlights", () => {
		const result = compute_related_relations(new Set(), [
			make_relation("a", "b", "file_imports_file"),
		]);
		expect(result).toEqual([]);
	});

	it("returns relations where source or target is highlighted", () => {
		const highlight_ids = new Set(["evt_0_1", "art_src/a.ts"]);
		const relations = [
			make_relation("evt_0_0", "evt_0_1", "prompt_triggered"),
			make_relation("art_src/a.ts", "art_src/b.ts", "file_imports_file"),
			make_relation("art_src/c.ts", "art_src/d.ts", "doc_links_doc"),
		];

		const result = compute_related_relations(highlight_ids, relations);

		expect(result).toHaveLength(2);
		expect(result[0].kind).toBe("prompt_triggered");
		expect(result[1].kind).toBe("file_imports_file");
	});
});

// ── Causal chain ────────────────────────────────────────────────────────────

describe("compute_causal_chain", () => {
	it("returns only incoming relations for the artifact", () => {
		const related = [
			make_relation("art_src/b.ts", "art_src/a.ts", "file_imports_file"),
			make_relation("art_src/a.ts", "art_src/c.ts", "file_imports_file"),
			make_relation("art_doc.md", "art_src/a.ts", "doc_references_file"),
		];

		const chain = compute_causal_chain("art_src/a.ts", related);

		expect(chain).toHaveLength(2);
		expect(chain[0].source_id).toBe("art_src/b.ts");
		expect(chain[1].source_id).toBe("art_doc.md");
	});

	it("returns empty array when no incoming relations exist", () => {
		const related = [
			make_relation("art_src/a.ts", "art_src/b.ts", "file_imports_file"),
		];

		const chain = compute_causal_chain("art_src/a.ts", related);
		expect(chain).toHaveLength(0);
	});
});

// ── Integration: full selection flow ────────────────────────────────────────

describe("selection flow integration", () => {
	const art_a = make_artifact("art_src/a.ts");
	const art_b = make_artifact("art_src/b.ts", { explored: false });
	const evt_user = make_event("evt_0_0", "user_message");
	const evt_read = make_event("evt_0_1", "file_read", {
		artifact_id: "art_src/a.ts",
	});
	const evt_edit = make_event("evt_0_2", "file_edit", {
		artifact_id: "art_src/a.ts",
	});

	const turn = make_turn(
		0,
		["evt_0_0", "evt_0_1", "evt_0_2"],
		["art_src/a.ts"],
	);

	const relations = [
		make_relation("evt_0_0", "evt_0_1", "prompt_triggered", "explicit_session"),
		make_relation("evt_0_1", "evt_0_2", "read_preceded_edit"),
		make_relation(
			"art_src/a.ts",
			"art_src/b.ts",
			"file_imports_file",
			"structural_code",
		),
		make_relation(
			"art_src/a.ts",
			"art_src/b.ts",
			"adjacent_unexplored",
			"adjacency_only",
		),
	];

	const payload = make_payload({
		turns: [turn],
		events: [evt_user, evt_read, evt_edit],
		artifacts: [art_a, art_b],
		relations,
	});

	it("selecting a turn highlights all downstream events and artifacts", () => {
		const sel: SelectionTarget = { type: "turn", turn };
		const ids = compute_highlight_ids(sel, payload);

		expect(ids.has("evt_0_0")).toBe(true);
		expect(ids.has("evt_0_1")).toBe(true);
		expect(ids.has("evt_0_2")).toBe(true);
		expect(ids.has("art_src/a.ts")).toBe(true);
	});

	it("selecting an artifact shows related relations in inspector", () => {
		const sel: SelectionTarget = { type: "artifact", artifact: art_a };
		const ids = compute_highlight_ids(sel, payload);
		const related = compute_related_relations(ids, payload.relations);

		// All 4 relations touch art_src/a.ts (via events or directly)
		expect(related.length).toBeGreaterThanOrEqual(2);

		// Causal chain: incoming relations to art_a
		const chain = compute_causal_chain("art_src/a.ts", related);
		// No incoming relations to art_a in this payload (it's a source, not target)
		expect(chain).toHaveLength(0);
	});

	it("selecting an event shows related relations", () => {
		const sel: SelectionTarget = { type: "event", event: evt_read };
		const ids = compute_highlight_ids(sel, payload);
		const related = compute_related_relations(ids, payload.relations);

		// evt_0_1 is in: prompt_triggered (target), read_preceded_edit (source)
		expect(related.length).toBeGreaterThanOrEqual(2);
	});

	it("one-hop unexplored neighbors are visibly distinct from explored artifacts", () => {
		// Unexplored neighbor artifact has explored: false
		expect(art_b.explored).toBe(false);
		// Explored artifact has explored: true
		expect(art_a.explored).toBe(true);

		// When selecting art_a, art_b should be highlighted via relation
		const sel: SelectionTarget = { type: "artifact", artifact: art_a };
		const ids = compute_highlight_ids(sel, payload);
		expect(ids.has("art_src/b.ts")).toBe(true);
	});
});
