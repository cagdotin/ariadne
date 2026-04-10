import { describe, expect, it } from "vitest";
import {
	contains_qmd_invocation,
	is_qmd_command,
	parse_qmd_command,
	shell_tokenize,
} from "../../../backend/qmd-logs/command-parse";

// ── is_qmd_command ──────────────────────────────────────────────────────

describe("is_qmd_command", () => {
	it("detects simple qmd commands", () => {
		expect(is_qmd_command("qmd search 'test'")).toBe(true);
		expect(is_qmd_command("qmd status")).toBe(true);
	});

	it("detects qmd after pipe", () => {
		expect(is_qmd_command("echo hello | qmd search 'test'")).toBe(true);
	});

	it("detects qmd after semicolon", () => {
		expect(is_qmd_command("cd /tmp; qmd status")).toBe(true);
	});

	it("detects qmd after &&", () => {
		expect(is_qmd_command("cd /project && qmd search 'test'")).toBe(true);
	});

	it("detects qmd with env var prefix", () => {
		expect(is_qmd_command("QMD_HOME=/tmp qmd search 'test'")).toBe(true);
	});

	it("rejects non-qmd commands", () => {
		expect(is_qmd_command("ls -la")).toBe(false);
		expect(is_qmd_command("git status")).toBe(false);
		expect(is_qmd_command("echo qmd")).toBe(false); // qmd in args, not command
	});

	it("rejects commands with qmd as substring", () => {
		expect(is_qmd_command("qmdhelper status")).toBe(false);
	});

	it("handles empty string", () => {
		expect(is_qmd_command("")).toBe(false);
	});
});

// ── contains_qmd_invocation ─────────────────────────────────────────────

describe("contains_qmd_invocation", () => {
	it("matches bare 'qmd'", () => {
		expect(contains_qmd_invocation("qmd")).toBe(true);
	});

	it("matches 'qmd' followed by space", () => {
		expect(contains_qmd_invocation("qmd search")).toBe(true);
	});

	it("matches with env vars", () => {
		expect(contains_qmd_invocation("FOO=bar qmd search")).toBe(true);
		expect(contains_qmd_invocation("A=1 B=2 qmd search")).toBe(true);
	});

	it("matches with quoted env var values", () => {
		expect(contains_qmd_invocation('FOO="bar baz" qmd search')).toBe(true);
		expect(contains_qmd_invocation("FOO='bar baz' qmd search")).toBe(true);
	});

	it("rejects non-qmd commands", () => {
		expect(contains_qmd_invocation("echo hello")).toBe(false);
	});
});

// ── shell_tokenize ──────────────────────────────────────────────────────

describe("shell_tokenize", () => {
	it("splits on whitespace", () => {
		expect(shell_tokenize("a b c")).toEqual(["a", "b", "c"]);
	});

	it("handles double-quoted strings", () => {
		expect(shell_tokenize('a "b c" d')).toEqual(["a", "b c", "d"]);
	});

	it("handles single-quoted strings", () => {
		expect(shell_tokenize("a 'b c' d")).toEqual(["a", "b c", "d"]);
	});

	it("handles escaped characters", () => {
		expect(shell_tokenize("a b\\ c d")).toEqual(["a", "b c", "d"]);
	});

	it("handles empty input", () => {
		expect(shell_tokenize("")).toEqual([]);
	});

	it("handles multiple spaces", () => {
		expect(shell_tokenize("a   b   c")).toEqual(["a", "b", "c"]);
	});

	it("handles mixed quoting", () => {
		expect(shell_tokenize("a \"b 'c'\" d")).toEqual(["a", "b 'c'", "d"]);
	});

	it("handles escaped quote in double quotes", () => {
		expect(shell_tokenize('a "b\\"c" d')).toEqual(["a", 'b"c', "d"]);
	});

	it("handles trailing whitespace", () => {
		expect(shell_tokenize("a b ")).toEqual(["a", "b"]);
	});
});

// ── parse_qmd_command ───────────────────────────────────────────────────

describe("parse_qmd_command", () => {
	it("parses simple search command", () => {
		const result = parse_qmd_command("qmd search 'test query'");
		expect(result.subcommand).toBe("search");
		expect(result.primary_argument).toBe("test query");
	});

	it("parses command with index flag", () => {
		const result = parse_qmd_command("qmd search -i my-index 'query'");
		expect(result.subcommand).toBe("search");
		expect(result.index_name).toBe("my-index");
		expect(result.primary_argument).toBe("query");
	});

	it("parses command with collection flag", () => {
		const result = parse_qmd_command("qmd search -c docs 'query'");
		expect(result.subcommand).toBe("search");
		expect(result.collections).toEqual(["docs"]);
	});

	it("parses multiple collections", () => {
		const result = parse_qmd_command("qmd search -c docs -c src 'query'");
		expect(result.collections).toEqual(["docs", "src"]);
	});

	it("parses status command", () => {
		const result = parse_qmd_command("qmd status");
		expect(result.subcommand).toBe("status");
	});

	it("parses update command", () => {
		const result = parse_qmd_command("qmd update");
		expect(result.subcommand).toBe("update");
	});

	it("parses embed command", () => {
		const result = parse_qmd_command("qmd embed");
		expect(result.subcommand).toBe("embed");
	});

	it("parses ls command", () => {
		const result = parse_qmd_command("qmd ls");
		expect(result.subcommand).toBe("ls");
	});

	it("parses command after cd && prefix", () => {
		const result = parse_qmd_command("cd /project && qmd search 'test'");
		expect(result.subcommand).toBe("search");
		expect(result.primary_argument).toBe("test");
	});

	it("parses command with env var prefix", () => {
		const result = parse_qmd_command("QMD_HOME=/tmp qmd status");
		expect(result.subcommand).toBe("status");
	});

	it("returns unknown for unrecognized subcommand", () => {
		const result = parse_qmd_command("qmd foobar");
		expect(result.subcommand).toBe("unknown");
	});

	it("handles --index long flag", () => {
		const result = parse_qmd_command("qmd search --index my-idx 'query'");
		expect(result.index_name).toBe("my-idx");
	});

	it("handles --collection long flag", () => {
		const result = parse_qmd_command("qmd search --collection docs 'query'");
		expect(result.collections).toEqual(["docs"]);
	});

	it("skips known boolean flags", () => {
		const result = parse_qmd_command("qmd search --json --verbose 'query'");
		expect(result.subcommand).toBe("search");
		expect(result.primary_argument).toBe("query");
	});

	it("handles piped commands — picks the qmd segment", () => {
		const result = parse_qmd_command(
			"echo test | qmd search 'hello' | head -5",
		);
		expect(result.subcommand).toBe("search");
		expect(result.primary_argument).toBe("hello");
	});

	it("handles command with no arguments", () => {
		const result = parse_qmd_command("qmd");
		expect(result.subcommand).toBe("unknown");
		expect(result.primary_argument).toBeNull();
	});

	it("parses query subcommand", () => {
		const result = parse_qmd_command("qmd query 'find auth module'");
		expect(result.subcommand).toBe("query");
		expect(result.primary_argument).toBe("find auth module");
	});

	it("parses paths subcommand", () => {
		const result = parse_qmd_command("qmd paths");
		expect(result.subcommand).toBe("paths");
	});

	it("parses cleanup subcommand", () => {
		const result = parse_qmd_command("qmd cleanup");
		expect(result.subcommand).toBe("cleanup");
	});
});
