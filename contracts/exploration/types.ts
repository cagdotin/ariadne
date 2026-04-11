import { z } from "zod";

// ─── Evidence classes ───────────────────────────────────────────────────────
// Each derived edge or node carries provenance so the UI can explain why it exists.

export const evidence_class_schema = z.enum([
	"explicit_session", // directly present in session replay
	"explicit_doc", // markdown link, wikilink, heading containment, explicit path mention
	"structural_code", // reliable file-level import/dependency link
	"sequencing_inference", // event ordering strongly suggests causality
	"adjacency_only", // structurally nearby, not actually explored
]);
export type EvidenceClass = z.infer<typeof evidence_class_schema>;

// ─── Artifact types ─────────────────────────────────────────────────────────
// A repo object that can be explored or related.

export const artifact_kind_schema = z.enum([
	"source_file",
	"doc_file",
	"doc_section",
	"discovery_query",
]);
export type ArtifactKind = z.infer<typeof artifact_kind_schema>;

export const exploration_artifact_schema = z.object({
	id: z.string(),
	kind: artifact_kind_schema,
	path: z.string(), // file path relative to project root, or discovery query text
	label: z.string(), // display label (file name, section heading, command snippet)
	parent_id: z.string().nullable(), // e.g. doc_file for doc_section
	explored: z.boolean(), // true if touched during session, false if neighbor-only
	first_seen_turn: z.number().nullable(), // turn index when first explored
});
export type ExplorationArtifact = z.infer<typeof exploration_artifact_schema>;

// ─── Event types ────────────────────────────────────────────────────────────
// A time-ordered action or observation derived from replay data.

export const exploration_event_kind_schema = z.enum([
	"user_message",
	"turn_boundary",
	"discovery_command",
	"file_read",
	"file_edit",
	"file_write",
	"doc_read",
	"opaque_tool",
	"failed_discovery",
]);
export type ExplorationEventKind = z.infer<
	typeof exploration_event_kind_schema
>;

export const exploration_event_schema = z.object({
	id: z.string(),
	kind: exploration_event_kind_schema,
	turn_index: z.number(),
	timestamp: z.string(),
	label: z.string(), // human-readable summary
	artifact_id: z.string().nullable(), // related artifact, if any
	entry_id: z.string().nullable(), // reference to original session entry id
	detail: z.string().nullable(), // command text, file path, message snippet
	is_error: z.boolean(),
});
export type ExplorationEvent = z.infer<typeof exploration_event_schema>;

// ─── Relation types ─────────────────────────────────────────────────────────
// Typed edges connecting events, turns, and artifacts.

export const relation_kind_schema = z.enum([
	// dynamic
	"prompt_triggered",
	"command_led_to_read",
	"read_preceded_edit",
	"doc_influenced_read",
	"sequential_read",
	"user_followup_continued",
	// static
	"doc_links_doc",
	"doc_references_file",
	"file_imports_file",
	"section_belongs_to_doc",
	// contextual
	"adjacent_unexplored",
]);
export type RelationKind = z.infer<typeof relation_kind_schema>;

export const exploration_relation_schema = z.object({
	source_id: z.string(), // event or artifact id
	target_id: z.string(), // event or artifact id
	kind: relation_kind_schema,
	evidence: evidence_class_schema,
	label: z.string().nullable(), // optional edge label for UI
});
export type ExplorationRelation = z.infer<typeof exploration_relation_schema>;

// ─── Turn ───────────────────────────────────────────────────────────────────
// A conversation turn is the primary attribution unit.

export const exploration_turn_schema = z.object({
	index: z.number(),
	user_message_snippet: z.string(), // truncated user message
	event_ids: z.array(z.string()), // events in this turn
	artifact_ids: z.array(z.string()), // artifacts explored in this turn
	timestamp: z.string(), // timestamp of user message
	entry_id: z.string().nullable(), // original user message entry id
});
export type ExplorationTurn = z.infer<typeof exploration_turn_schema>;

// ─── Full exploration payload ───────────────────────────────────────────────
// The cohesive response returned by the backend for a session.

export const exploration_payload_schema = z.object({
	session_id: z.string(),
	project_path: z.string(),
	turns: z.array(exploration_turn_schema),
	events: z.array(exploration_event_schema),
	artifacts: z.array(exploration_artifact_schema),
	relations: z.array(exploration_relation_schema),
	has_repo_context: z.boolean(), // false if static graph derivation failed
	derived_at: z.string(), // ISO timestamp of when this was derived
});
export type ExplorationPayload = z.infer<typeof exploration_payload_schema>;
