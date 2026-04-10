// ---- QMD SQLite read service (ported from the legacy QMD command layer) ----

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { QmdAvailability } from "../../contracts/qmd/availability.js";
import type {
	QmdCollection,
	QmdCollectionDetail,
	QmdContext,
	QmdDocument,
	QmdStatus,
} from "../../contracts/qmd/collections.js";
import type { QmdIndex } from "../../contracts/qmd/indexes.js";

import { resolve_cache_root, resolve_index_db_path } from "./index-paths.js";

// ---- Helpers ----------------------------------------------------------------

function open_db(index: string): Database.Database {
	const db_path = resolve_index_db_path(index);
	if (!fs.existsSync(db_path)) {
		throw new Error(`QMD index '${index}' not found at ${db_path}`);
	}
	return new Database(db_path, { readonly: true });
}

function parse_ignore_patterns(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
			return parsed as string[];
		}
	} catch {
		// fall through to comma-split
	}
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function parse_contexts(json_str: string | null | undefined): QmdContext[] {
	if (!json_str || json_str.length === 0) {
		return [];
	}
	try {
		const map = JSON.parse(json_str) as Record<string, string>;
		if (typeof map !== "object" || map === null || Array.isArray(map)) {
			return [];
		}
		return Object.entries(map).map(([ctx_path, context]) => ({
			path: ctx_path,
			context,
		}));
	} catch {
		return [];
	}
}

// ---- Read commands ----------------------------------------------------------

export function qmd_list_indexes(): QmdIndex[] {
	const cache_dir = resolve_cache_root();
	if (!fs.existsSync(cache_dir)) {
		return [];
	}

	const entries = fs.readdirSync(cache_dir, { withFileTypes: true });
	const indexes: QmdIndex[] = [];

	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".sqlite")) continue;

		const file_stem = entry.name.replace(/\.sqlite$/, "");
		if (file_stem.length === 0 || file_stem === "models") continue;

		const display_name = file_stem === "index" ? "default" : file_stem;
		const full_path = path.join(cache_dir, entry.name);

		let db_size_bytes = 0;
		let last_modified: string | null = null;
		try {
			const stats = fs.statSync(full_path);
			db_size_bytes = stats.size;
			last_modified = stats.mtime.toISOString();
		} catch {
			// ignore stat errors
		}

		let collection_count = 0;
		let document_count = 0;
		try {
			const db = new Database(full_path, { readonly: true });
			try {
				const cc_row = db
					.prepare("SELECT COUNT(*) as cnt FROM store_collections")
					.get() as { cnt: number } | undefined;
				collection_count = cc_row?.cnt ?? 0;

				const dc_row = db
					.prepare("SELECT COUNT(*) as cnt FROM documents WHERE active = 1")
					.get() as { cnt: number } | undefined;
				document_count = dc_row?.cnt ?? 0;
			} finally {
				db.close();
			}
		} catch {
			// DB open/query failed — leave counts at 0
		}

		indexes.push({
			name: display_name,
			file_stem,
			db_path: full_path,
			db_size_bytes,
			collection_count,
			document_count,
			last_modified,
		});
	}

	// Sort: default first, then alphabetically
	indexes.sort((a, b) => {
		if (a.name === "default") return -1;
		if (b.name === "default") return 1;
		return a.name.localeCompare(b.name);
	});

	return indexes;
}

export function qmd_get_status(index: string): QmdStatus {
	const db = open_db(index);
	try {
		const db_path = resolve_index_db_path(index);
		let db_size_bytes = 0;
		try {
			db_size_bytes = fs.statSync(db_path).size;
		} catch {
			// ignore
		}

		const total_documents =
			(
				db.prepare("SELECT COUNT(*) as cnt FROM documents").get() as
					| { cnt: number }
					| undefined
			)?.cnt ?? 0;

		const active_documents =
			(
				db
					.prepare("SELECT COUNT(*) as cnt FROM documents WHERE active = 1")
					.get() as { cnt: number } | undefined
			)?.cnt ?? 0;

		const needs_embedding =
			(
				db
					.prepare(
						"SELECT COUNT(DISTINCT d.hash) as cnt FROM documents d " +
							"LEFT JOIN content_vectors cv ON d.hash = cv.hash AND cv.seq = 0 " +
							"WHERE d.active = 1 AND cv.hash IS NULL",
					)
					.get() as { cnt: number } | undefined
			)?.cnt ?? 0;

		const embedded_chunks =
			(
				db.prepare("SELECT COUNT(*) as cnt FROM content_vectors").get() as
					| { cnt: number }
					| undefined
			)?.cnt ?? 0;

		const collection_count =
			(
				db.prepare("SELECT COUNT(*) as cnt FROM store_collections").get() as
					| { cnt: number }
					| undefined
			)?.cnt ?? 0;

		let global_context: string | null = null;
		try {
			const gc_row = db
				.prepare("SELECT value FROM store_config WHERE key = 'global_context'")
				.get() as { value: string } | undefined;
			global_context = gc_row?.value ?? null;
		} catch {
			// table might not exist
		}

		let days_since_update: number | null = null;
		try {
			const ts_row = db
				.prepare(
					"SELECT MAX(modified_at) as ts FROM documents WHERE active = 1",
				)
				.get() as { ts: string | null } | undefined;
			const ts = ts_row?.ts;
			if (ts) {
				const parsed = new Date(ts);
				if (!Number.isNaN(parsed.getTime())) {
					const now = Date.now();
					const diff_ms = now - parsed.getTime();
					days_since_update = Math.max(
						0,
						Math.floor(diff_ms / (1000 * 60 * 60 * 24)),
					);
				}
			}
		} catch {
			// ignore
		}

		return {
			total_documents,
			active_documents,
			embedded_chunks,
			needs_embedding,
			collection_count,
			db_size_bytes,
			global_context,
			days_since_update,
		};
	} finally {
		db.close();
	}
}

export function qmd_list_collections(index: string): QmdCollection[] {
	const db = open_db(index);
	try {
		const sql =
			"SELECT sc.name, sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default, " +
			"sc.update_command, sc.context, " +
			"COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count, " +
			"COUNT(DISTINCT d.id) as total_doc_count, " +
			"COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count, " +
			"MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified " +
			"FROM store_collections sc " +
			"LEFT JOIN documents d ON d.collection = sc.name " +
			"LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 " +
			"GROUP BY sc.name";

		const rows = db.prepare(sql).all() as Array<{
			name: string;
			path: string;
			pattern: string;
			ignore_patterns: string | null;
			include_by_default: number;
			update_command: string | null;
			context: string | null;
			active_doc_count: number;
			total_doc_count: number;
			embedded_count: number;
			last_modified: string | null;
		}>;

		return rows.map((row) => ({
			name: row.name,
			path: row.path,
			pattern: row.pattern,
			ignore_patterns: parse_ignore_patterns(row.ignore_patterns ?? ""),
			include_by_default: (row.include_by_default ?? 1) !== 0,
			update_command: row.update_command ?? null,
			doc_count: row.total_doc_count ?? 0,
			active_doc_count: row.active_doc_count ?? 0,
			embedded_count: row.embedded_count ?? 0,
			last_modified: row.last_modified ?? null,
			contexts: parse_contexts(row.context),
		}));
	} finally {
		db.close();
	}
}

export function qmd_get_collection_detail(
	index: string,
	name: string,
): QmdCollectionDetail {
	const db = open_db(index);
	try {
		const coll_sql =
			"SELECT sc.path, sc.pattern, sc.ignore_patterns, sc.include_by_default, " +
			"sc.update_command, sc.context, " +
			"COUNT(DISTINCT CASE WHEN d.active = 1 THEN d.id END) as active_doc_count, " +
			"COUNT(DISTINCT d.id) as total_doc_count, " +
			"COUNT(DISTINCT CASE WHEN d.active = 1 THEN cv.hash END) as embedded_count, " +
			"MAX(CASE WHEN d.active = 1 THEN d.modified_at END) as last_modified " +
			"FROM store_collections sc " +
			"LEFT JOIN documents d ON d.collection = sc.name " +
			"LEFT JOIN content_vectors cv ON cv.hash = d.hash AND cv.seq = 0 " +
			"WHERE sc.name = ? " +
			"GROUP BY sc.name";

		const row = db.prepare(coll_sql).get(name) as
			| {
					path: string;
					pattern: string;
					ignore_patterns: string | null;
					include_by_default: number;
					update_command: string | null;
					context: string | null;
					active_doc_count: number;
					total_doc_count: number;
					embedded_count: number;
					last_modified: string | null;
			  }
			| undefined;

		if (!row) {
			throw new Error(`Collection not found: ${name}`);
		}

		const collection: QmdCollection = {
			name,
			path: row.path,
			pattern: row.pattern,
			ignore_patterns: parse_ignore_patterns(row.ignore_patterns ?? ""),
			include_by_default: (row.include_by_default ?? 1) !== 0,
			update_command: row.update_command ?? null,
			doc_count: row.total_doc_count ?? 0,
			active_doc_count: row.active_doc_count ?? 0,
			embedded_count: row.embedded_count ?? 0,
			last_modified: row.last_modified ?? null,
			contexts: parse_contexts(row.context),
		};

		const documents = get_collection_documents(db, name);

		return { collection, documents };
	} finally {
		db.close();
	}
}

function get_collection_documents(
	db: Database.Database,
	collection: string,
): QmdDocument[] {
	const sql =
		"SELECT d.path, d.title, SUBSTR(d.hash, 1, 6) as docid, d.collection, d.modified_at, " +
		"LENGTH(c.doc) as body_length " +
		"FROM documents d " +
		"JOIN content c ON c.hash = d.hash " +
		"WHERE d.collection = ? AND d.active = 1 " +
		"ORDER BY d.modified_at DESC";

	const rows = db.prepare(sql).all(collection) as Array<{
		path: string;
		title: string | null;
		docid: string;
		collection: string;
		modified_at: string | null;
		body_length: number | null;
	}>;

	return rows.map((row) => ({
		path: row.path,
		title: row.title ?? "",
		docid: row.docid,
		collection: row.collection,
		modified_at: row.modified_at ?? "",
		body_length: row.body_length ?? 0,
	}));
}

export function qmd_check_availability(): QmdAvailability {
	const db_path = resolve_index_db_path("default");
	const db_exists = fs.existsSync(db_path);

	let db_size_bytes: number | null = null;
	if (db_exists) {
		try {
			db_size_bytes = fs.statSync(db_path).size;
		} catch {
			// ignore
		}
	}

	let installed = false;
	let version: string | null = null;
	try {
		const output = execSync("qmd --version", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		installed = true;
		version = output.length > 0 ? output : null;
	} catch {
		// qmd not installed or not in PATH
	}

	return {
		installed,
		version,
		db_path: db_exists ? db_path : null,
		db_size_bytes,
	};
}

export function qmd_get_indexed_paths(
	index: string,
	collection: string,
): string[] {
	const db = open_db(index);
	try {
		const rows = db
			.prepare("SELECT path FROM documents WHERE collection = ? AND active = 1")
			.all(collection) as Array<{ path: string }>;
		return rows.map((r) => r.path);
	} finally {
		db.close();
	}
}
