// Preload bridge: exposes typed `window.ariadne` API to the renderer process.
// Must be bundled to CJS for Electron sandbox compatibility.

import { contextBridge, ipcRenderer } from "electron";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function invoke_command(
	channel: string,
	payload: Record<string, unknown>,
): Promise<unknown> {
	return ipcRenderer.invoke("ariadne:command", { channel, payload });
}

// Subscription bookkeeping for events.on / events.off
const subscription_listeners = new Map<
	string,
	(
		event: Electron.IpcRendererEvent,
		data: { event: string; payload: unknown },
	) => void
>();
let next_subscription_id = 0;

function generate_subscription_id(): string {
	next_subscription_id += 1;
	return `sub_${next_subscription_id}_${Date.now()}`;
}

// ─── API Surface ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("ariadne", {
	// ── Commands ───────────────────────────────────────────────────────────────
	commands: {
		// ── Analytics ──────────────────────────────────────────────────────────
		analytics: {
			list_projects: () => invoke_command("list_projects", {}),

			get_analytics_overview: (payload: {
				projectPath?: string | null;
				rangeDays?: number | null;
			}) => invoke_command("get_analytics_overview", payload),

			get_session_detail: (payload: { sessionId: string }) =>
				invoke_command("get_session_detail", payload),

			get_all_sessions: (payload: {
				projectPath?: string | null;
				rangeDays?: number | null;
			}) => invoke_command("get_all_sessions", payload),

			resync_sessions: () => invoke_command("resync_sessions", {}),

			get_project_file_stats: (payload: {
				projectPath: string;
				rangeDays?: number | null;
			}) => invoke_command("get_project_file_stats", payload),

			get_time_breakdown: (payload: {
				rangeDays: number;
				projectPath?: string | null;
			}) => invoke_command("get_time_breakdown", payload),

			get_session_entries: (payload: { sessionId: string }) =>
				invoke_command("get_session_entries", payload),

			get_tool_details: (payload: {
				toolName: string;
				projectPath?: string | null;
				rangeDays?: number | null;
			}) => invoke_command("get_tool_details", payload),

			get_file_sizes: (payload: { paths: string[] }) =>
				invoke_command("get_file_sizes", payload),
		},

		// ── QMD ───────────────────────────────────────────────────────────────
		qmd: {
			qmd_list_indexes: () => invoke_command("qmd_list_indexes", {}),

			qmd_create_index: (payload: { name: string }) =>
				invoke_command("qmd_create_index", payload),

			qmd_delete_index: (payload: { name: string }) =>
				invoke_command("qmd_delete_index", payload),

			qmd_rename_index: (payload: { oldName: string; newName: string }) =>
				invoke_command("qmd_rename_index", payload),

			qmd_check_availability: () =>
				invoke_command("qmd_check_availability", {}),

			qmd_get_status: (payload: { index: string }) =>
				invoke_command("qmd_get_status", payload),

			qmd_list_collections: (payload: { index: string }) =>
				invoke_command("qmd_list_collections", payload),

			qmd_get_collection_detail: (payload: { index: string; name: string }) =>
				invoke_command("qmd_get_collection_detail", payload),

			qmd_add_collection: (payload: {
				index: string;
				name: string;
				path: string;
				pattern?: string | null;
			}) => invoke_command("qmd_add_collection", payload),

			qmd_remove_collection: (payload: { index: string; name: string }) =>
				invoke_command("qmd_remove_collection", payload),

			qmd_rename_collection: (payload: {
				index: string;
				oldName: string;
				newName: string;
			}) => invoke_command("qmd_rename_collection", payload),

			qmd_add_context: (payload: {
				index: string;
				collection: string;
				path: string;
				text: string;
			}) => invoke_command("qmd_add_context", payload),

			qmd_remove_context: (payload: {
				index: string;
				collection: string;
				path: string;
			}) => invoke_command("qmd_remove_context", payload),

			qmd_set_global_context: (payload: { index: string; text: string }) =>
				invoke_command("qmd_set_global_context", payload),

			qmd_reindex: (payload: { index: string }) =>
				invoke_command("qmd_reindex", payload),

			qmd_embed: (payload: { index: string }) =>
				invoke_command("qmd_embed", payload),

			qmd_cleanup: (payload: { index: string }) =>
				invoke_command("qmd_cleanup", payload),

			qmd_scan_filesystem: (payload: { index: string; collection: string }) =>
				invoke_command("qmd_scan_filesystem", payload),

			qmd_get_indexed_paths: (payload: { index: string; collection: string }) =>
				invoke_command("qmd_get_indexed_paths", payload),

			qmd_toggle_files: (payload: {
				index: string;
				collection: string;
				repoRoot: string;
				adds: string[];
				removes: string[];
			}) => invoke_command("qmd_toggle_files", payload),

			qmd_search: (payload: {
				index: string;
				query: string;
				collections?: string[] | null;
				limit?: number | null;
			}) => invoke_command("qmd_search", payload),
		},

		// ── QMD Logs ──────────────────────────────────────────────────────────
		qmd_logs: {
			get_qmd_logs: (payload: { projectPath?: string | null }) =>
				invoke_command("get_qmd_logs", payload),

			get_qmd_log_stats: (payload: { projectPath?: string | null }) =>
				invoke_command("get_qmd_log_stats", payload),
		},

		// ── Provider Limits ───────────────────────────────────────────────────
		provider_limits: {
			get_provider_limits: () => invoke_command("get_provider_limits", {}),

			refresh_provider_limits: () =>
				invoke_command("refresh_provider_limits", {}),
		},
	},

	// ── Dialogs ──────────────────────────────────────────────────────────────
	dialogs: {
		pick_directory: (options: { title: string }): Promise<string | null> => {
			return ipcRenderer.invoke("ariadne:dialog", {
				type: "pick_directory",
				options,
			});
		},
	},

	// ── Events ───────────────────────────────────────────────────────────────
	events: {
		on: (channel: string, callback: (payload: unknown) => void): string => {
			const subscription_id = generate_subscription_id();

			const listener = (
				_event: Electron.IpcRendererEvent,
				data: { event: string; payload: unknown },
			) => {
				if (data.event === channel) {
					callback(data.payload);
				}
			};

			subscription_listeners.set(subscription_id, listener);
			ipcRenderer.on("ariadne:event", listener);

			return subscription_id;
		},

		off: (subscription_id: string): void => {
			const listener = subscription_listeners.get(subscription_id);
			if (listener) {
				ipcRenderer.removeListener("ariadne:event", listener);
				subscription_listeners.delete(subscription_id);
			}
		},
	},
});
