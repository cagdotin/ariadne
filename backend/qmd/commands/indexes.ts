// ---- QMD index management commands (ported from the legacy QMD command layer)

import fs from "node:fs";

import { resolve_index_db_path, validate_index_name } from "../index-paths.js";

export interface QmdCommandResult {
	success: boolean;
	output: string;
}

export function qmd_create_index(name: string): QmdCommandResult {
	const validation = validate_index_name(name);
	if (!validation.valid) {
		throw new Error(validation.error);
	}

	const db_path = resolve_index_db_path(name);
	if (fs.existsSync(db_path)) {
		throw new Error(`Index '${name}' already exists`);
	}

	// Placeholder: in production this delegates to the QMD sidecar/bridge
	return {
		success: true,
		output: `Index '${name}' creation requested`,
	};
}

export function qmd_delete_index(name: string): QmdCommandResult {
	if (name === "default") {
		throw new Error("Cannot delete the default index");
	}

	const db_path = resolve_index_db_path(name);
	if (!fs.existsSync(db_path)) {
		throw new Error(`Index '${name}' does not exist`);
	}

	// Delete main file + WAL/SHM companions
	try {
		fs.unlinkSync(db_path);
	} catch {
		// ignore
	}

	const wal_path = db_path.replace(/\.sqlite$/, ".sqlite-wal");
	const shm_path = db_path.replace(/\.sqlite$/, ".sqlite-shm");
	try {
		fs.unlinkSync(wal_path);
	} catch {
		// ignore
	}
	try {
		fs.unlinkSync(shm_path);
	} catch {
		// ignore
	}

	return {
		success: true,
		output: `Index '${name}' deleted`,
	};
}

export function qmd_rename_index(
	old_name: string,
	new_name: string,
): QmdCommandResult {
	if (old_name === "default") {
		throw new Error("Cannot rename the default index");
	}

	const validation = validate_index_name(new_name);
	if (!validation.valid) {
		throw new Error(validation.error);
	}

	const old_path = resolve_index_db_path(old_name);
	const new_path = resolve_index_db_path(new_name);

	if (!fs.existsSync(old_path)) {
		throw new Error(`Index '${old_name}' does not exist`);
	}
	if (fs.existsSync(new_path)) {
		throw new Error(`Index '${new_name}' already exists`);
	}

	fs.renameSync(old_path, new_path);

	// Also rename WAL/SHM if they exist
	const old_wal = old_path.replace(/\.sqlite$/, ".sqlite-wal");
	const new_wal = new_path.replace(/\.sqlite$/, ".sqlite-wal");
	if (fs.existsSync(old_wal)) {
		try {
			fs.renameSync(old_wal, new_wal);
		} catch {
			// ignore
		}
	}

	const old_shm = old_path.replace(/\.sqlite$/, ".sqlite-shm");
	const new_shm = new_path.replace(/\.sqlite$/, ".sqlite-shm");
	if (fs.existsSync(old_shm)) {
		try {
			fs.renameSync(old_shm, new_shm);
		} catch {
			// ignore
		}
	}

	return {
		success: true,
		output: `Index renamed from '${old_name}' to '${new_name}'`,
	};
}
