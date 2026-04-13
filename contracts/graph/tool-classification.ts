/**
 * Shared tool classification utilities for the graph subsystem.
 *
 * Centralizes the rules for categorizing agent tools so that
 * derivation, adapters, and view models all agree.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Tools whose primary purpose is codebase discovery / search. */
export const DISCOVERY_TOOLS = new Set([
	"Glob",
	"Grep",
	"Search",
	"ListDir",
]);

/** CLI programs that count as discovery when invoked via Bash. */
export const DISCOVERY_PROGRAMS = new Set([
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
]);

/** File extensions treated as documentation rather than source code. */
export const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);

// ── Classification types ─────────────────────────────────────────────────────

export type ToolCategory =
	| "search"
	| "read"
	| "doc_read"
	| "edit"
	| "write"
	| "opaque";

// ── Classification functions ─────────────────────────────────────────────────

/**
 * Check whether a tool name (+ optional bash command) represents a
 * discovery/search action.
 */
export function is_discovery_tool(
	tool_name: string,
	bash_command?: string,
): boolean {
	if (DISCOVERY_TOOLS.has(tool_name)) return true;
	if (
		(tool_name === "bash" || tool_name === "Bash") &&
		typeof bash_command === "string"
	) {
		const first_word = bash_command.trim().split(/\s+/)[0] ?? "";
		return DISCOVERY_PROGRAMS.has(first_word);
	}
	return false;
}

/**
 * Check whether a file path refers to a documentation file.
 */
export function is_doc_path(file_path: string): boolean {
	const dot = file_path.lastIndexOf(".");
	if (dot === -1) return false;
	return DOC_EXTENSIONS.has(file_path.slice(dot).toLowerCase());
}

/**
 * Classify a tool invocation into a category.
 *
 * Works at the "raw" level (tool name + arguments) used during
 * graph derivation, and also at the "node" level (tool_name from
 * metadata) used in adapters and view models.
 */
export function classify_tool_action(
	tool_name: string,
	file_path?: string | null,
	bash_command?: string,
): ToolCategory {
	if (is_discovery_tool(tool_name, bash_command)) return "search";

	const name_lower = tool_name.toLowerCase();

	if (name_lower === "read") {
		return file_path && is_doc_path(file_path) ? "doc_read" : "read";
	}
	if (name_lower === "edit") return "edit";
	if (name_lower === "write") return "write";

	return "opaque";
}
