import { beforeEach, describe, expect, it } from "vitest";
import { make_artifact_id } from "../../../backend/analytics/exploration/artifact-ids";
import { derive_exploration } from "../../../backend/analytics/exploration/derive-exploration";
import {
	clear_cache,
	get_cached,
	set_cached,
} from "../../../backend/analytics/exploration/exploration-cache";
import type { ExplorationPayload } from "../../../contracts/exploration/types";
import type { SessionEntry, SessionHeader } from "../../../contracts/sessions/replay";

// ── Helpers ──────────────────────────────────────────────────────────────────

function make_user_entry(
	content: string,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "u1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:00Z",
		message: { role: "user", content },
	};
}

function make_assistant_entry(
	tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "a1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:01Z",
		message: {
			role: "assistant",
			content: tool_calls.map((tc) => ({
				type: "toolCall" as const,
				id: `tc_${tc.name}`,
				name: tc.name,
				arguments: tc.arguments,
			})),
		},
	};
}

function make_tool_result_entry(
	tool_name: string,
	is_error: boolean,
	opts: { id?: string; timestamp?: string } = {},
): SessionEntry {
	return {
		type: "message",
		id: opts.id ?? "tr1",
		parentId: null,
		timestamp: opts.timestamp ?? "2025-06-01T10:00:02Z",
		message: {
			role: "toolResult",
			toolCallId: `tc_${tool_name}`,
			toolName: tool_name,
			isError: is_error,
			content: [],
		},
	};
}

const default_header: SessionHeader = {
	type: "session",
	id: "sess-1",
	cwd: "/project",
	timestamp: "2025-06-01T10:00:00Z",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("derive_exploration", () => {
	// ── Turn grouping ────────────────────────────────────────────────

	describe("turn grouping", () => {
		it("groups entries into turns starting at each user message", () => {
			const entries = [
				make_user_entry("First question", { id: "u1" }),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
				make_user_entry("Second question", { id: "u2" }),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/b.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.turns).toHaveLength(2);
			expect(result.turns[0].index).toBe(0);
			expect(result.turns[0].user_message_snippet).toContain("First");
			expect(result.turns[1].index).toBe(1);
			expect(result.turns[1].user_message_snippet).toContain("Second");
		});

		it("puts all events between user messages into the same turn", () => {
			const entries = [
				make_user_entry("Go"),
				make_assistant_entry([
					{ name: "Grep", arguments: { pattern: "foo" } },
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Edit", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.turns).toHaveLength(1);
			// user_message + 3 tool calls = 4 events
			expect(result.turns[0].event_ids).toHaveLength(4);
		});

		it("ignores entries before the first user message", () => {
			const entries = [
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/orphan.ts" } },
				]),
				make_user_entry("Start"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.turns).toHaveLength(1);
			// Only the user_message + read from after the user message
			expect(result.turns[0].event_ids).toHaveLength(2);
		});
	});

	// ── Event classification ─────────────────────────────────────────

	describe("event classification", () => {
		it("classifies bash discovery commands", () => {
			const entries = [
				make_user_entry("Find files"),
				make_assistant_entry([
					{ name: "Bash", arguments: { command: "rg 'pattern' src/" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const discovery = result.events.find(
				(e) => e.kind === "discovery_command",
			);
			expect(discovery).toBeDefined();
			expect(discovery?.label).toContain("Discovery");
		});

		it("classifies non-discovery bash as opaque_tool", () => {
			const entries = [
				make_user_entry("Build it"),
				make_assistant_entry([
					{ name: "bash", arguments: { command: "npm run build" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const opaque = result.events.find((e) => e.kind === "opaque_tool");
			expect(opaque).toBeDefined();
			expect(opaque?.label).toContain("Bash");
		});

		it("classifies Glob/Grep/Search/ListDir as discovery_command", () => {
			const entries = [
				make_user_entry("Search"),
				make_assistant_entry([
					{ name: "Glob", arguments: { pattern: "**/*.ts" } },
					{ name: "Grep", arguments: { pattern: "import" } },
					{ name: "Search", arguments: { pattern: "query" } },
					{ name: "ListDir", arguments: { path: "/project/src" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const discoveries = result.events.filter(
				(e) => e.kind === "discovery_command",
			);
			expect(discoveries).toHaveLength(4);
		});

		it("classifies doc reads by file extension", () => {
			const entries = [
				make_user_entry("Read docs"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/docs/README.md" } },
					{ name: "Read", arguments: { file_path: "/project/docs/guide.mdx" } },
					{ name: "Read", arguments: { file_path: "/project/notes.txt" } },
					{ name: "Read", arguments: { file_path: "/project/api.rst" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const doc_reads = result.events.filter((e) => e.kind === "doc_read");
			expect(doc_reads).toHaveLength(4);
		});

		it("classifies source file reads", () => {
			const entries = [
				make_user_entry("Read code"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/app.ts" } },
					{ name: "read", arguments: { path: "/project/src/util.js" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const file_reads = result.events.filter((e) => e.kind === "file_read");
			expect(file_reads).toHaveLength(2);
		});

		it("classifies edits and writes", () => {
			const entries = [
				make_user_entry("Edit"),
				make_assistant_entry([
					{ name: "Edit", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Write", arguments: { file_path: "/project/src/b.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.events.filter((e) => e.kind === "file_edit")).toHaveLength(
				1,
			);
			expect(result.events.filter((e) => e.kind === "file_write")).toHaveLength(
				1,
			);
		});

		it("classifies unknown tools as opaque_tool", () => {
			const entries = [
				make_user_entry("Use tool"),
				make_assistant_entry([
					{ name: "CustomTool", arguments: { data: "x" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const opaque = result.events.find((e) => e.kind === "opaque_tool");
			expect(opaque).toBeDefined();
			expect(opaque?.label).toContain("CustomTool");
		});

		it("classifies failed discovery tool results", () => {
			const entries = [
				make_user_entry("Search"),
				make_assistant_entry([{ name: "Grep", arguments: { pattern: "foo" } }]),
				make_tool_result_entry("Grep", true),
			];

			const result = derive_exploration("s1", entries, default_header);

			const failed = result.events.find((e) => e.kind === "failed_discovery");
			expect(failed).toBeDefined();
			expect(failed?.is_error).toBe(true);
		});

		it("does not create failed_discovery for non-error tool results", () => {
			const entries = [
				make_user_entry("Search"),
				make_assistant_entry([{ name: "Grep", arguments: { pattern: "foo" } }]),
				make_tool_result_entry("Grep", false),
			];

			const result = derive_exploration("s1", entries, default_header);

			const failed = result.events.find((e) => e.kind === "failed_discovery");
			expect(failed).toBeUndefined();
		});
	});

	// ── Artifact creation ────────────────────────────────────────────

	describe("artifact creation", () => {
		it("creates unique artifacts for file paths", () => {
			const entries = [
				make_user_entry("Work"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Edit", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/b.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const file_artifacts = result.artifacts.filter(
				(a) => a.kind === "source_file",
			);
			expect(file_artifacts).toHaveLength(2);
			expect(file_artifacts.every((a) => a.explored)).toBe(true);
		});

		it("distinguishes doc_file and source_file artifacts", () => {
			const entries = [
				make_user_entry("Read"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/README.md" } },
					{ name: "Read", arguments: { file_path: "/project/src/app.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const doc = result.artifacts.find((a) => a.kind === "doc_file");
			const src = result.artifacts.find((a) => a.kind === "source_file");
			expect(doc).toBeDefined();
			expect(doc?.path).toBe("README.md");
			expect(src).toBeDefined();
			expect(src?.path).toBe("src/app.ts");
		});

		it("creates discovery_query artifacts for discovery commands", () => {
			const entries = [
				make_user_entry("Find"),
				make_assistant_entry([
					{ name: "Grep", arguments: { pattern: "TODO" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const dq = result.artifacts.find((a) => a.kind === "discovery_query");
			expect(dq).toBeDefined();
			expect(dq?.path).toBe("TODO");
		});

		it("records first_seen_turn correctly", () => {
			const entries = [
				make_user_entry("Turn 0"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
				make_user_entry("Turn 1"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/b.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const art_a = result.artifacts.find((a) => a.path === "src/a.ts");
			const art_b = result.artifacts.find((a) => a.path === "src/b.ts");
			expect(art_a?.first_seen_turn).toBe(0);
			expect(art_b?.first_seen_turn).toBe(1);
		});
	});

	// ── Causal relations ─────────────────────────────────────────────

	describe("causal relations", () => {
		it("creates prompt_triggered from user_message to first tool event", () => {
			const entries = [
				make_user_entry("Do something"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const pt = result.relations.find((r) => r.kind === "prompt_triggered");
			expect(pt).toBeDefined();
			expect(pt?.evidence).toBe("explicit_session");
		});

		it("creates sequential_read between consecutive reads", () => {
			const entries = [
				make_user_entry("Read files"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/b.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/c.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const seq = result.relations.filter((r) => r.kind === "sequential_read");
			expect(seq).toHaveLength(2);
		});

		it("creates command_led_to_read from discovery to subsequent read", () => {
			const entries = [
				make_user_entry("Find and read"),
				make_assistant_entry([
					{ name: "Grep", arguments: { pattern: "handler" } },
					{ name: "Read", arguments: { file_path: "/project/src/handler.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const clr = result.relations.find(
				(r) => r.kind === "command_led_to_read",
			);
			expect(clr).toBeDefined();
		});

		it("creates read_preceded_edit within same turn", () => {
			const entries = [
				make_user_entry("Fix it"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
					{ name: "Edit", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const rpe = result.relations.find((r) => r.kind === "read_preceded_edit");
			expect(rpe).toBeDefined();
		});

		it("creates read_preceded_edit across adjacent turns", () => {
			const entries = [
				make_user_entry("Read it", {
					id: "u1",
					timestamp: "2025-06-01T10:00:00Z",
				}),
				make_assistant_entry(
					[
						{
							name: "Read",
							arguments: { file_path: "/project/src/a.ts" },
						},
					],
					{ id: "a1", timestamp: "2025-06-01T10:00:01Z" },
				),
				make_user_entry("Now edit", {
					id: "u2",
					timestamp: "2025-06-01T10:01:00Z",
				}),
				make_assistant_entry(
					[
						{
							name: "Edit",
							arguments: { file_path: "/project/src/a.ts" },
						},
					],
					{ id: "a2", timestamp: "2025-06-01T10:01:01Z" },
				),
			];

			const result = derive_exploration("s1", entries, default_header);

			const cross_rpe = result.relations.filter(
				(r) => r.kind === "read_preceded_edit",
			);
			expect(cross_rpe.length).toBeGreaterThanOrEqual(1);
		});

		it("creates doc_influenced_read within same turn", () => {
			const entries = [
				make_user_entry("Check docs"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/docs/guide.md" } },
					{ name: "Read", arguments: { file_path: "/project/src/handler.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			const dir = result.relations.find(
				(r) => r.kind === "doc_influenced_read",
			);
			expect(dir).toBeDefined();
		});

		it("creates user_followup_continued for short followup messages", () => {
			const entries = [
				make_user_entry("Implement the feature"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
				make_user_entry("yes"),
			];

			const result = derive_exploration("s1", entries, default_header);

			const ufc = result.relations.find(
				(r) => r.kind === "user_followup_continued",
			);
			expect(ufc).toBeDefined();
		});

		it("creates user_followup_continued for known followup phrases", () => {
			const phrases = [
				"ok",
				"sure",
				"go ahead",
				"looks good",
				"thanks",
				"actually wait",
			];

			for (const phrase of phrases) {
				const entries = [
					make_user_entry("Do the thing"),
					make_assistant_entry([
						{
							name: "Read",
							arguments: { file_path: "/project/src/a.ts" },
						},
					]),
					make_user_entry(phrase),
				];

				const result = derive_exploration("s1", entries, default_header);

				const ufc = result.relations.find(
					(r) => r.kind === "user_followup_continued",
				);
				expect(ufc).toBeDefined();
			}
		});
	});

	// ── Payload structure ────────────────────────────────────────────

	describe("payload structure", () => {
		it("includes session_id and project_path from header", () => {
			const entries = [make_user_entry("hi")];
			const result = derive_exploration("s1", entries, default_header);

			expect(result.session_id).toBe("s1");
			expect(result.project_path).toBe("/project");
		});

		it("sets has_repo_context to false", () => {
			const entries = [make_user_entry("hi")];
			const result = derive_exploration("s1", entries, default_header);

			expect(result.has_repo_context).toBe(false);
		});

		it("sets derived_at to a valid ISO timestamp", () => {
			const entries = [make_user_entry("hi")];
			const result = derive_exploration("s1", entries, default_header);

			expect(result.derived_at).toBeTruthy();
			expect(() => new Date(result.derived_at)).not.toThrow();
			expect(Number.isNaN(new Date(result.derived_at).getTime())).toBe(false);
		});

		it("generates deterministic event IDs", () => {
			const entries = [
				make_user_entry("Go"),
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.events[0].id).toBe("evt_0_0"); // user message
			expect(result.events[1].id).toBe("evt_0_1"); // read
		});
	});

	// ── Edge cases ───────────────────────────────────────────────────

	describe("edge cases", () => {
		it("handles empty session (no entries)", () => {
			const result = derive_exploration("s1", [], default_header);

			expect(result.turns).toHaveLength(0);
			expect(result.events).toHaveLength(0);
			expect(result.artifacts).toHaveLength(0);
			expect(result.relations).toHaveLength(0);
		});

		it("handles session with only user messages", () => {
			const entries = [make_user_entry("First"), make_user_entry("Second")];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.turns).toHaveLength(2);
			// Each turn has only its user_message event
			expect(result.events).toHaveLength(2);
			expect(result.events.every((e) => e.kind === "user_message")).toBe(true);
			expect(result.artifacts).toHaveLength(0);
		});

		it("handles null header gracefully", () => {
			const entries = [make_user_entry("hi")];
			const result = derive_exploration("s1", entries, null);

			expect(result.project_path).toBe("");
		});

		it("handles non-message entry types", () => {
			const entries: SessionEntry[] = [
				{
					type: "compaction",
					id: "c1",
					parentId: null,
					timestamp: "2025-06-01T10:00:00Z",
					summary: "compacted",
					firstKeptEntryId: "u1",
					tokensBefore: 100,
				},
				make_user_entry("Go"),
				{
					type: "session_info",
					id: "si1",
					parentId: null,
					timestamp: "2025-06-01T10:00:00Z",
					name: "test",
				},
				make_assistant_entry([
					{ name: "Read", arguments: { file_path: "/project/src/a.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.turns).toHaveLength(1);
			expect(result.events).toHaveLength(2);
		});

		it("handles tool calls with missing path arguments", () => {
			const entries = [
				make_user_entry("Read"),
				make_assistant_entry([
					{ name: "Read", arguments: {} }, // no path
					{ name: "Edit", arguments: {} }, // no path
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.events).toHaveLength(3); // user + 2 tools
			expect(result.artifacts).toHaveLength(0); // no artifacts without paths
		});

		it("handles both path and file_path argument names", () => {
			const entries = [
				make_user_entry("Read"),
				make_assistant_entry([
					{ name: "Read", arguments: { path: "/project/src/a.ts" } },
					{ name: "Read", arguments: { file_path: "/project/src/b.ts" } },
				]),
			];

			const result = derive_exploration("s1", entries, default_header);

			expect(result.artifacts).toHaveLength(2);
		});

		it("supports all discovery bash programs", () => {
			const programs = [
				"rg",
				"grep",
				"find",
				"ls",
				"cat",
				"head",
				"tail",
				"fd",
				"tree",
				"wc",
			];
			for (const prog of programs) {
				const entries = [
					make_user_entry("Search"),
					make_assistant_entry([
						{
							name: "bash",
							arguments: { command: `${prog} something` },
						},
					]),
				];

				const result = derive_exploration("s1", entries, default_header);
				const discovery = result.events.find(
					(e) => e.kind === "discovery_command",
				);
				expect(discovery).toBeDefined();
			}
		});
	});
});

// ── Canonical artifact ID tests ──────────────────────────────────────────────

describe("canonical artifact IDs", () => {
	it("dynamic and static derivation produce the same ID for the same file", () => {
		// Dynamic: derive_exploration uses absolute path + project_path
		const entries = [
			make_user_entry("Read"),
			make_assistant_entry([
				{ name: "Read", arguments: { file_path: "/project/src/app.ts" } },
			]),
		];
		const result = derive_exploration("s1", entries, default_header);

		const dynamic_artifact = result.artifacts.find(
			(a) => a.kind === "source_file",
		);
		expect(dynamic_artifact).toBeDefined();

		// Static: make_artifact_id with relative path (as repo-context would)
		const static_id = make_artifact_id("src/app.ts");

		expect(dynamic_artifact?.id).toBe(static_id);
	});

	it("derive_exploration stores relative paths in artifact.path", () => {
		const entries = [
			make_user_entry("Read"),
			make_assistant_entry([
				{
					name: "Read",
					arguments: { file_path: "/project/src/deep/file.tsx" },
				},
			]),
		];
		const result = derive_exploration("s1", entries, default_header);

		const art = result.artifacts.find((a) => a.kind === "source_file");
		expect(art?.path).toBe("src/deep/file.tsx");
		expect(art?.id).toBe("art_src/deep/file.tsx");
	});

	it("shared make_artifact_id produces consistent IDs regardless of absolute/relative input", () => {
		const from_relative = make_artifact_id("src/app.ts");
		const from_absolute = make_artifact_id("/project/src/app.ts", "/project");

		expect(from_relative).toBe(from_absolute);
		expect(from_relative).toBe("art_src/app.ts");
	});
});

// ── Cache tests ──────────────────────────────────────────────────────────────

describe("exploration cache", () => {
	beforeEach(() => {
		clear_cache();
	});

	it("returns null for uncached sessions", () => {
		expect(get_cached("nonexistent")).toBeNull();
	});

	it("stores and retrieves cached payloads", () => {
		const payload: ExplorationPayload = {
			session_id: "s1",
			project_path: "/p",
			turns: [],
			events: [],
			artifacts: [],
			relations: [],
			has_repo_context: false,
			derived_at: "2025-06-01T10:00:00Z",
		};

		set_cached("s1", payload);
		const retrieved = get_cached("s1");
		expect(retrieved).toEqual(payload);
	});

	it("cached dynamic payload is not mutated by external merge", () => {
		const payload: ExplorationPayload = {
			session_id: "s1",
			project_path: "/p",
			turns: [],
			events: [],
			artifacts: [
				{
					id: "art_src/a.ts",
					kind: "source_file",
					path: "src/a.ts",
					label: "a.ts",
					parent_id: null,
					explored: true,
					first_seen_turn: 0,
				},
			],
			relations: [],
			has_repo_context: false,
			derived_at: "2025-06-01T10:00:00Z",
		};

		set_cached("s1", payload);

		// Simulate what commands.ts does: clone then merge
		const cached = get_cached("s1");
		expect(cached).not.toBeNull();
		const clone = {
			...cached,
			artifacts: [...(cached?.artifacts ?? [])],
			relations: [...(cached?.relations ?? [])],
		};
		clone.artifacts.push({
			id: "art_src/b.ts",
			kind: "source_file",
			path: "src/b.ts",
			label: "b.ts",
			parent_id: null,
			explored: false,
			first_seen_turn: null,
		});

		// Original cache must be unchanged
		const original = get_cached("s1");
		expect(original?.artifacts).toHaveLength(1);
		expect(clone.artifacts).toHaveLength(2);
	});

	it("clears all cached entries", () => {
		const payload: ExplorationPayload = {
			session_id: "s1",
			project_path: "/p",
			turns: [],
			events: [],
			artifacts: [],
			relations: [],
			has_repo_context: false,
			derived_at: "2025-06-01T10:00:00Z",
		};

		set_cached("s1", payload);
		set_cached("s2", payload);
		clear_cache();

		expect(get_cached("s1")).toBeNull();
		expect(get_cached("s2")).toBeNull();
	});
});
