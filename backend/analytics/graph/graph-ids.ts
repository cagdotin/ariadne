/**
 * Canonical graph node ID and path normalization.
 *
 * All graph modules must use these helpers to generate node IDs.
 * This prevents identity drift between replay derivation and repo augmentation.
 */

import * as path from "node:path";

/**
 * Normalize a file path to a project-relative form.
 * Handles both absolute and already-relative paths.
 */
export function normalize_graph_path(
	file_path: string,
	project_root: string,
): string {
	if (project_root && path.isAbsolute(file_path)) {
		return path.relative(project_root, file_path);
	}
	return file_path;
}

/**
 * Sanitize a relative path into a stable ID fragment.
 * Preserves alphanumerics, dots, hyphens, underscores; replaces everything
 * else (including path separators) with underscores, then collapses runs.
 */
function sanitize_path_for_id(relative_path: string): string {
	return relative_path
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_");
}

/**
 * Generate the canonical graph node ID for a file or document.
 * Both replay derivation and ambient augmentation must use this function.
 */
export function make_file_node_id(
	file_path: string,
	project_root: string,
): string {
	const relative = normalize_graph_path(file_path, project_root);
	return `file_${sanitize_path_for_id(relative)}`;
}

/**
 * Generate a canonical graph node ID for a framing/runtime context node.
 */
export function make_framing_node_id(
	prefix: string,
	entry_id: string,
): string {
	return `framing_${prefix}_${entry_id}`;
}
