import { useCallback, useMemo, useState } from "react";
import { collect_all_ids } from "../trace-transform";
import type { SpanNode } from "../types";

export function use_span_tree_expansion(roots: SpanNode[]) {
	const all_ids = useMemo(() => collect_all_ids(roots), [roots]);
	const [expanded, set_expanded] = useState<Set<string>>(() => new Set());
	const is_all_expanded = expanded.size >= all_ids.size;

	const toggle = useCallback((id: string) => {
		set_expanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggle_all = useCallback(() => {
		if (is_all_expanded) {
			set_expanded(new Set());
		} else {
			set_expanded(new Set(all_ids));
		}
	}, [is_all_expanded, all_ids]);

	return { expanded, is_all_expanded, toggle, toggle_all };
}
