import { cn } from "@/lib/utils";
import type { FlatTreeNode, MessageEntry, SessionEntry } from "../types";
import {
	build_tree_prefix,
	extract_text,
	format_tool_call_label,
} from "../utils";

interface SessionTreeNodeProps {
	flat_node: FlatTreeNode;
	is_active: boolean;
	is_on_path: boolean;
	tool_call_map: Map<
		string,
		{ name: string; arguments: Record<string, unknown> }
	>;
	on_click: () => void;
}

export function SessionTreeNode({
	flat_node,
	is_active,
	is_on_path,
	tool_call_map,
	on_click,
}: SessionTreeNodeProps) {
	const entry = flat_node.node.entry;
	const label = flat_node.node.label;
	const prefix = build_tree_prefix(flat_node);

	const display = get_display_text(entry, label, tool_call_map);

	// Tool results and bash executions get a small visual indent
	const is_tool_row =
		entry.type === "message" &&
		((entry as MessageEntry).message.role === "toolResult" ||
			(entry as MessageEntry).message.role === "bashExecution");

	return (
		// biome-ignore lint/a11y/useSemanticElements: div with role="button" for tree node layout
		<div
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter") on_click();
			}}
			className={cn(
				"flex items-baseline cursor-pointer text-[11px] leading-[20px] whitespace-nowrap px-2 font-mono transition-colors duration-75",
				is_active && "font-semibold",
				!is_on_path && "opacity-40 hover:opacity-80",
				is_tool_row && "pl-5",
			)}
			onClick={on_click}
		>
			<span className="text-muted-foreground shrink-0 whitespace-pre">
				{prefix}
			</span>
			<span
				className={cn(
					"shrink-0",
					is_on_path ? "text-primary" : "text-muted-foreground",
				)}
			>
				{is_on_path ? "•" : "\u00a0"}
			</span>
			<span className="ml-1 truncate">
				{label && <span className="text-warning font-medium">[{label}] </span>}
				{display}
			</span>
		</div>
	);
}

function get_display_text(
	entry: SessionEntry,
	_label: string | undefined,
	tool_call_map: Map<
		string,
		{ name: string; arguments: Record<string, unknown> }
	>,
): React.ReactNode {
	const truncate = (s: string, max = 80) =>
		s.length <= max ? s : `${s.slice(0, max)}…`;
	const normalize = (s: string) => s.replace(/[\n\t]/g, " ").trim();

	switch (entry.type) {
		case "message": {
			const msg = (entry as MessageEntry).message;
			if (msg.role === "user") {
				const text = truncate(normalize(extract_text(msg.content)));
				return (
					<>
						<span className="text-primary">user:</span> {text}
					</>
				);
			}
			if (msg.role === "assistant") {
				const text = truncate(normalize(extract_text(msg.content)));
				if (text)
					return (
						<>
							<span className="text-chart-1">asst:</span> {text}
						</>
					);
				if ("stopReason" in msg && msg.stopReason === "aborted")
					return (
						<>
							<span className="text-chart-1">asst:</span>{" "}
							<span className="text-muted-foreground">(aborted)</span>
						</>
					);
				if ("errorMessage" in msg && msg.errorMessage)
					return (
						<>
							<span className="text-chart-1">asst:</span>{" "}
							<span className="text-destructive">
								{truncate(String(msg.errorMessage))}
							</span>
						</>
					);
				return (
					<>
						<span className="text-chart-1">asst:</span>{" "}
						<span className="text-muted-foreground">(no text)</span>
					</>
				);
			}
			if (msg.role === "toolResult") {
				const tc = msg.toolCallId ? tool_call_map.get(msg.toolCallId) : null;
				if (tc)
					return (
						<span className="text-muted-foreground">
							{format_tool_call_label(tc.name, tc.arguments)}
						</span>
					);
				return (
					<span className="text-muted-foreground">
						[{msg.toolName ?? "tool"}]
					</span>
				);
			}
			if (msg.role === "bashExecution") {
				const cmd = truncate(normalize(msg.command || ""));
				return (
					<>
						<span className="text-muted-foreground">[bash]:</span> {cmd}
					</>
				);
			}
			return <span className="text-muted-foreground">[{msg.role}]</span>;
		}
		case "compaction":
			return (
				<span className="text-chart-4">
					[compaction:{" "}
					{Math.round((entry as { tokensBefore: number }).tokensBefore / 1000)}k
					tokens]
				</span>
			);
		case "branch_summary":
			return (
				<>
					<span className="text-chart-2">[branch summary]:</span>{" "}
					{truncate(normalize((entry as { summary: string }).summary || ""))}
				</>
			);
		case "custom_message":
			return (
				<span className="text-chart-5">
					[{(entry as { customType: string }).customType}]
				</span>
			);
		case "model_change":
			return (
				<span className="text-muted-foreground">
					[model: {(entry as { modelId: string }).modelId}]
				</span>
			);
		case "thinking_level_change":
			return (
				<span className="text-muted-foreground">
					[thinking: {(entry as { thinkingLevel: string }).thinkingLevel}]
				</span>
			);
		default:
			return <span className="text-muted-foreground">[{entry.type}]</span>;
	}
}
