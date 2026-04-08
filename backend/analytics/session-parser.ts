/**
 * JSONL session parser — faithful port of
 * src-tauri/src/parser/session.rs :: parse_session_file()
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type {
  SessionFile,
  SessionSummary,
  ToolCallSummary,
} from "./session-types";

/**
 * Parse a single .jsonl session file into a SessionSummary.
 *
 * Returns null if no session header line is found.
 * Malformed JSON lines are skipped with a console.warn.
 */
export function parse_session_file(file: SessionFile): SessionSummary | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file.path, "utf-8");
  } catch (err) {
    console.warn(`Failed to open file ${file.path}: ${err}`);
    return null;
  }

  const lines = raw.split("\n");

  // Mutable summary, matching Rust Default impl
  const summary: SessionSummary = {
    id: "",
    project_path: "",
    project_name: "",
    session_dir: file.dir_name,
    file_name: file.file_name,
    file_size_bytes: file.file_size,
    started_at: "",
    ended_at: null,
    duration_seconds: null,
    title: null,
    first_user_message: null,
    total_cost: 0,
    input_cost: 0,
    output_cost: 0,
    cache_read_cost: 0,
    cache_write_cost: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    user_message_count: 0,
    assistant_message_count: 0,
    tool_result_count: 0,
    turn_count: 0,
    compaction_count: 0,
    tool_calls: {},
    bash_commands: {},
    read_files: {},
    edit_files: {},
    write_files: {},
    models_used: [],
  };

  let last_timestamp: string | null = null;
  const tool_call_counts: Record<string, ToolCallSummary> = {};
  const model_usage_map: Map<string, number> = new Map();
  let found_session_header = false;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    let json_value: Record<string, unknown>;
    try {
      json_value = JSON.parse(line);
    } catch {
      // Skip malformed lines gracefully (matches Rust behavior)
      console.warn(`Skipping malformed JSON line in ${file.path}`);
      continue;
    }

    // Update last timestamp
    const timestamp = json_value.timestamp;
    if (typeof timestamp === "string") {
      last_timestamp = timestamp;
    }

    // Parse based on event type
    const entry_type = json_value.type;

    if (entry_type === "session") {
      found_session_header = true;

      if (typeof json_value.id === "string") {
        summary.id = json_value.id;
      }
      if (typeof json_value.timestamp === "string") {
        summary.started_at = json_value.timestamp;
      }
      if (typeof json_value.cwd === "string") {
        summary.project_path = json_value.cwd;
        summary.project_name = path.basename(json_value.cwd) || "";
      }
    } else if (entry_type === "session_info") {
      if (typeof json_value.name === "string") {
        summary.title = json_value.name;
      }
    } else if (entry_type === "message") {
      const message = json_value.message as Record<string, unknown> | undefined;
      if (!message) {
        continue;
      }

      const role = message.role;

      if (role === "user") {
        summary.user_message_count += 1;

        // Capture first user message text (truncated to 200 chars)
        if (summary.first_user_message === null) {
          const content = message.content;
          let text = "";

          if (typeof content === "string") {
            text = content;
          } else if (Array.isArray(content)) {
            const text_parts: string[] = [];
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                (block as Record<string, unknown>).type === "text" &&
                typeof (block as Record<string, unknown>).text === "string"
              ) {
                text_parts.push(
                  (block as Record<string, unknown>).text as string,
                );
              }
            }
            text = text_parts.join(" ");
          }

          const trimmed = text.trim();
          if (trimmed.length > 0) {
            const truncated =
              trimmed.length > 200
                ? trimmed.substring(0, 200) + "\u2026"
                : trimmed;
            summary.first_user_message = truncated;
          }
        }
      } else if (role === "assistant") {
        summary.assistant_message_count += 1;

        // Check for stop reason to count turns
        // Rust: message.get("stopReason").is_some() triggers when the key
        // exists, even if the value is null — so we match that behavior.
        if ("stopReason" in message) {
          summary.turn_count += 1;
        }

        // Extract tool call parameters from content blocks
        const content = message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === "toolCall") {
              const tool_name =
                typeof b.name === "string" ? b.name : "";
              const arguments_obj = b.arguments as
                | Record<string, unknown>
                | undefined;

              if (tool_name === "bash") {
                const cmd = arguments_obj?.command;
                if (typeof cmd === "string") {
                  const program =
                    cmd.trim().split(/\s+/)[0] ?? cmd;
                  summary.bash_commands[program] =
                    (summary.bash_commands[program] ?? 0) + 1;
                }
              } else if (tool_name === "read" || tool_name === "Read") {
                const p = arguments_obj?.path;
                if (typeof p === "string") {
                  summary.read_files[p] =
                    (summary.read_files[p] ?? 0) + 1;
                }
              } else if (tool_name === "edit" || tool_name === "Edit") {
                const p = arguments_obj?.path;
                if (typeof p === "string") {
                  summary.edit_files[p] =
                    (summary.edit_files[p] ?? 0) + 1;
                }
              } else if (tool_name === "write" || tool_name === "Write") {
                const p = arguments_obj?.path;
                if (typeof p === "string") {
                  summary.write_files[p] =
                    (summary.write_files[p] ?? 0) + 1;
                }
              }
            }
          }
        }

        // Extract usage information (camelCase in JSON)
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage) {
          if (typeof usage.input === "number") {
            summary.input_tokens += usage.input;
          }
          if (typeof usage.output === "number") {
            summary.output_tokens += usage.output;
          }
          if (typeof usage.cacheRead === "number") {
            summary.cache_read_tokens += usage.cacheRead;
          }
          if (typeof usage.cacheWrite === "number") {
            summary.cache_write_tokens += usage.cacheWrite;
          }
          if (typeof usage.totalTokens === "number") {
            summary.total_tokens += usage.totalTokens;
          }

          // Extract cost information
          const cost = usage.cost as Record<string, unknown> | undefined;
          if (cost) {
            if (typeof cost.input === "number") {
              summary.input_cost += cost.input;
            }
            if (typeof cost.output === "number") {
              summary.output_cost += cost.output;
            }
            if (typeof cost.cacheRead === "number") {
              summary.cache_read_cost += cost.cacheRead;
            }
            if (typeof cost.cacheWrite === "number") {
              summary.cache_write_cost += cost.cacheWrite;
            }
            if (typeof cost.total === "number") {
              summary.total_cost += cost.total;
            }
          }
        }

        // Track model usage
        const model = message.model;
        const provider = message.provider;
        if (typeof model === "string" && typeof provider === "string") {
          const key = `${model}\0${provider}`;
          model_usage_map.set(key, (model_usage_map.get(key) ?? 0) + 1);
        }
      } else if (role === "toolResult") {
        summary.tool_result_count += 1;

        const tool_name = message.toolName;
        if (typeof tool_name === "string") {
          const is_error =
            typeof message.isError === "boolean"
              ? message.isError
              : false;

          if (!tool_call_counts[tool_name]) {
            tool_call_counts[tool_name] = {
              name: tool_name,
              calls: 0,
              errors: 0,
            };
          }
          tool_call_counts[tool_name].calls += 1;
          if (is_error) {
            tool_call_counts[tool_name].errors += 1;
          }
        }
      }
    } else if (entry_type === "compaction") {
      summary.compaction_count += 1;
    }
    // Skip unknown event types
  }

  // Return null if no session header found
  if (!found_session_header) {
    return null;
  }

  // Set end timestamp and calculate duration
  summary.ended_at = last_timestamp;
  if (last_timestamp !== null && summary.started_at !== "") {
    try {
      const start_time = new Date(summary.started_at).getTime();
      const end_time = new Date(last_timestamp).getTime();
      if (!isNaN(start_time) && !isNaN(end_time)) {
        summary.duration_seconds = (end_time - start_time) / 1000;
      }
    } catch {
      // Leave duration_seconds as null on parse failure
    }
  }

  // Convert tool calls map
  summary.tool_calls = tool_call_counts;

  // Convert model usage map to array
  summary.models_used = [];
  for (const [key, message_count] of model_usage_map) {
    const [model_id, provider] = key.split("\0");
    summary.models_used.push({
      model_id,
      provider,
      message_count,
    });
  }

  return summary;
}
