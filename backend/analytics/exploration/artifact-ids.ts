/**
 * Shared artifact-ID normalization used by both dynamic (replay-derived)
 * and static (repo-context) exploration layers.
 *
 * Invariant: one file/doc path → one canonical artifact ID, regardless
 * of which layer first encounters the path.
 */

import * as path from "node:path";

// ── Sanitization ────────────────────────────────────────────────────────────

/**
 * Sanitize a relative path for use inside an artifact ID.
 * Preserves `/`, `-`, `.`, and `_`; replaces everything else with `_`;
 * collapses runs of underscores.
 */
function sanitize_for_id(relative_path: string): string {
	return relative_path.replace(/[^a-zA-Z0-9_\-./]/g, "_").replace(/_+/g, "_");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a canonical artifact ID from a file path.
 *
 * @param file_path  Absolute or project-relative path.
 * @param project_root  If provided, `file_path` is made relative to this root
 *                      before ID generation. When omitted the path is used as-is
 *                      (caller must ensure it is already relative).
 */
export function make_artifact_id(
	file_path: string,
	project_root?: string,
): string {
	const relative =
		project_root && path.isAbsolute(file_path)
			? path.relative(project_root, file_path)
			: file_path;
	return `art_${sanitize_for_id(relative)}`;
}

/**
 * Build a canonical section artifact ID (doc heading).
 */
export function make_section_id(
	doc_path: string,
	heading: string,
	project_root?: string,
): string {
	const relative =
		project_root && path.isAbsolute(doc_path)
			? path.relative(project_root, doc_path)
			: doc_path;
	return `art_${sanitize_for_id(relative)}#${sanitize_for_id(heading)}`;
}

/**
 * Build a discovery-query artifact ID (not path-based).
 */
export function make_discovery_artifact_id(
	turn_index: number,
	event_index: number,
): string {
	return `art_dq_${turn_index}_${event_index}`;
}
