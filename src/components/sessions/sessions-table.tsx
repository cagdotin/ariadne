import type { SessionSummary } from "@contracts/sessions/summary";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { use_project_scope } from "@/components/project-scope-provider";
import {
	session_columns,
	session_columns_with_project,
} from "./session-columns";
import { SessionToolbar } from "./session-toolbar";
import { use_responsive_columns } from "./use-responsive-columns";
import { use_session_filters } from "./use-session-filters";

interface SessionsTableProps {
	sessions: SessionSummary[];
	show_toolbar?: boolean;
}

export function SessionsTable({
	sessions,
	show_toolbar = true,
}: SessionsTableProps) {
	const navigate = useNavigate();
	const { scope } = use_project_scope();
	const column_visibility = use_responsive_columns();
	const columns = scope ? session_columns : session_columns_with_project;

	const {
		search,
		set_search,
		selected_tools,
		selected_models,
		available_tools,
		available_models,
		toggle_tool,
		toggle_model,
		clear_all,
		has_active_filters,
		filtered_sessions,
	} = use_session_filters(sessions);

	const handle_row_click = useCallback(
		(session: SessionSummary) => {
			navigate({ to: "/sessions/$id", params: { id: session.id } });
		},
		[navigate],
	);

	return (
		<DataTable
			columns={columns}
			data={show_toolbar ? filtered_sessions : sessions}
			column_visibility={column_visibility}
			on_row_click={handle_row_click}
			toolbar={
				show_toolbar
					? () => (
							<SessionToolbar
								search={search}
								on_search_change={set_search}
								available_tools={available_tools}
								selected_tools={selected_tools}
								on_toggle_tool={toggle_tool}
								available_models={available_models}
								selected_models={selected_models}
								on_toggle_model={toggle_model}
								has_active_filters={has_active_filters}
								on_clear_all={clear_all}
								total_count={sessions.length}
								filtered_count={filtered_sessions.length}
							/>
						)
					: undefined
			}
		/>
	);
}
