/**
 * QMD session log parser — faithful port of
 * src-tauri/src/parser/qmd_logs.rs :: parse_qmd_logs_from_session()
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { QmdLogEntry } from "../../contracts/qmd-logs/entries.js";

import { is_qmd_command, parse_qmd_command } from "./command-parse.js";

/** Maximum length for the output preview shown in table cells. */
const PREVIEW_MAX_LEN = 200;

interface PendingQmdCall {
  tool_call_id: string;
  raw_command: string;
  timestamp: string;
}

/**
 * Extract text content from a toolResult message.
 */
function extract_tool_result_text(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).type === "text" &&
        typeof (item as Record<string, unknown>).text === "string"
      ) {
        parts.push((item as Record<string, unknown>).text as string);
      }
    }
    return parts.join("\n");
  }
  return "";
}

/**
 * Truncate a string for table preview display.
 */
function truncate_preview(text: string, max_len: number): string {
  const first_line = text.split("\n")[0] ?? "";
  if (first_line.length <= max_len) {
    return first_line;
  }
  return first_line.slice(0, max_len) + "\u2026";
}

/**
 * Detect output kind based on content.
 */
function detect_output_kind(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "unknown";
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const val = JSON.parse(trimmed);
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        if ("results" in val || "hits" in val) {
          return "search_json";
        }
      }
      if (Array.isArray(val)) {
        if (val.length > 0) {
          const first = val[0];
          if (
            typeof first === "object" &&
            first !== null &&
            ("path" in first || "file" in first)
          ) {
            return "files_json";
          }
        }
      }
      return "search_json";
    } catch {
      // Not valid JSON, fall through
    }
  }

  return "raw_text";
}

/**
 * Parse a single session JSONL file and return all detected QMD CLI log entries.
 */
export function parse_qmd_logs_from_session(
  file_path: string,
  _dir_name: string,
): QmdLogEntry[] {
  let file_content: string;
  try {
    file_content = fs.readFileSync(file_path, "utf-8");
  } catch (e) {
    console.error(`Failed to open file ${file_path}: ${e}`);
    return [];
  }

  const lines = file_content.split("\n");

  let session_id = "";
  let project_path = "";
  let project_name = "";

  const pending = new Map<string, PendingQmdCall>();
  const results: QmdLogEntry[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    let json_value: Record<string, unknown>;
    try {
      json_value = JSON.parse(line);
    } catch {
      continue;
    }

    const type = json_value.type;

    if (type === "session") {
      if (typeof json_value.id === "string") {
        session_id = json_value.id;
      }
      if (typeof json_value.cwd === "string") {
        project_path = json_value.cwd;
        project_name = path.basename(json_value.cwd) || "";
      }
      continue;
    }

    if (type === "message") {
      const message = json_value.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const role = typeof message.role === "string" ? message.role : "";
      const timestamp =
        typeof json_value.timestamp === "string" ? json_value.timestamp : "";

      if (role === "assistant") {
        const content = message.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (
            typeof block !== "object" ||
            block === null ||
            (block as Record<string, unknown>).type !== "toolCall"
          ) {
            continue;
          }

          const b = block as Record<string, unknown>;
          const tool_name = typeof b.name === "string" ? b.name : "";
          if (tool_name !== "bash" && tool_name !== "Bash") {
            continue;
          }

          // Correlation key: "id" on toolCall, "toolCallId" on toolResult
          let tool_call_id: string | undefined;
          if (typeof b.id === "string") {
            tool_call_id = b.id;
          } else if (typeof b.toolCallId === "string") {
            tool_call_id = b.toolCallId;
          }
          if (!tool_call_id) continue;

          const args = b.arguments as Record<string, unknown> | undefined;
          const command =
            args && typeof args.command === "string" ? args.command : "";

          if (!is_qmd_command(command)) {
            continue;
          }

          pending.set(tool_call_id, {
            tool_call_id,
            raw_command: command,
            timestamp,
          });
        }
      } else if (role === "toolResult") {
        const tool_call_id =
          typeof message.toolCallId === "string" ? message.toolCallId : "";

        const call = pending.get(tool_call_id);
        if (call) {
          pending.delete(tool_call_id);

          const is_error =
            typeof message.isError === "boolean" ? message.isError : false;
          const output_text = extract_tool_result_text(message);
          const output_preview = truncate_preview(output_text, PREVIEW_MAX_LEN);
          const output_kind = detect_output_kind(output_text);
          const parsed = parse_qmd_command(call.raw_command);

          results.push({
            id: `${session_id}:${call.tool_call_id}`,
            session_id,
            project_path,
            project_name,
            timestamp: call.timestamp,
            tool_call_id: call.tool_call_id,
            raw_command: call.raw_command,
            subcommand: parsed.subcommand,
            primary_argument: parsed.primary_argument,
            index_name: parsed.index_name,
            collections: parsed.collections,
            is_error,
            has_output: true,
            output_text,
            output_preview,
            output_kind,
          });
        }
      }
    }
  }

  // Handle pending calls that never got a tool result
  for (const [_id, call] of pending) {
    const parsed = parse_qmd_command(call.raw_command);
    results.push({
      id: `${session_id}:${call.tool_call_id}`,
      session_id,
      project_path,
      project_name,
      timestamp: call.timestamp,
      tool_call_id: call.tool_call_id,
      raw_command: call.raw_command,
      subcommand: parsed.subcommand,
      primary_argument: parsed.primary_argument,
      index_name: parsed.index_name,
      collections: parsed.collections,
      is_error: false,
      has_output: false,
      output_text: "",
      output_preview: "",
      output_kind: "unknown",
    });
  }

  return results;
}
