import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionPanel } from "@/components/sessions/use-session-panel";
import type { SpanNode } from "../types";

function find_node_in_tree(roots: SpanNode[], id: string): SpanNode | null {
	for (const root of roots) {
		const found = find_node_recursive(root, id);
		if (found) return found;
	}
	return null;
}

function find_node_recursive(node: SpanNode, id: string): SpanNode | null {
	if (node.id === id) return node;
	for (const child of node.children) {
		const found = find_node_recursive(child, id);
		if (found) return found;
	}
	return null;
}

interface UseSpanSelectionOptions {
	roots: SpanNode[];
	panel: SessionPanel | null;
	set_panel: (panel: SessionPanel | null) => void;
}

export function use_span_selection({
	roots,
	panel,
	set_panel,
}: UseSpanSelectionOptions) {
	const [selected_id, set_selected_id] = useState<string | null>(null);

	// Deselect span when panel is closed externally (e.g., via header nav)
	const prev_panel_ref = useRef(panel);
	useEffect(() => {
		if (prev_panel_ref.current === "inspector" && panel !== "inspector") {
			set_selected_id(null);
		}
		prev_panel_ref.current = panel;
	}, [panel]);

	const show_inspector = panel === "inspector" && selected_id !== null;

	// Search the full tree so selection persists when a parent is collapsed
	const selected_node: SpanNode | null = useMemo(() => {
		if (!selected_id) return null;
		return find_node_in_tree(roots, selected_id);
	}, [selected_id, roots]);

	const select = useCallback(
		(id: string) => {
			set_selected_id((prev) => {
				const deselecting = prev === id;
				if (deselecting) {
					set_panel(null);
					return null;
				}
				set_panel("inspector");
				return id;
			});
		},
		[set_panel],
	);

	const deselect = useCallback(() => {
		set_selected_id(null);
		set_panel(null);
	}, [set_panel]);

	return { selected_id, selected_node, show_inspector, select, deselect };
}
