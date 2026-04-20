import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	PathSelectionTarget,
	PathTurn,
} from "@/lib/exploration-path-view-model";
import { resolve_path_selection_target } from "@/lib/exploration-path-view-model";

interface UseExplorationPathStateOptions {
	selected_node_id: string | null;
	path_turns: PathTurn[];
}

export function use_exploration_path_state({
	selected_node_id,
	path_turns,
}: UseExplorationPathStateOptions) {
	const path_selection_target: PathSelectionTarget | null = useMemo(
		() => resolve_path_selection_target(selected_node_id, path_turns),
		[selected_node_id, path_turns],
	);
	const [expanded_turns, set_expanded_turns] = useState<Set<number>>(
		() => new Set<number>(),
	);
	const turn_row_refs = useRef(new Map<number, HTMLDivElement>());
	const action_row_refs = useRef(new Map<string, HTMLButtonElement>());
	const last_scrolled_target_key_ref = useRef<string | null>(null);
	const selected_turn_is_expanded = path_selection_target
		? expanded_turns.has(path_selection_target.turn_index)
		: false;

	const toggle_turn = useCallback((turn_index: number) => {
		set_expanded_turns((previous) => {
			const next = new Set(previous);
			if (next.has(turn_index)) {
				next.delete(turn_index);
			} else {
				next.add(turn_index);
			}
			return next;
		});
	}, []);

	const register_turn_row = useCallback(
		(turn_index: number, element: HTMLDivElement | null) => {
			if (element) {
				turn_row_refs.current.set(turn_index, element);
				return;
			}
			turn_row_refs.current.delete(turn_index);
		},
		[],
	);

	const register_action_row = useCallback(
		(tool_node_id: string, element: HTMLButtonElement | null) => {
			if (element) {
				action_row_refs.current.set(tool_node_id, element);
				return;
			}
			action_row_refs.current.delete(tool_node_id);
		},
		[],
	);

	useEffect(() => {
		if (!path_selection_target || path_selection_target.row_kind !== "action") {
			return;
		}

		set_expanded_turns((previous) => {
			if (previous.has(path_selection_target.turn_index)) return previous;
			const next = new Set(previous);
			next.add(path_selection_target.turn_index);
			return next;
		});
	}, [path_selection_target]);

	useEffect(() => {
		if (!path_selection_target) {
			last_scrolled_target_key_ref.current = null;
			return;
		}
		if (
			path_selection_target.row_kind === "action" &&
			!selected_turn_is_expanded
		) {
			return;
		}

		const target_key =
			path_selection_target.row_kind === "action"
				? `action:${path_selection_target.action_tool_node_id}`
				: `turn:${path_selection_target.turn_index}`;
		if (last_scrolled_target_key_ref.current === target_key) return;

		const target_element =
			path_selection_target.row_kind === "action"
				? path_selection_target.action_tool_node_id
					? action_row_refs.current.get(
							path_selection_target.action_tool_node_id,
						)
					: null
				: turn_row_refs.current.get(path_selection_target.turn_index);
		if (!target_element) return;

		const frame = requestAnimationFrame(() => {
			target_element.scrollIntoView({ block: "nearest" });
			last_scrolled_target_key_ref.current = target_key;
		});

		return () => cancelAnimationFrame(frame);
	}, [path_selection_target, selected_turn_is_expanded]);

	return {
		path_selection_target,
		expanded_turns,
		toggle_turn,
		register_turn_row,
		register_action_row,
	};
}
