import { shorten_path } from "./path";

export function format_timestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function format_tool_call_label(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "read": {
      const path = shorten_path(String(args.path || args.file_path || ""));
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      let display = path;
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? start + limit - 1 : "";
        display += `:${start}${end ? `-${end}` : ""}`;
      }
      return `[read: ${display}]`;
    }
    case "write":
      return `[write: ${shorten_path(String(args.path || args.file_path || ""))}]`;
    case "edit":
      return `[edit: ${shorten_path(String(args.path || args.file_path || ""))}]`;
    case "bash": {
      const raw = String(args.command || "");
      const cmd = raw.replace(/[\n\t]/g, " ").trim().slice(0, 50);
      return `[bash: ${cmd}${raw.length > 50 ? "..." : ""}]`;
    }
    case "grep":
      return `[grep: /${args.pattern || ""}/ in ${shorten_path(String(args.path || "."))}]`;
    case "find":
      return `[find: ${args.pattern || ""} in ${shorten_path(String(args.path || "."))}]`;
    case "ls":
      return `[ls: ${shorten_path(String(args.path || "."))}]`;
    default: {
      const s = JSON.stringify(args);
      return `[${name}: ${s.slice(0, 40)}${s.length > 40 ? "..." : ""}]`;
    }
  }
}
