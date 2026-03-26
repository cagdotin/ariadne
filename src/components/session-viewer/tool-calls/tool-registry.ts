import type { ToolHandler } from "./tool-types";
import { read_tool } from "./read-tool";
import { bash_tool } from "./bash-tool";
import { write_tool } from "./write-tool";
import { edit_tool } from "./edit-tool";
import { grep_tool } from "./grep-tool";
import { find_tool } from "./find-tool";
import { ls_tool } from "./ls-tool";
import { default_tool } from "./default-tool";

const registry: Record<string, ToolHandler> = {
  read: read_tool,
  bash: bash_tool,
  write: write_tool,
  edit: edit_tool,
  grep: grep_tool,
  find: find_tool,
  ls: ls_tool,
};

export function get_tool_handler(name: string): ToolHandler {
  return registry[name.toLowerCase()] ?? default_tool;
}
