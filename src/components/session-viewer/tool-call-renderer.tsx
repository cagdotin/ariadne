import type { ResolvedToolCall } from "./types";
import { BashToolCall } from "./tools/bash-tool-call";
import { ReadToolCall } from "./tools/read-tool-call";
import { WriteToolCall } from "./tools/write-tool-call";
import { EditToolCall } from "./tools/edit-tool-call";
import { GrepToolCall } from "./tools/grep-tool-call";
import { FindToolCall } from "./tools/find-tool-call";
import { LsToolCall } from "./tools/ls-tool-call";
import { GenericToolCall } from "./tools/generic-tool-call";

interface ToolCallRendererProps {
  tool: ResolvedToolCall;
}

const TOOL_COMPONENTS: Record<string, React.ComponentType<{ tool: ResolvedToolCall }>> = {
  bash: BashToolCall,
  Bash: BashToolCall,
  read: ReadToolCall,
  Read: ReadToolCall,
  write: WriteToolCall,
  Write: WriteToolCall,
  edit: EditToolCall,
  Edit: EditToolCall,
  grep: GrepToolCall,
  find: FindToolCall,
  ls: LsToolCall,
};

export function ToolCallRenderer({ tool }: ToolCallRendererProps) {
  const Component = TOOL_COMPONENTS[tool.name] ?? GenericToolCall;
  return <Component tool={tool} />;
}
