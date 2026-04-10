/**
 * QMD command detection and parsing — faithful port of
 * the QMD command parsing helpers.
 */

/** Known QMD subcommands. */
const QMD_SUBCOMMANDS: readonly string[] = [
	"query",
	"search",
	"get",
	"multi-get",
	"status",
	"collection",
	"context",
	"update",
	"embed",
	"cleanup",
	"ls",
	"paths",
];

export interface ParsedQmdCommand {
	subcommand: string;
	primary_argument: string | null;
	index_name: string | null;
	collections: string[];
}

/**
 * Skip a shell value (possibly quoted) and return number of characters consumed.
 */
function skip_shell_value(s: string): number {
	if (s.startsWith('"')) {
		const end = s.indexOf('"', 1);
		if (end !== -1) {
			return end + 1;
		}
	} else if (s.startsWith("'")) {
		const end = s.indexOf("'", 1);
		if (end !== -1) {
			return end + 1;
		}
	}
	// Unquoted: consume until whitespace
	const ws_match = s.search(/\s/);
	return ws_match === -1 ? s.length : ws_match;
}

/**
 * Check if a command segment contains a qmd invocation, handling env var prefixes.
 */
export function contains_qmd_invocation(segment: string): boolean {
	if (segment === "qmd" || segment.startsWith("qmd ")) {
		return true;
	}

	let rest = segment;
	for (;;) {
		rest = rest.trimStart();
		const eq_pos = rest.indexOf("=");
		if (eq_pos !== -1) {
			const before_eq = rest.slice(0, eq_pos);
			if (before_eq.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(before_eq)) {
				const after_eq = rest.slice(eq_pos + 1);
				const skip = skip_shell_value(after_eq);
				rest = after_eq.slice(skip);
				continue;
			}
		}
		break;
	}

	rest = rest.trimStart();
	return rest === "qmd" || rest.startsWith("qmd ");
}

/**
 * Detect if a bash command contains a `qmd` CLI invocation.
 */
export function is_qmd_command(command: string): boolean {
	for (const segment of command.split(/[|&;]/)) {
		const trimmed = segment.trim();
		if (contains_qmd_invocation(trimmed)) {
			return true;
		}
	}
	return false;
}

/**
 * Strip leading env var assignments from a command string.
 */
function strip_env_prefixes(s: string): string {
	let rest = s.trim();
	for (;;) {
		const eq_pos = rest.indexOf("=");
		if (eq_pos !== -1) {
			const before_eq = rest.slice(0, eq_pos);
			if (
				before_eq.length > 0 &&
				!/\s/.test(before_eq) &&
				/^[A-Za-z_][A-Za-z0-9_]*$/.test(before_eq)
			) {
				const after_eq = rest.slice(eq_pos + 1);
				const skip = skip_shell_value(after_eq);
				rest = after_eq.slice(skip).trimStart();
				continue;
			}
		}
		break;
	}
	return rest;
}

/**
 * Simple shell tokenizer that handles quoted strings.
 */
export function shell_tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let in_single_quote = false;
	let in_double_quote = false;
	let escape_next = false;

	for (const ch of input) {
		if (escape_next) {
			current += ch;
			escape_next = false;
			continue;
		}
		if (ch === "\\" && !in_single_quote) {
			escape_next = true;
			continue;
		}
		if (ch === "'" && !in_double_quote) {
			in_single_quote = !in_single_quote;
			continue;
		}
		if (ch === '"' && !in_single_quote) {
			in_double_quote = !in_double_quote;
			continue;
		}
		if (/\s/.test(ch) && !in_single_quote && !in_double_quote) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

/**
 * Best-effort parse a QMD CLI command string.
 */
export function parse_qmd_command(command: string): ParsedQmdCommand {
	// Find the qmd invocation segment (split on | and ;)
	const qmd_segment =
		command.split(/[|;]/).find((seg) => {
			const t = seg.trim();
			return t.split("&&").some((part) => contains_qmd_invocation(part.trim()));
		}) ?? command;

	// Extract the `qmd ...` part from potential `cd foo && qmd ...`
	const qmd_part_raw = (
		qmd_segment
			.split("&&")
			.find((part) => contains_qmd_invocation(part.trim())) ?? qmd_segment
	).trim();

	// Strip env var prefixes
	const qmd_part = strip_env_prefixes(qmd_part_raw);

	const tokens = shell_tokenize(qmd_part);

	let subcommand = "unknown";
	let primary_argument: string | null = null;
	let index_name: string | null = null;
	const collections: string[] = [];

	// tokens[0] should be "qmd"
	let i = 1;

	// Skip any global flags before the subcommand
	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.startsWith("-")) {
			i += 1;
			// Skip flag value if it looks like a value flag
			if (i < tokens.length && !tokens[i].startsWith("-")) {
				i += 1;
			}
		} else {
			break;
		}
	}

	// Identify subcommand
	if (i < tokens.length) {
		const candidate = tokens[i].toLowerCase();
		if (QMD_SUBCOMMANDS.includes(candidate)) {
			subcommand = candidate;
		}
		i += 1;
	}

	// Parse remaining tokens for flags and positional args
	const positional_args: string[] = [];

	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok === "-c" || tok === "--collection") {
			i += 1;
			if (i < tokens.length) {
				collections.push(tokens[i]);
			}
		} else if (tok === "-i" || tok === "--index") {
			i += 1;
			if (i < tokens.length) {
				index_name = tokens[i];
			}
		} else if (
			tok === "--json" ||
			tok === "--files" ||
			tok === "--full" ||
			tok === "--verbose" ||
			tok === "-v"
		) {
			// Known flags with no value, skip
		} else if (tok.startsWith("-")) {
			// Unknown flag; skip it and possibly its value
			i += 1;
			if (i < tokens.length && !tokens[i].startsWith("-")) {
				// Probably a flag value, skip
			} else {
				continue; // re-examine current token
			}
		} else {
			positional_args.push(tokens[i]);
		}
		i += 1;
	}

	if (positional_args.length > 0) {
		primary_argument = positional_args[0];
	}

	return { subcommand, primary_argument, index_name, collections };
}
