import { z } from "zod";

// ─── Availability state ─────────────────────────────────────────────────────
// How truthfully we can represent a piece of context.

export const availability_state_schema = z.enum([
	"available_observed", // explicit in replay data
	"available_ambient", // reconstructed from known runtime/repo context, not explicitly read
	"derived_inferred", // inferred from strong sequencing/structure
	"unavailable", // not present in logs and not reconstructable
	"unknown", // theoretically possible but not currently determinable
]);
export type AvailabilityState = z.infer<typeof availability_state_schema>;

// ─── Confidence ──────────────────────────────────────────────────────────────

export const confidence_schema = z.enum([
	"high", // directly observed or structurally certain
	"medium", // strong inference from ordering/structure
	"low", // weak heuristic, should be visually distinguished
]);
export type Confidence = z.infer<typeof confidence_schema>;

// ─── Evidence kinds ──────────────────────────────────────────────────────────
// Why a graph assertion exists.

export const graph_evidence_kind_schema = z.enum([
	"observed_replay", // directly present in replay entries
	"observed_tool_args", // extracted from tool call arguments
	"observed_custom_message", // derived from runtime custom messages
	"parsed_markdown_link", // derived from markdown link structure
	"parsed_import", // derived from code import structure
	"ambient_repo_context", // current-tree context that plausibly framed the session
	"inferred_temporal", // inferred from replay order/turn structure
	"heuristic", // weaker signal, used sparingly
]);
export type GraphEvidenceKind = z.infer<typeof graph_evidence_kind_schema>;

// ─── Evidence record ─────────────────────────────────────────────────────────
// Points back to a source reference.

export const graph_evidence_schema = z.object({
	kind: graph_evidence_kind_schema,
	source_ref: z.string().nullable(), // replay entry id, file path, tool call id, etc.
	detail: z.string().nullable(), // human-readable explanation
});
export type GraphEvidence = z.infer<typeof graph_evidence_schema>;

// ─── Node kinds ──────────────────────────────────────────────────────────────

export const graph_node_kind_schema = z.enum([
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
]);
export type GraphNodeKind = z.infer<typeof graph_node_kind_schema>;

// ─── Graph node ──────────────────────────────────────────────────────────────

export const graph_node_schema = z.object({
	id: z.string(),
	kind: graph_node_kind_schema,
	label: z.string(),
	availability: availability_state_schema,
	confidence: confidence_schema,
	evidence: z.array(graph_evidence_schema),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type GraphNode = z.infer<typeof graph_node_schema>;

// ─── Edge kinds ──────────────────────────────────────────────────────────────

export const graph_edge_kind_schema = z.enum([
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
]);
export type GraphEdgeKind = z.infer<typeof graph_edge_kind_schema>;

// ─── Graph edge ──────────────────────────────────────────────────────────────

export const graph_edge_schema = z.object({
	source_id: z.string(),
	target_id: z.string(),
	kind: graph_edge_kind_schema,
	availability: availability_state_schema,
	confidence: confidence_schema,
	evidence: z.array(graph_evidence_schema),
	label: z.string().nullable(),
});
export type GraphEdge = z.infer<typeof graph_edge_schema>;

// ─── Session graph payload ───────────────────────────────────────────────────
// The cohesive graph response for a session.

export const session_graph_payload_schema = z.object({
	session_id: z.string(),
	project_path: z.string(),
	nodes: z.array(graph_node_schema),
	edges: z.array(graph_edge_schema),
	has_repo_context: z.boolean(),
	derived_at: z.string(),
});
export type SessionGraphPayload = z.infer<typeof session_graph_payload_schema>;
