// ============================================================
// JSONL session entry types — mirrors pi's session-manager.d.ts
// ============================================================

export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parent_session?: string;
}

// --------------- content blocks ---------------

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;      // base64
  mimeType: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

// --------------- message shapes ---------------

export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
  timestamp?: number;
}

export interface AssistantMessageData {
  role: "assistant";
  content: ContentBlock[];
  model?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      total?: number;
    };
  };
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName?: string;
  content: ContentBlock[];
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}

export interface CustomRoleMessage {
  role: "custom";
  customType: string;
  content: string | ContentBlock[];
  display: boolean;
  details?: unknown;
  timestamp: number;
}

export type MessageData =
  | UserMessage
  | AssistantMessageData
  | ToolResultMessage
  | BashExecutionMessage
  | CustomRoleMessage;

// --------------- session entries ---------------

export interface EntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  [key: string]: unknown;  // allow extra props for inspector
}

export interface MessageEntry extends EntryBase {
  type: "message";
  message: MessageData;
}

export interface ThinkingLevelChangeEntry extends EntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface ModelChangeEntry extends EntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
  fromHook?: boolean;
}

export interface BranchSummaryEntry extends EntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
  fromHook?: boolean;
}

export interface CustomEntry extends EntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export interface CustomMessageEntry extends EntryBase {
  type: "custom_message";
  customType: string;
  content: string | ContentBlock[];
  details?: unknown;
  display: boolean;
}

export interface LabelEntry extends EntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export interface SessionInfoEntry extends EntryBase {
  type: "session_info";
  name?: string;
}

export type SessionEntry =
  | MessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry;

// --------------- tree structures ---------------

export interface TreeNode {
  entry: SessionEntry;
  children: TreeNode[];
  label?: string;
}

export interface FlatTreeNode {
  node: TreeNode;
  indent: number;
  show_connector: boolean;
  is_last: boolean;
  gutters: { position: number; show: boolean }[];
  is_virtual_root_child: boolean;
  multiple_roots: boolean;
}

// --------------- stats ---------------

export interface SessionStats {
  user_messages: number;
  assistant_messages: number;
  tool_results: number;
  custom_messages: number;
  compactions: number;
  branch_summaries: number;
  tool_calls: number;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  cost: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  models: string[];
}

// --------------- API response ---------------

export interface SessionEntriesResponse {
  header: SessionHeader | null;
  entries: SessionEntry[];
  leaf_id: string | null;
}

// --------------- tool call + result pair (resolved) ---------------

export interface ResolvedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: ToolResultMessage | null;
}
