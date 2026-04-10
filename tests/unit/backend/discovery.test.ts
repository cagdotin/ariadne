import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");

import { discover_session_files } from "../../../backend/analytics/discovery";

beforeEach(() => {
	vi.restoreAllMocks();
	// Default: no sessions root
	process.env.ARIADNE_PI_SESSIONS_ROOT = "/test-sessions";
});

describe("discover_session_files", () => {
	it("returns empty when sessions directory does not exist", () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		expect(discover_session_files()).toEqual([]);
	});

	it("returns empty when sessions directory is empty", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);
		expect(discover_session_files()).toEqual([]);
	});

	it("discovers .jsonl files in subdirectories", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);

		// First call: top-level dirs
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (dir === "/test-sessions") {
				return [
					{ name: "project-a", isDirectory: () => true, isFile: () => false },
				] as unknown as fs.Dirent[];
			}
			if (String(dir) === "/test-sessions/project-a") {
				return [
					{
						name: "session.jsonl",
						isDirectory: () => false,
						isFile: () => true,
					},
					{ name: "other.txt", isDirectory: () => false, isFile: () => true },
				] as unknown as fs.Dirent[];
			}
			return [] as unknown as fs.Dirent[];
		});

		vi.mocked(fs.statSync).mockReturnValue({ size: 2048 } as fs.Stats);

		const files = discover_session_files();
		expect(files).toHaveLength(1);
		expect(files[0].file_name).toBe("session.jsonl");
		expect(files[0].dir_name).toBe("project-a");
		expect(files[0].file_size).toBe(2048);
	});

	it("ignores non-.jsonl files", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (dir === "/test-sessions") {
				return [
					{ name: "proj", isDirectory: () => true, isFile: () => false },
				] as unknown as fs.Dirent[];
			}
			return [
				{ name: "readme.md", isDirectory: () => false, isFile: () => true },
			] as unknown as fs.Dirent[];
		});

		expect(discover_session_files()).toEqual([]);
	});

	it("ignores top-level files (only processes directories)", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readdirSync).mockReturnValue([
			{ name: "file.jsonl", isDirectory: () => false, isFile: () => true },
		] as unknown as fs.Dirent[]);

		expect(discover_session_files()).toEqual([]);
	});

	it("defaults file_size to 0 on stat error", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (dir === "/test-sessions") {
				return [
					{ name: "proj", isDirectory: () => true, isFile: () => false },
				] as unknown as fs.Dirent[];
			}
			return [
				{ name: "s.jsonl", isDirectory: () => false, isFile: () => true },
			] as unknown as fs.Dirent[];
		});
		vi.mocked(fs.statSync).mockImplementation(() => {
			throw new Error("ENOENT");
		});

		const files = discover_session_files();
		expect(files).toHaveLength(1);
		expect(files[0].file_size).toBe(0);
	});

	it("sorts results by file_name", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (dir === "/test-sessions") {
				return [
					{ name: "proj", isDirectory: () => true, isFile: () => false },
				] as unknown as fs.Dirent[];
			}
			return [
				{ name: "z.jsonl", isDirectory: () => false, isFile: () => true },
				{ name: "a.jsonl", isDirectory: () => false, isFile: () => true },
			] as unknown as fs.Dirent[];
		});
		vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);

		const files = discover_session_files();
		expect(files[0].file_name).toBe("a.jsonl");
		expect(files[1].file_name).toBe("z.jsonl");
	});
});
