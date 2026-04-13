import * as fs from "node:fs";
import * as path from "node:path";
import type {
	ExplorationArtifact,
	ExplorationRelation,
} from "../../../contracts/exploration/types.js";
import { make_artifact_id, make_section_id } from "./artifact-ids.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepoContextResult {
	artifacts: ExplorationArtifact[];
	relations: ExplorationRelation[];
	success: boolean;
}

/** Injectable filesystem operations for testing. */
export interface FsOps {
	stat_sync(p: string): { is_directory(): boolean; is_file(): boolean };
	readdir_sync(p: string): Array<{ name: string; is_directory(): boolean; is_file(): boolean }>;
	read_file_sync(p: string): string;
}

const real_fs: FsOps = {
	stat_sync(p: string) {
		const s = fs.statSync(p);
		return { is_directory: () => s.isDirectory(), is_file: () => s.isFile() };
	},
	readdir_sync(p: string) {
		const entries = fs.readdirSync(p, { withFileTypes: true });
		return entries.map((e) => ({
			name: e.name,
			is_directory: () => e.isDirectory(),
			is_file: () => e.isFile(),
		}));
	},
	read_file_sync(p: string) {
		return fs.readFileSync(p, "utf-8");
	},
};

// ─── Constants ──────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	".next",
	"vendor",
	".turbo",
	".cache",
]);

const MAX_DEPTH = 5;

// ─── Helpers ────────────────────────────────────────────────────────────────

function scan_markdown_files(
	dir: string,
	project_root: string,
	depth: number,
	fs_ops: FsOps,
): string[] {
	if (depth > MAX_DEPTH) return [];

	let entries: Array<{ name: string; is_directory(): boolean; is_file(): boolean }>;
	try {
		entries = fs_ops.readdir_sync(dir);
	} catch {
		return [];
	}

	const results: string[] = [];

	for (const entry of entries) {
		if (entry.is_directory()) {
			if (IGNORED_DIRS.has(entry.name)) continue;
			results.push(
				...scan_markdown_files(
					path.join(dir, entry.name),
					project_root,
					depth + 1,
					fs_ops,
				),
			);
		} else if (
			entry.is_file() &&
			(entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
		) {
			results.push(path.join(dir, entry.name));
		}
	}

	return results;
}

// ─── Markdown parsing ───────────────────────────────────────────────────────

interface DocParseResult {
	markdown_links: string[]; // resolved absolute paths
	wikilinks: string[]; // resolved absolute paths
	headings: Array<{ level: number; text: string }>;
	path_references: string[]; // resolved absolute paths
}

function parse_markdown(
	content: string,
	doc_dir: string,
	project_root: string,
): DocParseResult {
	const markdown_links: string[] = [];
	const wikilinks: string[] = [];
	const headings: Array<{ level: number; text: string }> = [];
	const path_references: string[] = [];

	const lines = content.split("\n");

	for (const line of lines) {
		// Headings
		const heading_match = line.match(/^(#{1,6})\s+(.+)$/);
		if (heading_match) {
			headings.push({
				level: heading_match[1].length,
				text: heading_match[2].trim(),
			});
		}

		// Markdown links: [text](path) — skip URLs, anchors, and images
		const md_link_re = /\[([^\]]*)\]\(([^)]+)\)/g;
		for (const md_match of line.matchAll(md_link_re)) {
			const link_target = md_match[2].split("#")[0].trim(); // strip anchors
			if (
				!link_target ||
				link_target.startsWith("http://") ||
				link_target.startsWith("https://") ||
				link_target.startsWith("mailto:")
			) {
				continue;
			}
			const resolved = path.resolve(doc_dir, link_target);
			markdown_links.push(resolved);
		}

		// Wikilinks: [[filename]] or [[path/to/file]]
		const wiki_re = /\[\[([^\]]+)\]\]/g;
		for (const wiki_match of line.matchAll(wiki_re)) {
			const target = wiki_match[1].split("|")[0].trim(); // strip display text
			const resolved = path.resolve(project_root, target);
			wikilinks.push(resolved);
		}

		// Backtick-quoted file path references: `some/path.ext`
		const backtick_re = /`([^`]+)`/g;
		for (const bt_match of line.matchAll(backtick_re)) {
			const candidate = bt_match[1].trim();
			// Must look like a file path: has extension, contains slash or looks like a relative path
			if (
				/\.[a-zA-Z]{1,5}$/.test(candidate) &&
				/[/\\]/.test(candidate) &&
				!candidate.includes(" ") &&
				!candidate.startsWith("http")
			) {
				const resolved = path.resolve(project_root, candidate);
				path_references.push(resolved);
			}
		}
	}

	return { markdown_links, wikilinks, headings, path_references };
}

// ─── Import parsing ─────────────────────────────────────────────────────────

function parse_imports(
	content: string,
	file_dir: string,
	_project_root: string,
	fs_ops: FsOps,
): string[] {
	const imports: string[] = [];
	const lines = content.split("\n");

	for (const line of lines) {
		// ES import: import ... from 'path' or import ... from "path"
		const es_match = line.match(
			/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/,
		);
		if (es_match) {
			const specifier = es_match[1];
			const resolved = resolve_import(specifier, file_dir, fs_ops);
			if (resolved) imports.push(resolved);
			continue;
		}

		// Side-effect import: import 'path'
		const side_effect_match = line.match(/import\s+['"]([^'"]+)['"]/);
		if (side_effect_match) {
			const specifier = side_effect_match[1];
			const resolved = resolve_import(specifier, file_dir, fs_ops);
			if (resolved) imports.push(resolved);
			continue;
		}

		// CommonJS require: require('path')
		const require_match = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
		if (require_match) {
			const specifier = require_match[1];
			const resolved = resolve_import(specifier, file_dir, fs_ops);
			if (resolved) imports.push(resolved);
		}
	}

	return imports;
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function file_exists(file_path: string, fs_ops: FsOps): boolean {
	try {
		return fs_ops.stat_sync(file_path).is_file();
	} catch {
		return false;
	}
}

function resolve_import(
	specifier: string,
	file_dir: string,
	fs_ops: FsOps,
): string | null {
	// Skip bare module specifiers (npm packages)
	if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
		return null;
	}

	const resolved = path.resolve(file_dir, specifier);

	// If already has a source extension, check existence
	if (SOURCE_EXTENSIONS.some((ext) => resolved.endsWith(ext))) {
		if (file_exists(resolved, fs_ops)) return resolved;
		// Try .js → .ts mapping (common TypeScript pattern)
		if (resolved.endsWith(".js")) {
			const ts_candidate = `${resolved.slice(0, -3)}.ts`;
			if (file_exists(ts_candidate, fs_ops)) return ts_candidate;
			const tsx_candidate = `${resolved.slice(0, -3)}.tsx`;
			if (file_exists(tsx_candidate, fs_ops)) return tsx_candidate;
		}
		return null;
	}

	// Try adding common extensions — return the first that exists
	for (const ext of SOURCE_EXTENSIONS) {
		const candidate = `${resolved}${ext}`;
		if (file_exists(candidate, fs_ops)) return candidate;
	}

	// Fallback: treat as directory with index file
	for (const ext of SOURCE_EXTENSIONS) {
		const candidate = `${resolved}/index${ext}`;
		if (file_exists(candidate, fs_ops)) return candidate;
	}

	return null;
}

// ─── Main builder ───────────────────────────────────────────────────────────

export async function build_repo_context(
	project_root: string,
	explored_paths: string[],
	fs_ops: FsOps = real_fs,
): Promise<RepoContextResult> {
	// Validate project root exists
	try {
		const stat = fs_ops.stat_sync(project_root);
		if (!stat.is_directory()) {
			return { artifacts: [], relations: [], success: false };
		}
	} catch {
		return { artifacts: [], relations: [], success: false };
	}

	const artifacts_map = new Map<string, ExplorationArtifact>();
	const relations: ExplorationRelation[] = [];

	// Normalize explored paths to absolute
	const explored_abs = new Set(
		explored_paths.map((p) => path.resolve(project_root, p)),
	);

	// Helper to get or create artifact
	const ensure_artifact = (
		abs_path: string,
		kind: "source_file" | "doc_file",
		explored: boolean,
	): string => {
		const rel = path.relative(project_root, abs_path);
		const id = make_artifact_id(rel);
		if (!artifacts_map.has(id)) {
			artifacts_map.set(id, {
				id,
				kind,
				path: rel,
				label: path.basename(abs_path),
				parent_id: null,
				explored,
				first_seen_turn: null,
			});
		}
		return id;
	};

	// ── Step 1: Scan markdown docs ──────────────────────────────────────

	const md_files = scan_markdown_files(project_root, project_root, 0, fs_ops);
	const doc_parse_results = new Map<string, DocParseResult>();

	for (const md_path of md_files) {
		let content: string;
		try {
			content = fs_ops.read_file_sync(md_path);
		} catch {
			continue;
		}

		const doc_dir = path.dirname(md_path);
		const parsed = parse_markdown(content, doc_dir, project_root);
		doc_parse_results.set(md_path, parsed);
	}

	// ── Step 2: Determine which docs are relevant ───────────────────────
	// A doc is relevant if:
	//   - It's in the explored set
	//   - It links to an explored file
	//   - It's linked from a relevant doc (one hop)

	const relevant_docs = new Set<string>();

	for (const [doc_abs, parsed] of doc_parse_results) {
		if (explored_abs.has(doc_abs)) {
			relevant_docs.add(doc_abs);
			continue;
		}

		const all_targets = [
			...parsed.markdown_links,
			...parsed.wikilinks,
			...parsed.path_references,
		];

		for (const target of all_targets) {
			if (explored_abs.has(target)) {
				relevant_docs.add(doc_abs);
				break;
			}
		}
	}

	// Also include docs linked from relevant docs (one hop)
	const linked_docs = new Set<string>();
	for (const doc_abs of relevant_docs) {
		const parsed = doc_parse_results.get(doc_abs);
		if (!parsed) continue;

		for (const target of parsed.markdown_links) {
			if (doc_parse_results.has(target) && !relevant_docs.has(target)) {
				linked_docs.add(target);
			}
		}
		for (const target of parsed.wikilinks) {
			if (doc_parse_results.has(target) && !relevant_docs.has(target)) {
				linked_docs.add(target);
			}
		}
	}

	for (const doc of linked_docs) {
		relevant_docs.add(doc);
	}

	// ── Step 3: Create doc artifacts and relations ──────────────────────

	for (const doc_abs of relevant_docs) {
		const is_explored = explored_abs.has(doc_abs);
		const doc_id = ensure_artifact(doc_abs, "doc_file", is_explored);
		const parsed = doc_parse_results.get(doc_abs);
		if (!parsed) continue;

		// Doc sections (only for explored docs)
		if (is_explored) {
			for (const heading of parsed.headings) {
				const rel = path.relative(project_root, doc_abs);
				const section_id = make_section_id(rel, heading.text);
				if (!artifacts_map.has(section_id)) {
					artifacts_map.set(section_id, {
						id: section_id,
						kind: "doc_section",
						path: `${rel}#${heading.text}`,
						label: heading.text,
						parent_id: doc_id,
						explored: true,
						first_seen_turn: null,
					});
				}
				relations.push({
					source_id: section_id,
					target_id: doc_id,
					kind: "section_belongs_to_doc",
					evidence: "explicit_doc",
					label: null,
				});
			}
		}

		// Doc → doc links
		for (const target of parsed.markdown_links) {
			if (doc_parse_results.has(target) && relevant_docs.has(target)) {
				const target_id = ensure_artifact(
					target,
					"doc_file",
					explored_abs.has(target),
				);
				relations.push({
					source_id: doc_id,
					target_id,
					kind: "doc_links_doc",
					evidence: "explicit_doc",
					label: null,
				});
			}
		}
		for (const target of parsed.wikilinks) {
			if (doc_parse_results.has(target) && relevant_docs.has(target)) {
				const target_id = ensure_artifact(
					target,
					"doc_file",
					explored_abs.has(target),
				);
				relations.push({
					source_id: doc_id,
					target_id,
					kind: "doc_links_doc",
					evidence: "explicit_doc",
					label: null,
				});
			}
		}

		// Doc → file references
		const file_targets = [
			...parsed.markdown_links,
			...parsed.wikilinks,
			...parsed.path_references,
		];
		for (const target of file_targets) {
			// Skip if it's a doc file (already handled above)
			if (doc_parse_results.has(target)) continue;

			const target_rel = path.relative(project_root, target);
			// Only create reference if it looks like a source file
			if (!target_rel.startsWith("..") && target_rel.length > 0) {
				const is_target_explored = explored_abs.has(target);
				const target_id = ensure_artifact(
					target,
					"source_file",
					is_target_explored,
				);

				relations.push({
					source_id: doc_id,
					target_id,
					kind: "doc_references_file",
					evidence: "explicit_doc",
					label: null,
				});

				// If target is unexplored and source doc is explored, mark adjacency
				if (!is_target_explored && is_explored) {
					relations.push({
						source_id: doc_id,
						target_id,
						kind: "adjacent_unexplored",
						evidence: "adjacency_only",
						label: null,
					});
				}
			}
		}
	}

	// ── Step 4: Parse imports for explored source files ─────────────────

	for (const explored_path of explored_abs) {
		// Skip doc files — already handled
		if (explored_path.endsWith(".md") || explored_path.endsWith(".mdx")) {
			continue;
		}

		// Only parse source files
		if (!SOURCE_EXTENSIONS.some((ext) => explored_path.endsWith(ext))) {
			continue;
		}

		let content: string;
		try {
			content = fs_ops.read_file_sync(explored_path);
		} catch {
			continue;
		}

		const source_id = ensure_artifact(explored_path, "source_file", true);
		const file_dir = path.dirname(explored_path);
		const imported_paths = parse_imports(content, file_dir, project_root, fs_ops);

		for (const imp_abs of imported_paths) {
			const imp_rel = path.relative(project_root, imp_abs);
			if (imp_rel.startsWith("..")) continue; // outside project

			const is_imp_explored = explored_abs.has(imp_abs);
			const imp_id = ensure_artifact(imp_abs, "source_file", is_imp_explored);

			relations.push({
				source_id,
				target_id: imp_id,
				kind: "file_imports_file",
				evidence: "structural_code",
				label: null,
			});

			if (!is_imp_explored) {
				relations.push({
					source_id,
					target_id: imp_id,
					kind: "adjacent_unexplored",
					evidence: "adjacency_only",
					label: null,
				});
			}
		}
	}

	// ── Step 5: Ensure explored files have artifacts ────────────────────

	for (const explored_path of explored_abs) {
		const is_doc =
			explored_path.endsWith(".md") || explored_path.endsWith(".mdx");
		ensure_artifact(explored_path, is_doc ? "doc_file" : "source_file", true);
	}

	return {
		artifacts: Array.from(artifacts_map.values()),
		relations,
		success: true,
	};
}
