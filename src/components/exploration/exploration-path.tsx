/**
 * Exploration path pane — graph-native left pane.
 *
 * Shows the agent's investigation as a readable turn-by-turn sequence
 * with clear action kinds, revisit markers, and edit-adjacent highlights.
 */

import type { SessionGraphPayload } from "@contracts/graph";
import { useMemo } from "react";
import { compute_path_turns } from "@/lib/exploration-path-view-model";
import { ExplorationFraming } from "./exploration-framing";
import { ExplorationPathTurnRow } from "./exploration-path-turn-row";
import { use_exploration_path_state } from "./use-exploration-path-state";

interface ExplorationPathProps {
	graph: SessionGraphPayload;
	selected_node_id: string | null;
	highlighted_node_ids: Set<string>;
	show_ambient?: boolean;
	on_select_node: (node_id: string) => void;
}

export function ExplorationPath({
	graph,
	selected_node_id,
	highlighted_node_ids,
	show_ambient = true,
	on_select_node,
}: ExplorationPathProps) {
	const path_turns = useMemo(() => compute_path_turns(graph), [graph]);
	const {
		path_selection_target,
		expanded_turns,
		toggle_turn,
		register_turn_row,
		register_action_row,
	} = use_exploration_path_state({
		selected_node_id,
		path_turns,
	});

	if (path_turns.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<p className="text-sm text-muted-foreground">
					No exploration turns found
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex-none border-b border-border px-3 py-1.5">
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Exploration Path
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				<ExplorationFraming
					graph={graph}
					selected_node_id={selected_node_id}
					show_ambient={show_ambient}
					on_select_node={(node) => on_select_node(node.id)}
				/>

				{path_turns.map((turn) => (
					<ExplorationPathTurnRow
						key={turn.turn_index}
						turn={turn}
						is_expanded={expanded_turns.has(turn.turn_index)}
						is_selected={
							path_selection_target?.row_kind === "turn" &&
							path_selection_target.turn_index === turn.turn_index
						}
						selected_action_tool_node_id={
							path_selection_target?.row_kind === "action" &&
							path_selection_target.turn_index === turn.turn_index
								? path_selection_target.action_tool_node_id
								: null
						}
						highlighted_node_ids={highlighted_node_ids}
						has_selection={selected_node_id !== null}
						row_ref={(element) => register_turn_row(turn.turn_index, element)}
						on_toggle={() => toggle_turn(turn.turn_index)}
						on_select_turn={() =>
							on_select_node(turn.turn_node_id ?? turn.user_prompt_node_id)
						}
						on_select_action={(action) =>
							on_select_node(action.target_node_id ?? action.tool_node_id)
						}
						register_action_row={register_action_row}
					/>
				))}
			</div>
		</div>
	);
}
