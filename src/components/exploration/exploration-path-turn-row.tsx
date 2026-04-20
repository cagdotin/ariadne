import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	Eye,
	FileEdit,
	FilePlus,
	MessageSquare,
	RefreshCw,
	Search,
	Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
	ActionKind,
	PathAction,
	PathTurn,
} from "@/lib/exploration-path-view-model";
import { cn } from "@/lib/utils";

interface ExplorationPathTurnRowProps {
	turn: PathTurn;
	is_expanded: boolean;
	is_selected: boolean;
	selected_action_tool_node_id: string | null;
	highlighted_node_ids: Set<string>;
	has_selection: boolean;
	row_ref: (element: HTMLDivElement | null) => void;
	on_toggle: () => void;
	on_select_turn: () => void;
	on_select_action: (action: PathAction) => void;
	register_action_row: (
		tool_node_id: string,
		element: HTMLButtonElement | null,
	) => void;
}

const action_icons: Record<ActionKind, typeof Search> = {
	search: Search,
	file_read: Eye,
	doc_read: BookOpen,
	file_edit: FileEdit,
	file_write: FilePlus,
	opaque: Terminal,
};

const action_colors: Record<ActionKind, string> = {
	search: "text-amber-500",
	file_read: "text-green-500",
	doc_read: "text-cyan-500",
	file_edit: "text-orange-500",
	file_write: "text-purple-500",
	opaque: "text-muted-foreground",
};

const action_labels: Record<ActionKind, string> = {
	search: "search",
	file_read: "read",
	doc_read: "doc",
	file_edit: "edit",
	file_write: "write",
	opaque: "tool",
};

export function ExplorationPathTurnRow({
	turn,
	is_expanded,
	is_selected,
	selected_action_tool_node_id,
	highlighted_node_ids,
	has_selection,
	row_ref,
	on_toggle,
	on_select_turn,
	on_select_action,
	register_action_row,
}: ExplorationPathTurnRowProps) {
	const is_highlighted =
		has_selection &&
		!is_selected &&
		(highlighted_node_ids.has(turn.user_prompt_node_id) ||
			(turn.turn_node_id !== null &&
				highlighted_node_ids.has(turn.turn_node_id)));

	return (
		<div ref={row_ref} className="border-b border-border/50">
			<div
				className={cn(
					"flex items-start gap-2 px-3 py-2 transition-colors",
					is_selected && "bg-accent",
					is_highlighted && "bg-accent/30",
				)}
			>
				<button
					type="button"
					className="mt-0.5 rounded-sm p-0.5 hover:bg-accent/50"
					onClick={on_toggle}
				>
					{is_expanded ? (
						<ChevronDown className="size-3 text-muted-foreground" />
					) : (
						<ChevronRight className="size-3 text-muted-foreground" />
					)}
				</button>

				<button
					type="button"
					className="-mx-1 flex-1 min-w-0 rounded-sm px-1 text-left hover:bg-accent/30"
					onClick={on_select_turn}
				>
					<div className="flex items-center gap-2">
						<MessageSquare className="size-3 shrink-0 text-blue-500" />
						<span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
							T{turn.turn_index + 1}
						</span>
						<span className="truncate text-xs">{turn.user_message}</span>
					</div>

					<div className="ml-5 mt-1 flex items-center gap-1">
						{turn.summary.searches > 0 && (
							<Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
								{turn.summary.searches} search
							</Badge>
						)}
						{turn.summary.reads > 0 && (
							<Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
								{turn.summary.reads} read
							</Badge>
						)}
						{turn.summary.edits > 0 && (
							<Badge
								variant="outline"
								className="h-4 border-orange-500/30 px-1 py-0 text-[9px] text-orange-600"
							>
								{turn.summary.edits} edit
							</Badge>
						)}
						{turn.summary.writes > 0 && (
							<Badge
								variant="outline"
								className="h-4 border-purple-500/30 px-1 py-0 text-[9px] text-purple-600"
							>
								{turn.summary.writes} write
							</Badge>
						)}
						{turn.summary.opaque > 0 && (
							<Badge variant="secondary" className="h-4 px-1 py-0 text-[9px]">
								{turn.summary.opaque} other
							</Badge>
						)}
					</div>
				</button>
			</div>

			{is_expanded && turn.actions.length > 0 && (
				<div className="space-y-px pb-1.5 pl-7 pr-3">
					{turn.actions.map((action) => (
						<PathActionRow
							key={action.tool_node_id}
							action={action}
							is_selected={selected_action_tool_node_id === action.tool_node_id}
							is_highlighted={
								has_selection &&
								(highlighted_node_ids.has(action.tool_node_id) ||
									(action.target_node_id !== null &&
										highlighted_node_ids.has(action.target_node_id)))
							}
							row_ref={(element) =>
								register_action_row(action.tool_node_id, element)
							}
							on_select={() => on_select_action(action)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function PathActionRow({
	action,
	is_selected,
	is_highlighted,
	row_ref,
	on_select,
}: {
	action: PathAction;
	is_selected: boolean;
	is_highlighted: boolean;
	row_ref: (element: HTMLButtonElement | null) => void;
	on_select: () => void;
}) {
	const Icon = action_icons[action.action_kind];
	const color = action_colors[action.action_kind];

	return (
		<button
			ref={row_ref}
			type="button"
			className={cn(
				"flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left",
				"transition-colors hover:bg-accent/50",
				is_selected && "bg-accent ring-1 ring-primary/20",
				is_highlighted && !is_selected && "bg-primary/5",
				action.precedes_edit && "border-l-2 border-orange-400/60",
			)}
			onClick={on_select}
		>
			<div className="flex items-center gap-1.5">
				<Icon className={cn("size-3 shrink-0", color)} />
			</div>
			<span className="flex-1 min-w-0 truncate text-[11px]">
				{action.target_label ?? action.label}
			</span>
			<div className="flex shrink-0 items-center gap-1">
				{action.is_revisit && (
					<RefreshCw className="size-2.5 text-muted-foreground" />
				)}
				<span className={cn("text-[9px]", color)}>
					{action_labels[action.action_kind]}
				</span>
			</div>
		</button>
	);
}
