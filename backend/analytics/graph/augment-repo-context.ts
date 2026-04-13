/**
 * Ambient repo context augmentation for session graphs.
 *
 * Inspects the current project tree to identify ambient instruction sources
 * (e.g. AGENTS.md files) and adds them to the graph with appropriate
 * provenance (available_ambient, not observed).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type {
	GraphEdge,
	GraphNode,
	SessionGraphPayload,
} from "../../../contracts/graph/types.js";
import { make_file_node_id } from "./graph-ids.js";

// Files that commonly serve as ambient instruction sources.
const INSTRUCTION_FILES = [
	"AGENTS.md",
	"CLAUDE.md",
	"CURSOR.md",
	".cursorrules",
	"COPILOT.md",
	"CODEOWNERS",
];

const IGNORE_DIRS = new Set([
	"node_modules", ".git", "dist", "build", "coverage",
	".next", "vendor", ".turbo", ".cache",
]);

// Hidden directories that may contain ambient instruction sources.
const ALLOWED_HIDDEN_DIRS = new Set([".github"]);

/**
 * Augment the graph with ambient repo instruction sources.
 * Mutates the payload in place.
 */
export function augment_repo_context(
	payload: SessionGraphPayload,
): void {
	if (!payload.project_path) return;

	const node_ids = new Set(payload.nodes.map((n) => n.id));
	const framing_id = `framing_${payload.session_id}`;

	// Only proceed if framing node exists
	if (!node_ids.has(framing_id)) return;

	try {
		const instruction_files = find_instruction_files(payload.project_path);

		for (const abs_path of instruction_files) {
			const relative = path.relative(payload.project_path, abs_path);
			const file_id = make_file_node_id(abs_path, payload.project_path);
			const base = path.basename(abs_path);

			// Skip if this file already exists in the graph (observed)
			if (node_ids.has(file_id)) continue;

			const is_agents = base.toUpperCase() === "AGENTS.MD";
			const node_kind = is_agents ? "agents_doc" : "instruction_source";
			const label_suffix = is_agents
				? "AGENTS.md (ambient, not read in session)"
				: `${base} (ambient instruction source)`;

			const node: GraphNode = {
				id: file_id,
				kind: node_kind,
				label: label_suffix,
				availability: "available_ambient",
				confidence: "medium",
				evidence: [{
					kind: "ambient_repo_context",
					source_ref: relative,
					detail: `found in project tree at ${relative}`,
				}],
				metadata: { path: relative },
			};

			payload.nodes.push(node);
			node_ids.add(file_id);

			const edge: GraphEdge = {
				source_id: framing_id,
				target_id: file_id,
				kind: "constrained_by",
				availability: "available_ambient",
				confidence: "medium",
				evidence: [{
					kind: "ambient_repo_context",
					source_ref: relative,
					detail: `${base} exists in project tree but was not explicitly read in session`,
				}],
				label: "ambient",
			};

			payload.edges.push(edge);
		}

		payload.has_repo_context = true;
	} catch {
		// If repo scan fails, leave has_repo_context as false.
		// The replay-observed graph is still valid.
	}
}

/**
 * Find instruction files in the project tree (shallow, max depth 3).
 */
function find_instruction_files(root: string, max_depth = 3): string[] {
	const results: string[] = [];
	scan_dir(root, 0, max_depth, results);
	return results;
}

function scan_dir(
	dir: string,
	depth: number,
	max_depth: number,
	results: string[],
): void {
	if (depth > max_depth) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			const is_hidden = entry.name.startsWith(".");
			const should_skip = IGNORE_DIRS.has(entry.name) ||
				(is_hidden && !ALLOWED_HIDDEN_DIRS.has(entry.name));
			if (!should_skip) {
				scan_dir(path.join(dir, entry.name), depth + 1, max_depth, results);
			}
			continue;
		}

		if (entry.isFile() && INSTRUCTION_FILES.includes(entry.name)) {
			results.push(path.join(dir, entry.name));
		}
	}
}
