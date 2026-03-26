import type {
  SessionEntry,
  MessageEntry,
  CompactionEntry,
  BranchSummaryEntry,
  ModelChangeEntry,
  CustomMessageEntry,
  ToolResultMessage,
} from "../types";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message";
import { BashExecutionBlock } from "./bash-execution-block";
import { CompactionBlock } from "./compaction-block";
import { BranchSummaryBlock } from "./branch-summary-block";
import { ModelChangeBlock } from "./model-change-block";
import { CustomMessageBlock } from "./custom-message-block";

interface MessageRendererProps {
  entry: SessionEntry;
  tool_result_map: Map<string, ToolResultMessage>;
}

export function MessageRenderer({ entry, tool_result_map }: MessageRendererProps) {
  switch (entry.type) {
    case "message": {
      const me = entry as MessageEntry;
      const role = me.message.role;

      if (role === "user") {
        return <UserMessage entry={me} />;
      }
      if (role === "assistant") {
        return <AssistantMessage entry={me} tool_result_map={tool_result_map} />;
      }
      if (role === "bashExecution") {
        return <BashExecutionBlock entry={me} />;
      }
      // toolResult entries are consumed by AssistantMessage, not rendered standalone
      if (role === "toolResult") return null;
      // custom role
      if (role === "custom") return null;
      // Unknown role — fallback
      return (
        <div className="text-xs text-muted-foreground font-mono px-3 py-1">
          [{role}]
        </div>
      );
    }

    case "compaction":
      return <CompactionBlock entry={entry as CompactionEntry} />;

    case "branch_summary":
      return <BranchSummaryBlock entry={entry as BranchSummaryEntry} />;

    case "model_change":
      return <ModelChangeBlock entry={entry as ModelChangeEntry} />;

    case "custom_message":
      return <CustomMessageBlock entry={entry as CustomMessageEntry} />;

    // Entries that don't get rendered in the conversation stream
    case "thinking_level_change":
    case "label":
    case "session_info":
    case "custom":
      return null;

    default:
      return (
        <div className="text-xs text-muted-foreground font-mono px-3 py-1">
          [unknown entry: {(entry as SessionEntry).type}]
        </div>
      );
  }
}
