import type { ResolvedToolCall } from "../types";

export interface ToolSummary {
  icon: React.ReactNode;
  summary: React.ReactNode;
}

export interface ToolHandler {
  get_summary: (tool: ResolvedToolCall) => ToolSummary;
  get_body: (tool: ResolvedToolCall, output: string) => React.ReactNode | null;
}
