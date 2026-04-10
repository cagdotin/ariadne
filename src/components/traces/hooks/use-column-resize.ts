import { useCallback, useRef, useState } from "react";

const DEFAULT_TREE_WIDTH_PCT = 22;
const MIN_TREE_WIDTH_PCT = 12;
const MAX_TREE_WIDTH_PCT = 50;

export function use_column_resize(
	container_ref: React.RefObject<HTMLDivElement | null>,
) {
	const [tree_width_pct, set_tree_width_pct] = useState(DEFAULT_TREE_WIDTH_PCT);
	const resize_ref = useRef<{ start_x: number; start_pct: number } | null>(
		null,
	);

	// Use a ref to keep the callback stable
	const tree_width_pct_ref = useRef(tree_width_pct);
	tree_width_pct_ref.current = tree_width_pct;

	const handle_divider_mouse_down = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const container = container_ref.current;
			if (!container) return;

			resize_ref.current = {
				start_x: e.clientX,
				start_pct: tree_width_pct_ref.current,
			};

			const handle_mouse_move = (move_e: MouseEvent) => {
				if (!resize_ref.current) return;
				const dx = move_e.clientX - resize_ref.current.start_x;
				const container_width = container.offsetWidth;
				const delta_pct = (dx / container_width) * 100;
				const new_pct = Math.min(
					MAX_TREE_WIDTH_PCT,
					Math.max(
						MIN_TREE_WIDTH_PCT,
						resize_ref.current.start_pct + delta_pct,
					),
				);
				set_tree_width_pct(new_pct);
			};

			const handle_mouse_up = () => {
				resize_ref.current = null;
				document.removeEventListener("mousemove", handle_mouse_move);
				document.removeEventListener("mouseup", handle_mouse_up);
			};

			document.addEventListener("mousemove", handle_mouse_move);
			document.addEventListener("mouseup", handle_mouse_up);
		},
		[container_ref.current],
	); // stable — reads from refs

	return { tree_width_pct, handle_divider_mouse_down };
}
