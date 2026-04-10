import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(),
		unlinkSync: vi.fn(),
		renameSync: vi.fn(),
	},
}));

// Mock index-paths to control path resolution
vi.mock("../../../backend/qmd/index-paths", () => ({
	resolve_index_db_path: vi.fn(
		(name: string) => `/cache/${name === "default" ? "index" : name}.sqlite`,
	),
	validate_index_name: vi.fn((name: string) => {
		if (!/^[a-z][a-z0-9-]*$/.test(name))
			return { valid: false, error: "Invalid name" };
		if (name === "index" || name === "models")
			return { valid: false, error: `'${name}' is reserved` };
		return { valid: true };
	}),
}));

import {
	qmd_create_index,
	qmd_delete_index,
	qmd_rename_index,
} from "../../../backend/qmd/commands/indexes";

beforeEach(() => {
	vi.restoreAllMocks();
});

// ── qmd_create_index ────────────────────────────────────────────────────

describe("qmd_create_index", () => {
	it("throws for invalid index name", () => {
		expect(() => qmd_create_index("1bad")).toThrow("Invalid name");
	});

	it("throws if index already exists", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(true);
		expect(() => qmd_create_index("existing")).toThrow("already exists");
	});

	it("succeeds for valid new index", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(false);
		const result = qmd_create_index("my-index");
		expect(result.success).toBe(true);
		expect(result.output).toContain("my-index");
	});
});

// ── qmd_delete_index ────────────────────────────────────────────────────

describe("qmd_delete_index", () => {
	it("throws when trying to delete default index", () => {
		expect(() => qmd_delete_index("default")).toThrow(
			"Cannot delete the default index",
		);
	});

	it("throws if index does not exist", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(false);
		expect(() => qmd_delete_index("missing")).toThrow("does not exist");
	});

	it("deletes main file and WAL/SHM companions", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(true);
		vi.mocked(fs.default.unlinkSync).mockReturnValue(undefined);

		const result = qmd_delete_index("my-index");
		expect(result.success).toBe(true);

		// Should attempt to delete main, WAL, and SHM
		expect(fs.default.unlinkSync).toHaveBeenCalledWith(
			"/cache/my-index.sqlite",
		);
		expect(fs.default.unlinkSync).toHaveBeenCalledWith(
			"/cache/my-index.sqlite-wal",
		);
		expect(fs.default.unlinkSync).toHaveBeenCalledWith(
			"/cache/my-index.sqlite-shm",
		);
	});

	it("handles unlink errors gracefully", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(true);
		vi.mocked(fs.default.unlinkSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});

		// Should not throw despite unlink failures
		const result = qmd_delete_index("my-index");
		expect(result.success).toBe(true);
	});
});

// ── qmd_rename_index ────────────────────────────────────────────────────

describe("qmd_rename_index", () => {
	it("throws when trying to rename default index", () => {
		expect(() => qmd_rename_index("default", "new-name")).toThrow(
			"Cannot rename the default index",
		);
	});

	it("throws for invalid new name", () => {
		expect(() => qmd_rename_index("old", "1invalid")).toThrow("Invalid name");
	});

	it("throws if source index does not exist", () => {
		vi.mocked(fs.default.existsSync).mockReturnValue(false);
		expect(() => qmd_rename_index("old", "new-name")).toThrow("does not exist");
	});

	it("throws if target index already exists", () => {
		vi.mocked(fs.default.existsSync).mockImplementation((_p) => {
			// old exists, new also exists
			return true;
		});
		expect(() => qmd_rename_index("old", "new-name")).toThrow("already exists");
	});

	it("renames main file successfully", () => {
		vi.mocked(fs.default.existsSync).mockImplementation((p) => {
			const path = String(p);
			if (path === "/cache/old.sqlite") return true;
			return false; // new doesn't exist, WAL/SHM don't exist
		});
		vi.mocked(fs.default.renameSync).mockReturnValue(undefined);

		const result = qmd_rename_index("old", "new-name");
		expect(result.success).toBe(true);
		expect(result.output).toContain("old");
		expect(result.output).toContain("new-name");
		expect(fs.default.renameSync).toHaveBeenCalledWith(
			"/cache/old.sqlite",
			"/cache/new-name.sqlite",
		);
	});

	it("renames WAL and SHM files if they exist", () => {
		vi.mocked(fs.default.existsSync).mockImplementation((p) => {
			const path = String(p);
			if (path === "/cache/old.sqlite") return true;
			if (path === "/cache/new-name.sqlite") return false;
			if (path.endsWith("-wal")) return true;
			if (path.endsWith("-shm")) return true;
			return false;
		});
		vi.mocked(fs.default.renameSync).mockReturnValue(undefined);

		qmd_rename_index("old", "new-name");
		expect(fs.default.renameSync).toHaveBeenCalledWith(
			"/cache/old.sqlite-wal",
			"/cache/new-name.sqlite-wal",
		);
		expect(fs.default.renameSync).toHaveBeenCalledWith(
			"/cache/old.sqlite-shm",
			"/cache/new-name.sqlite-shm",
		);
	});
});
