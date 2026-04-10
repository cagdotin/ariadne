import { z } from "zod";

// ─── Session replay entry contract ──────────────────────────────────────────
//
// Strict discriminated-union schema for known replay entry types.
// Unknown entry types still pass through for forward compatibility.
//
// The full component-level type hierarchy lives in:
//   src/components/session-viewer/types.ts

// ─── Session header ─────────────────────────────────────────────────────────

export const session_header_schema = z
	.object({
		type: z.literal("session"),
		version: z.number().optional(),
		id: z.string(),
		timestamp: z.string(),
		cwd: z.string(),
		parent_session: z.string().optional(),
	})
	.passthrough();
export type SessionHeader = z.infer<typeof session_header_schema>;

// ─── Content blocks ─────────────────────────────────────────────────────────

const text_content_schema = z.object({
	type: z.literal("text"),
	text: z.string(),
});

const image_content_schema = z.object({
	type: z.literal("image"),
	data: z.string(),
	mimeType: z.string(),
});

const thinking_content_schema = z.object({
	type: z.literal("thinking"),
	thinking: z.string(),
});

const tool_call_content_schema = z.object({
	type: z.literal("toolCall"),
	id: z.string(),
	name: z.string(),
	arguments: z.record(z.string(), z.unknown()),
});

const content_block_schema = z.union([
	text_content_schema,
	image_content_schema,
	thinking_content_schema,
	tool_call_content_schema,
]);

// ─── Message shapes ─────────────────────────────────────────────────────────

const cost_schema = z.object({
	input: z.number().optional(),
	output: z.number().optional(),
	cacheRead: z.number().optional(),
	cacheWrite: z.number().optional(),
	total: z.number().optional(),
});

const usage_schema = z.object({
	input: z.number().optional(),
	output: z.number().optional(),
	cacheRead: z.number().optional(),
	cacheWrite: z.number().optional(),
	totalTokens: z.number().optional(),
	cost: cost_schema.optional(),
});

const user_message_schema = z.object({
	role: z.literal("user"),
	content: z.union([z.string(), z.array(content_block_schema)]),
	timestamp: z.number().optional(),
});

const assistant_message_schema = z.object({
	role: z.literal("assistant"),
	content: z.array(content_block_schema),
	model: z.string().optional(),
	provider: z.string().optional(),
	stopReason: z.string().optional(),
	errorMessage: z.string().optional(),
	usage: usage_schema.optional(),
});

const tool_result_message_schema = z.object({
	role: z.literal("toolResult"),
	toolCallId: z.string(),
	toolName: z.string().optional(),
	content: z.array(content_block_schema),
	details: z.record(z.string(), z.unknown()).optional(),
	isError: z.boolean().optional(),
});

const bash_execution_message_schema = z.object({
	role: z.literal("bashExecution"),
	command: z.string(),
	output: z.string(),
	exitCode: z.number().optional(),
	cancelled: z.boolean(),
	truncated: z.boolean(),
	fullOutputPath: z.string().optional(),
	timestamp: z.number(),
	excludeFromContext: z.boolean().optional(),
});

const custom_role_message_schema = z.object({
	role: z.literal("custom"),
	customType: z.string(),
	content: z.union([z.string(), z.array(content_block_schema)]),
	display: z.boolean(),
	details: z.unknown().optional(),
	timestamp: z.number(),
});

const message_data_schema = z.union([
	user_message_schema,
	assistant_message_schema,
	tool_result_message_schema,
	bash_execution_message_schema,
	custom_role_message_schema,
]);

// ─── Entry base fields ──────────────────────────────────────────────────────

const entry_base = {
	id: z.string(),
	parentId: z.string().nullable(),
	timestamp: z.string(),
};

// ─── Known entry type schemas ───────────────────────────────────────────────
// Each uses .passthrough() to preserve extra fields the viewer may inspect
// via the EntryBase index signature.

const message_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("message"),
		message: message_data_schema,
	})
	.passthrough();

const thinking_level_change_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("thinking_level_change"),
		thinkingLevel: z.string(),
	})
	.passthrough();

const model_change_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("model_change"),
		provider: z.string(),
		modelId: z.string(),
	})
	.passthrough();

const compaction_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("compaction"),
		summary: z.string(),
		firstKeptEntryId: z.string(),
		tokensBefore: z.number(),
		details: z.unknown().optional(),
		fromHook: z.boolean().optional(),
	})
	.passthrough();

const branch_summary_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("branch_summary"),
		fromId: z.string(),
		summary: z.string(),
		details: z.unknown().optional(),
		fromHook: z.boolean().optional(),
	})
	.passthrough();

const custom_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("custom"),
		customType: z.string(),
		data: z.unknown().optional(),
	})
	.passthrough();

const custom_message_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("custom_message"),
		customType: z.string(),
		content: z.union([z.string(), z.array(content_block_schema)]),
		details: z.unknown().optional(),
		display: z.boolean(),
	})
	.passthrough();

const label_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("label"),
		targetId: z.string(),
		label: z.string().optional(),
	})
	.passthrough();

const session_info_entry_schema = z
	.object({
		...entry_base,
		type: z.literal("session_info"),
		name: z.string().optional(),
	})
	.passthrough();

// ─── Fallback for unknown/future entry types ────────────────────────────────
// Accepts any entry that has the base fields but a type we don't recognize.
// This preserves forward compatibility for new entry types added upstream.

const unknown_entry_schema = z
	.object({
		...entry_base,
		type: z.string(),
	})
	.passthrough();

// ─── Discriminated union with fallback ──────────────────────────────────────
// Known entry schemas are listed first so Zod tries them before falling back
// to the permissive unknown_entry_schema.

export const session_entry_schema = z.union([
	message_entry_schema,
	thinking_level_change_entry_schema,
	model_change_entry_schema,
	compaction_entry_schema,
	branch_summary_entry_schema,
	custom_entry_schema,
	custom_message_entry_schema,
	label_entry_schema,
	session_info_entry_schema,
	unknown_entry_schema,
]);
export type SessionEntry = z.infer<typeof session_entry_schema>;

// ─── Replay response ────────────────────────────────────────────────────────

export const session_entries_response_schema = z.object({
	header: session_header_schema.nullable(),
	entries: z.array(session_entry_schema),
	leaf_id: z.string().nullable(),
});
export type SessionEntriesResponse = z.infer<
	typeof session_entries_response_schema
>;
