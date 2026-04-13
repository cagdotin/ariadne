/**
 * Exploration path pane — graph-native left pane.
 *
 * Shows the agent's investigation as a readable turn-by-turn sequence
 * with clear action kinds, revisit markers, and edit-adjacent highlights.
 */

import type { SessionGraphPayload } from "@contracts/graph";
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
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	compute_path_turns,
	type ActionKind,
	type PathAction,
	type PathTurn,
} from "@/lib/exploration-path-view-model";
import { cn } from "@/lib/utils";

interface ExplorationPathProps {
	graph: SessionGraphPayload;
	selected_node_id: string | null;
	highlighted_node_ids: Set<string>;
	on_select_node: (node_id: string) => void;
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

export function ExplorationPath({
	graph,
	selected_node_id,
	highlighted_node_ids,
	on_select_node,
}: ExplorationPathProps) {
	const path_turns = useMemo(() => compute_path_turns(graph), [graph]);

	const [expanded_turns, set_expanded_turns] = useState<Set<number>>(
		() => new Set(path_turns.map((t) => t.turn_index)),
	);

	const toggle_turn = (index: number) => {
		set_expanded_turns((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	if (path_turns.length === 0) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">
					No exploration turns found
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="px-3 py-1.5 border-b border-border flex-none">
				<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Exploration Path
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				{path_turns.map((turn) => (
					<PathTurnRow
						key={turn.turn_index}
						turn={turn}
						is_expanded={expanded_turns.has(turn.turn_index)}
						is_selected={
							selected_node_id === turn.user_prompt_node_id ||
							selected_node_id === turn.turn_node_id
						}
						highlighted_node_ids={highlighted_node_ids}
						has_selection={selected_node_id !== null}
						on_toggle={() => toggle_turn(turn.turn_index)}
						on_select_turn={() => on_select_node(turn.turn_node_id ?? turn.user_prompt_node_id)}
						on_select_action={(action) =>
							on_select_node(action.target_node_id ?? action.tool_node_id)
						}
					/>
				))}
			</div>
		</div>
	);
}

// ── Turn row ────────────────────────────────────────────────────────────────

function PathTurnRow({
	turn,
	is_expanded,
	is_selected,
	highlighted_node_ids,
	has_selection,
	on_toggle,
	on_select_turn,
	on_select_action,
}: {
	turn: PathTurn;
	is_expanded: boolean;
	is_selected: boolean;
	highlighted_node_ids: Set<string>;
	has_selection: boolean;
	on_toggle: () => void;
	on_select_turn: () => void;
	on_select_action: (action: PathAction) => void;
}) {
	const is_highlighted =
		has_selection &&
		!is_selected &&
		(highlighted_node_ids.has(turn.user_prompt_node_id) ||
			(turn.turn_node_id !== null &&
				highlighted_node_ids.has(turn.turn_node_id)));

	return (
		<div className="border-b border-border/50">
			{/* Turn header */}
			<div
				className={cn(
					"flex items-start gap-2 px-3 py-2 transition-colors",
					is_selected && "bg-accent",
					is_highlighted && "bg-accent/30",
				)}
			>
				<button
					type="button"
					className="mt-0.5 shrink-0 hover:bg-accent/50 rounded-sm p-0.5"
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
					className="flex-1 min-w-0 text-left hover:bg-accent/30 rounded-sm px-1 -mx-1"
					onClick={on_select_turn}
				>
					<div className="flex items-center gap-2">
						<MessageSquare className="size-3 text-blue-500 shrink-0" />
						<span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
							T{turn.turn_index + 1}
						</span>
						<span className="text-xs truncate">{turn.user_message}</span>
					</div>

					{/* Turn summary chips */}
					<div className="flex items-center gap-1 mt-1 ml-5">
						{turn.summary.searches > 0 && (
							<Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
								{turn.summary.searches} search
							</Badge>
						)}
						{turn.summary.reads > 0 && (
							<Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
								{turn.summary.reads} read
							</Badge>
						)}
						{turn.summary.edits > 0 && (
							<Badge
								variant="outline"
								className="text-[9px] px-1 py-0 h-4 border-orange-500/30 text-orange-600"
							>
								{turn.summary.edits} edit
							</Badge>
						)}
						{turn.summary.writes > 0 && (
							<Badge
								variant="outline"
								className="text-[9px] px-1 py-0 h-4 border-purple-500/30 text-purple-600"
							>
								{turn.summary.writes} write
							</Badge>
						)}
						{turn.summary.opaque > 0 && (
							<Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
								{turn.summary.opaque} other
							</Badge>
						)}
					</div>
				</button>
			</div>

			{/* Actions list */}
			{is_expanded && turn.actions.length > 0 && (
				<div className="pl-7 pr-3 pb-1.5 space-y-px">
					{turn.actions.map((action, idx) => (
						<PathActionRow
							key={`${action.tool_node_id}-${idx}`}
							action={action}
							is_highlighted={
								has_selection &&
								(highlighted_node_ids.has(action.tool_node_id) ||
									(action.target_node_id !== null &&
										highlighted_node_ids.has(action.target_node_id)))
							}
							on_select={() => on_select_action(action)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ── Action row ──────────────────────────────────────────────────────────────

function PathActionRow({
	action,
	is_highlighted,
	on_select,
}: {
	action: PathAction;
	is_highlighted: boolean;
	on_select: () => void;
}) {
	const Icon = action_icons[action.action_kind];
	const color = action_colors[action.action_kind];

	return (
		<button
			type="button"
			className={cn(
				"w-full flex items-center gap-2 px-2 py-1 rounded-sm text-left",
				"hover:bg-accent/50 transition-colors",
				is_highlighted && "bg-primary/5",
				action.precedes_edit && "border-l-2 border-orange-400/60",
			)}
			onClick={on_select}
		>
			{/* Vertical connector line */}
			<div className="flex items-center gap-1.5">
				<Icon className={cn("size-3 shrink-0", color)} />
			</div>

			{/* Action label */}
			<span className="text-[11px] truncate flex-1 min-w-0">
				{action.target_label ?? action.label}
			</span>

			{/* Markers */}
			<div className="flex items-center gap-1 shrink-0">
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
