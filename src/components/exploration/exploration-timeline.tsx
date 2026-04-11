import type { ExplorationEvent, ExplorationTurn } from "@contracts/exploration";
import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	Eye,
	FileEdit,
	FilePlus,
	HelpCircle,
	MessageSquare,
	Search,
	Terminal,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SelectionTarget } from "./exploration-selection";

interface ExplorationTimelineProps {
	turns: ExplorationTurn[];
	events: ExplorationEvent[];
	selection: SelectionTarget | null;
	highlight_ids: Set<string>;
	on_select: (target: SelectionTarget | null) => void;
}

const event_icon_map: Record<string, typeof Search> = {
	user_message: MessageSquare,
	turn_boundary: ChevronRight,
	discovery_command: Search,
	file_read: Eye,
	file_edit: FileEdit,
	file_write: FilePlus,
	doc_read: BookOpen,
	opaque_tool: Terminal,
	failed_discovery: XCircle,
};

const event_color_map: Record<string, string> = {
	user_message: "text-blue-500",
	discovery_command: "text-amber-500",
	file_read: "text-green-500",
	file_edit: "text-orange-500",
	file_write: "text-purple-500",
	doc_read: "text-cyan-500",
	opaque_tool: "text-muted-foreground",
	failed_discovery: "text-destructive",
};

export function ExplorationTimeline({
	turns,
	events,
	selection,
	highlight_ids,
	on_select,
}: ExplorationTimelineProps) {
	const [expanded_turns, set_expanded_turns] = useState<Set<number>>(
		() => new Set(turns.map((t) => t.index)),
	);

	const events_by_id = new Map(events.map((e) => [e.id, e]));

	const toggle_turn = (index: number) => {
		set_expanded_turns((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	const is_turn_selected = (turn: ExplorationTurn) =>
		selection?.type === "turn" && selection.turn.index === turn.index;

	const is_event_selected = (event: ExplorationEvent) =>
		selection?.type === "event" && selection.event.id === event.id;

	if (turns.length === 0) {
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
					Exploration Timeline
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				{turns.map((turn) => {
					const is_expanded = expanded_turns.has(turn.index);
					const turn_events = turn.event_ids
						.map((id) => events_by_id.get(id))
						.filter((e): e is ExplorationEvent => e != null);
					const non_user_events = turn_events.filter(
						(e) => e.kind !== "user_message",
					);

					return (
						<div key={turn.index} className="border-b border-border/50">
							{/* Turn header */}
							<button
								type="button"
								className={cn(
									"w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors",
									is_turn_selected(turn) && "bg-accent",
									highlight_ids.has(turn.event_ids[0] ?? "") &&
										selection &&
										!is_turn_selected(turn) &&
										"bg-accent/30",
								)}
								onClick={(e) => {
									if (e.detail === 2) {
										// Double click selects the turn
										on_select({ type: "turn", turn });
									} else {
										toggle_turn(turn.index);
									}
								}}
								onContextMenu={(e) => {
									e.preventDefault();
									on_select({ type: "turn", turn });
								}}
							>
								{is_expanded ? (
									<ChevronDown className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
								) : (
									<ChevronRight className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
								)}
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
											T{turn.index + 1}
										</span>
										<span className="text-xs truncate">
											{turn.user_message_snippet || "User message"}
										</span>
									</div>
									<div className="flex items-center gap-1.5 mt-0.5">
										<span className="text-[10px] text-muted-foreground">
											{non_user_events.length} actions
										</span>
										{turn.artifact_ids.length > 0 && (
											<span className="text-[10px] text-muted-foreground">
												{turn.artifact_ids.length} files
											</span>
										)}
									</div>
								</div>
								<button
									type="button"
									className="shrink-0 text-[10px] text-primary hover:underline mt-0.5"
									onClick={(e) => {
										e.stopPropagation();
										on_select({ type: "turn", turn });
									}}
								>
									select
								</button>
							</button>

							{/* Turn events */}
							{is_expanded && (
								<div className="pl-6 pr-3 pb-1">
									{non_user_events.map((event) => {
										const Icon = event_icon_map[event.kind] ?? HelpCircle;
										const color =
											event_color_map[event.kind] ?? "text-muted-foreground";

										return (
											<button
												key={event.id}
												type="button"
												className={cn(
													"w-full flex items-center gap-2 px-2 py-1 rounded-sm text-left hover:bg-accent/50 transition-colors",
													is_event_selected(event) && "bg-accent",
													highlight_ids.has(event.id) &&
														selection &&
														!is_event_selected(event) &&
														"bg-primary/5",
												)}
												onClick={() => on_select({ type: "event", event })}
											>
												<Icon className={cn("size-3 shrink-0", color)} />
												<span className="text-[11px] truncate flex-1 min-w-0">
													{event.label}
												</span>
												{event.is_error && (
													<XCircle className="size-3 text-destructive shrink-0" />
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
